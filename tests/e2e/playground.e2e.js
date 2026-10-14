import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Concept playground suite: proves /api/playground serves a seeded artifact
// from the database without a model call, that the client renders it inside
// the contractual sandbox, that the sandbox (not the validator) is the
// boundary — against a row that bypassed validation on purpose — and that
// request bounds hold. No Gemini calls.
// Spec: docs/superpowers/specs/2026-10-14-playground-explainer-design.md

function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

// Independently computed to pin the documented formula: drift in either
// implementation makes the seeded row invisible and fails the test.
function cacheKeyFor({
	topic,
	question = '',
	answer = '',
	language = 'english',
	viewport = 'wide',
	budget = 'full',
}) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'pg-v2',
				'prompt-v3',
				'scaffold-v4',
				normalizeText(language).toLowerCase() || 'english',
				normalizeText(topic),
				normalizeText(question),
				normalizeText(answer),
				viewport,
				budget,
			])
		)
		.digest('hex');
}

const CSP_CONTENT =
	"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'";

async function seedExplainer(
	sql,
	{ topic, question = '', answer = '', language = 'english', profile, payload }
) {
	await sql`
		INSERT INTO concept_explainers (cache_key, language, concept, payload, model)
		VALUES (
			${cacheKeyFor({ topic, question, answer, language, ...profile })},
			${language},
			${payload.title},
			${JSON.stringify(payload)}::jsonb,
			'e2e-seed'
		)
		ON CONFLICT (cache_key) DO UPDATE
			SET payload = EXCLUDED.payload,
				last_used_at = NOW()
	`;
}

test('serves a seeded explainer from the database cache without generating', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);

	// The first storage touch runs ensureStorageSchema on the dev server.
	await request.get('/api/test?id=1');

	const topic = 'e2e-playground-cache';
	await seedExplainer(sql, {
		topic,
		payload: {
			title: 'Seeded title',
			summary: 'Seeded summary',
			recipes: ['step-reveal'],
			html: '<p id="e2e-artifact-marker">cached body</p>',
			css: '',
			js: '',
		},
	});

	const body = { topic, theme: 'dark', profile: { viewport: 'wide', budget: 'full' } };
	const before = await sql`
		SELECT use_count FROM concept_explainers WHERE cache_key = ${cacheKeyFor({ topic })}
	`;

	const first = await request.post('/api/playground', { data: body });
	const second = await request.post('/api/playground', { data: body });

	expect(first.status()).toBe(200);
	expect(second.status()).toBe(200);
	const firstPayload = await first.json();
	const secondPayload = await second.json();
	expect(firstPayload.cached).toBe(true);
	expect(secondPayload.cached).toBe(true);
	expect(firstPayload.title).toBe('Seeded title');
	expect(firstPayload.summary).toBe('Seeded summary');
	expect(firstPayload.html.startsWith('<!doctype html>')).toBe(true);
	expect(firstPayload.html).toContain('e2e-artifact-marker');
	expect(firstPayload.html).toContain(`content="${CSP_CONTENT}"`);
	expect(firstPayload.html).toContain('data-theme="dark"');

	const after = await sql`
		SELECT use_count FROM concept_explainers WHERE cache_key = ${cacheKeyFor({ topic })}
	`;
	const useCountDelta = Number(after[0]?.use_count ?? 0) - Number(before[0]?.use_count ?? 0);
	expect(useCountDelta).toBe(2);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			cachedFirst: firstPayload.cached,
			cachedSecond: secondPayload.cached,
			markerServed: firstPayload.html.includes('e2e-artifact-marker'),
			cspServed: firstPayload.html.includes(CSP_CONTENT),
			useCountDelta,
		}),
	});
});

test('renders the artifact flow in the sandboxed frame with height fallbacks', async ({
	page,
}) => {
	const responses = [];
	await page.route('**/api/playground', async (route) => {
		const next = responses.shift();
		if (!next) {
			await route.fulfill({ status: 500, json: { error: 'no stub queued' } });
			return;
		}
		if (next.delayMs) {
			await new Promise((resolve) => setTimeout(resolve, next.delayMs));
		}
		await route.fulfill(next.response);
	});

	const docWithHeight = (marker) =>
		`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>Stub</title></head><body><div id="${marker}">${marker}</div><script>parent.postMessage({ type: 'selftest-explainer-height', height: 400 }, '*');</script></body></html>`;
	const docWithoutHeight = (marker) =>
		`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>Stub</title></head><body><div id="${marker}">${marker}</div></body></html>`;

	await page.goto(
		'/playground?topic=Ohm%20law&question=Why%20does%20V%20equal%20IR%3F&answer=V%20%3D%20IR'
	);
	await expect(page.locator('#playground-topic')).toHaveValue('Ohm law');
	await expect(page.getByText('From your question')).toBeVisible();

	// Happy path: delayed stub shows the honest loading state, then the card.
	responses.push({
		delayMs: 400,
		response: {
			status: 200,
			json: {
				title: 'Stub title',
				summary: 'Stub summary',
				recipes: ['step-reveal'],
				html: docWithHeight('marker-one'),
				cached: false,
			},
		},
	});
	await page.getByRole('button', { name: 'Create explainer' }).click();
	await expect(page.getByText('Planning the explainer…')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Stub title' })).toBeVisible();
	const frame = page.locator('iframe.artifact-frame');
	await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
	await expect(frame).toHaveAttribute('title', 'Stub title');
	await expect(frame).toHaveAttribute('srcdoc', /marker-one/);
	await expect(frame).toHaveAttribute('style', /height: 400px/);

	// Failure then retry with a second artifact: same frame contract holds.
	await page.getByRole('button', { name: 'New concept' }).click();
	responses.push({ response: { status: 500, json: { error: 'stub failure' } } });
	responses.push({
		response: {
			status: 200,
			json: {
				title: 'Second title',
				summary: 'Second summary',
				recipes: [],
				html: docWithHeight('marker-two'),
				cached: true,
			},
		},
	});
	await page.getByRole('button', { name: 'Create explainer' }).click();
	await expect(page.getByText('The explainer could not be created.')).toBeVisible();
	await page.getByRole('button', { name: 'Try Again' }).click();
	await expect(page.getByRole('heading', { name: 'Second title' })).toBeVisible();
	const secondFrame = page.locator('iframe.artifact-frame');
	await expect(secondFrame).toHaveAttribute('srcdoc', /marker-two/);
	await expect(secondFrame).toHaveAttribute('sandbox', 'allow-scripts');
	await expect(secondFrame).toHaveAttribute('style', /height: 400px/);

	// No height message: the frame keeps its fixed fallback height.
	await page.getByRole('button', { name: 'New concept' }).click();
	responses.push({
		response: {
			status: 200,
			json: {
				title: 'Fallback title',
				summary: 's',
				recipes: [],
				html: docWithoutHeight('marker-three'),
				cached: false,
			},
		},
	});
	await page.getByRole('button', { name: 'Create explainer' }).click();
	await expect(page.getByRole('heading', { name: 'Fallback title' })).toBeVisible();
	await page.waitForTimeout(400);
	await expect(page.locator('iframe.artifact-frame')).toHaveAttribute('style', /height: 560px/);
});

test('a seeded hostile artifact cannot reach the app: the sandbox is the boundary', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	const topic = 'e2e-playground-boundary';
	const hostileJs = [
		"try { parent.document.documentElement.setAttribute('data-pwned', '1'); } catch (error) {}",
		"try { fetch('/api/explain', { method: 'POST' }); } catch (error) {}",
		"try { localStorage.setItem('pwned', '1'); } catch (error) {}",
	].join('\n');

	// Seeded directly: this row bypassed validation on purpose, so the test
	// proves the browser boundary rather than the validator. One row per
	// device bucket, since the page sends its own bucket in the request.
	const hostilePayload = {
		title: 'Boundary probe',
		summary: 's',
		recipes: [],
		html: '<div>boundary probe</div>',
		css: '',
		js: hostileJs,
	};
	for (const viewport of ['phone', 'wide']) {
		for (const budget of ['lite', 'full']) {
			await seedExplainer(sql, {
				topic,
				profile: { viewport, budget },
				payload: hostilePayload,
			});
		}
	}

	const requestsAfterLoad = [];
	page.on('request', (requestEvent) => {
		requestsAfterLoad.push(requestEvent.url());
	});

	await page.goto(`/playground?topic=${encodeURIComponent(topic)}`);
	await page.getByRole('button', { name: 'Create explainer' }).click();
	await expect(page.locator('iframe.artifact-frame')).toBeVisible();
	await page.waitForTimeout(800);

	const pwnedAttribute = await page.evaluate(() =>
		document.documentElement.getAttribute('data-pwned')
	);
	const pwnedStorage = await page.evaluate(() => localStorage.getItem('pwned'));
	const explainRequests = requestsAfterLoad.filter((url) => url.includes('/api/explain'));

	expect(pwnedAttribute).toBeNull();
	expect(pwnedStorage).toBeNull();
	expect(explainRequests).toEqual([]);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			pwnedAttribute,
			pwnedStorage,
			explainRequests: explainRequests.length,
			observedRequests: requestsAfterLoad.length,
		}),
	});
});

test('keeps the artifact display inside the phone viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route('**/api/playground', async (route) => {
		await route.fulfill({
			status: 200,
			json: {
				title: 'Responsive artifact',
				summary: 's',
				recipes: [],
				html: '<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div style="width: 1200px">wide</div></body></html>',
				cached: false,
			},
		});
	});

	await page.goto('/playground?topic=Responsive%20check');
	await page.getByRole('button', { name: 'Create explainer' }).click();
	await expect(page.getByRole('heading', { name: 'Responsive artifact' })).toBeVisible();

	const frame = page.locator('iframe.artifact-frame');
	await expect(frame).toBeVisible();
	const box = await frame.boundingBox();
	// The frame never exceeds the phone viewport, and a wide artifact inside
	// it cannot push the parent page sideways.
	expect(box.width).toBeLessThanOrEqual(390);
	expect(box.x).toBeGreaterThanOrEqual(0);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('records a served explainer in the caller library and isolates identities', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	const topic = 'e2e-library-record';
	const clientId = 'e2e-library-client-alpha';
	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Library title',
			summary: 'Library summary',
			recipes: ['step-reveal'],
			html: '<p id="e2e-library-marker">library body</p>',
			css: '',
			js: '',
		},
	});

	// A cache hit is enough to land in the library: the caller received it.
	const served = await request.post('/api/playground', {
		data: { topic, theme: 'light', profile: { viewport: 'wide', budget: 'full' } },
		headers: { 'x-client-id': clientId },
	});
	expect(served.status()).toBe(200);
	expect((await served.json()).cached).toBe(true);

	const listed = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	expect(listed.status()).toBe(200);
	const items = (await listed.json()).items;
	const item = items.find((entry) => entry.concept === 'Library title');
	expect(item).toBeTruthy();
	expect(item.title).toBe('Library title');
	expect(item.language).toBe('english');

	// Another device sees none of it.
	const otherIdentity = await request.get('/api/playground/library', {
		headers: { 'x-client-id': 'e2e-library-client-beta' },
	});
	const otherItems = (await otherIdentity.json()).items;
	expect(otherItems.some((entry) => entry.concept === 'Library title')).toBe(false);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			listed: items.length,
			itemFound: Boolean(item),
			isolatedFromOtherIdentity: !otherItems.some(
				(entry) => entry.concept === 'Library title'
			),
		}),
	});
});

test('opens a saved explainer from the cache and counts the open', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	const topic = 'e2e-library-open';
	const clientId = 'e2e-library-client-gamma';
	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Open me',
			summary: 's',
			recipes: [],
			html: '<p id="e2e-open-marker">open body</p>',
			css: '',
			js: '',
		},
	});
	await request.post('/api/playground', {
		data: { topic, theme: 'light', profile: { viewport: 'wide', budget: 'full' } },
		headers: { 'x-client-id': clientId },
	});

	const listed = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	const item = (await listed.json()).items.find((entry) => entry.title === 'Open me');
	expect(item).toBeTruthy();

	const opened = await request.get(`/api/playground/library?id=${item.id}&theme=dark`, {
		headers: { 'x-client-id': clientId },
	});
	expect(opened.status()).toBe(200);
	const payload = await opened.json();
	expect(payload.cached).toBe(true);
	expect(payload.html.startsWith('<!doctype html>')).toBe(true);
	expect(payload.html).toContain('e2e-open-marker');
	expect(payload.html).toContain('data-theme="dark"');

	// Another identity cannot open it by guessing the id.
	const stranger = await request.get(`/api/playground/library?id=${item.id}`, {
		headers: { 'x-client-id': 'e2e-library-client-delta' },
	});
	expect(stranger.status()).toBe(404);

	const relisted = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	const reopened = (await relisted.json()).items.find((entry) => entry.title === 'Open me');
	expect(reopened.openCount).toBe(1);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			openedCached: payload.cached,
			themeServed: payload.html.includes('data-theme="dark"'),
			strangerStatus: stranger.status(),
			openCount: reopened.openCount,
		}),
	});
});

test('publishes each explainer at a unique slug URL with a shareable page', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	const topic = 'e2e-public-explainer';
	const clientId = 'e2e-public-client';
	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Public Slug Title',
			summary: 'Public summary text',
			recipes: [],
			html: '<p id="e2e-public-marker">public body</p>',
			css: '',
			js: '',
		},
	});

	// The served artifact carries its deterministic slug (the seeded row had
	// none; the hit path backfills it, which is also the legacy-row path).
	const served = await request.post('/api/playground', {
		data: { topic, theme: 'light', profile: { viewport: 'wide', budget: 'full' } },
		headers: { 'x-client-id': clientId },
	});
	expect(served.status()).toBe(200);
	const body = await served.json();
	expect(body.slug).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/);

	const page = await request.get(`/explain/${body.slug}`);
	expect(page.status()).toBe(200);
	const html = await page.text();
	expect(html).toContain('Public Slug Title');
	expect(html).toContain('Public summary text');
	expect(html).toContain(`rel="canonical" href="https://www.selftest.in/explain/${body.slug}"`);
	expect(html).toContain(`href="https://www.selftest.in/hi/explain/${body.slug}"`);
	expect(html).toContain('sandbox="allow-scripts"');
	expect(html).toMatch(/Share\s*<\/button>/);

	const hindi = await request.get(`/hi/explain/${body.slug}`);
	expect(hindi.status()).toBe(200);
	expect(await hindi.text()).toContain('Public Slug Title');

	const missing = await request.get('/explain/definitely-missing-00000000');
	expect(missing.status()).toBe(404);

	// The library row exposes the same slug so sharing works from there too.
	const listed = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	const item = (await listed.json()).items.find((entry) => entry.title === 'Public Slug Title');
	expect(item.slug).toBe(body.slug);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			slug: body.slug,
			publicStatus: page.status(),
			canonicalServed: html.includes(
				`rel="canonical" href="https://www.selftest.in/explain/${body.slug}"`
			),
			hindiTwinStatus: hindi.status(),
			missingStatus: missing.status(),
			librarySlugMatches: item.slug === body.slug,
		}),
	});
});

test('rejects malformed playground requests', async ({ request }) => {
	const missingTopic = await request.post('/api/playground', { data: { question: 'Q' } });
	expect(missingTopic.status()).toBe(400);
	expect((await missingTopic.json()).code).toBe('PLAYGROUND_FIELDS_REQUIRED');

	const tooLong = await request.post('/api/playground', { data: { topic: 'x'.repeat(501) } });
	expect(tooLong.status()).toBe(400);
	expect((await tooLong.json()).code).toBe('PLAYGROUND_FIELDS_TOO_LONG');

	const badLanguage = await request.post('/api/playground', {
		data: { topic: 'x', language: 'klingon' },
	});
	expect(badLanguage.status()).toBe(400);
	expect((await badLanguage.json()).code).toBe('INVALID_LANGUAGE');
});
