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

// Independently computed visual-fit verdict key: the same content-addressed
// formula as src/lib/server/visualFitCache.js, so only the seeded verdict can
// answer the gate and a miss degrades or generates instead.
function visualFitCacheKeyFor({ topic, question = '', answer = '', language = 'english' }) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'vf-v1',
				normalizeText(language).toLowerCase() || 'english',
				normalizeText(topic),
				normalizeText(question),
				normalizeText(answer),
			])
		)
		.digest('hex');
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
				'prompt-v5',
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
	await expect(page.getByText('Checking if a visual helps...')).toBeVisible();
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
	// The shareable page is not a dead end: its header sends visitors on to the
	// playground, in the language the page is being read in.
	expect(html).toMatch(
		/<a[^>]*class="[^"]*btn[^"]*"[^>]*href="\/playground"[^>]*>\s*Create your own explainer\s*<\/a>/
	);

	const hindi = await request.get(`/hi/explain/${body.slug}`);
	expect(hindi.status()).toBe(200);
	const hindiHtml = await hindi.text();
	expect(hindiHtml).toContain('Public Slug Title');
	expect(hindiHtml).toMatch(
		/<a[^>]*class="[^"]*btn[^"]*"[^>]*href="\/hi\/playground"[^>]*>\s*अपना एक्सप्लेनर बनाएँ\s*<\/a>/
	);

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
			ctaEnglishHref: /href="\/playground"[^>]*>\s*Create your own explainer\s*<\/a>/.test(
				html
			),
			ctaHindiHref: /href="\/hi\/playground"[^>]*>\s*अपना एक्सप्लेनर बनाएँ\s*<\/a>/.test(
				hindiHtml
			),
			missingStatus: missing.status(),
			librarySlugMatches: item.slug === body.slug,
		}),
	});
});

test('lists the caller library newest-created first with created timestamps', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	const clientId = 'e2e-order-client';
	await sql`
		INSERT INTO user_explainers (client_id, cache_key, concept, title, summary, language, created_at, last_opened_at)
		VALUES
			(${clientId}, 'e2e-order-old', 'Old concept', 'Older Explainer', 's', 'english', NOW() - INTERVAL '2 days', NOW()),
			(${clientId}, 'e2e-order-new', 'New concept', 'Newer Explainer', 's', 'english', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')
	`;

	const response = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	expect(response.status()).toBe(200);
	const items = (await response.json()).items;
	expect(items.map((entry) => entry.title)).toEqual(['Newer Explainer', 'Older Explainer']);
	expect(items[0].createdAt).toBeTruthy();
	expect(items.every((entry) => entry.mine === true)).toBe(true);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ order: items.map((entry) => entry.title) }),
	});
});

test('search finds own and public explainers without generating', async ({ request }, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	const clientId = 'e2e-search-client';
	const topic = 'e2e-search-topic';
	// Seed the shared cache, then serve it once so it gets a slug and lands in
	// this client's library.
	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Searchable Exoplanets',
			summary: 'Find me',
			recipes: [],
			html: '<p id="e2e-search-marker">x</p>',
			css: '',
			js: '',
		},
	});
	const served = await request.post('/api/playground', {
		data: { topic, theme: 'light', profile: { viewport: 'wide', budget: 'full' } },
		headers: { 'x-client-id': clientId },
	});
	const { slug } = await served.json();
	expect(slug).toBeTruthy();

	// A different identity finds the same artifact as a public row.
	const publicSearch = await request.get('/api/playground/library?q=Exoplanet', {
		headers: { 'x-client-id': 'e2e-search-other' },
	});
	const publicItems = (await publicSearch.json()).items;
	const publicMatch = publicItems.find((entry) => entry.slug === slug);
	expect(publicMatch).toBeTruthy();
	expect(publicMatch.mine).toBe(false);
	expect(publicMatch.id).toBeNull();

	// The owner sees it once, as theirs (deduped across the two sources).
	const ownSearch = await request.get('/api/playground/library?q=Exoplanet', {
		headers: { 'x-client-id': clientId },
	});
	const ownItems = (await ownSearch.json()).items.filter((entry) => entry.slug === slug);
	expect(ownItems).toHaveLength(1);
	expect(ownItems[0].mine).toBe(true);

	const noMatch = await request.get('/api/playground/library?q=zzzznomatch', {
		headers: { 'x-client-id': clientId },
	});
	expect((await noMatch.json()).items).toEqual([]);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			slug,
			publicMatch: publicMatch.mine === false,
			ownMatches: ownItems.length,
			emptyForUnknown: true,
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

// --- The Jev visual-fit gate, question source recording, and provenance in
// the library list. The judge only runs on cache misses with a real key, so
// every spec here seeds its verdict/explainer and stays provider-free. Spec:
// docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md

test('refuses an unworthy topic from the seeded verdict without generating', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const topic = 'e2e-fit-refuse';
	const clientId = 'e2e-fit-client';
	// The first storage touch runs ensureStorageSchema on the dev server. The
	// library read keeps this warmup off the /api/test bucket the suite shares.
	await request.get('/api/playground/library', { headers: { 'x-client-id': clientId } });

	const verdictKey = visualFitCacheKeyFor({ topic });
	const explainerKey = cacheKeyFor({ topic });

	await sql`
		INSERT INTO question_visual_fits (cache_key, language, category, confidence, model)
		VALUES (${verdictKey}, 'english', 'not_visual', 0.9, 'e2e-seed')
		ON CONFLICT (cache_key) DO UPDATE
			SET category = EXCLUDED.category,
				confidence = EXCLUDED.confidence,
				model = EXCLUDED.model
	`;

	// Six refused posts, because the generation quota is 5/min: a refusal path
	// that spent that quota would 429 the sixth request. The seeded verdict
	// keeps every one of them provider-free.
	const attempts = 6;
	const bodies = [];
	const statuses = [];
	for (let index = 0; index < attempts; index += 1) {
		const response = await request.post('/api/playground', {
			data: { topic, profile: { viewport: 'wide', budget: 'full' } },
			headers: { 'x-client-id': clientId },
		});
		statuses.push(response.status());
		bodies.push(await response.json());
	}

	// Every refusal is a 200 with the same full body: a code and the category,
	// no title, no html.
	expect(statuses).toEqual(Array(attempts).fill(200));
	for (const body of bodies) {
		expect(body).toEqual({ code: 'VISUAL_NOT_WORTHY', category: 'not_visual' });
	}

	// A refusal spends nothing: no explainer row was ever written.
	const counted = await sql`
		SELECT COUNT(*) AS count FROM concept_explainers WHERE cache_key = ${explainerKey}
	`;
	const explainerRows = Number(counted[0]?.count ?? 0);
	expect(explainerRows).toBe(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			attempts,
			statuses,
			firstBody: bodies[0],
			explainerRows,
			verdictKey,
		}),
	});
});

test('links a served explainer to its question and lists the source', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const topic = 'e2e-link-serve';
	const clientId = 'e2e-src-client';
	// The first storage touch runs ensureStorageSchema on the dev server. The
	// library read keeps this warmup off the /api/test bucket the suite shares.
	await request.get('/api/playground/library', { headers: { 'x-client-id': clientId } });

	const testId = 'e2e-src-test';
	const questionIndex = 4;
	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Linked Served',
			summary: 's',
			recipes: [],
			html: '<p id="e2e-link-serve-marker">linked</p>',
			css: '',
			js: '',
		},
	});

	const served = await request.post('/api/playground', {
		data: {
			topic,
			theme: 'light',
			profile: { viewport: 'wide', budget: 'full' },
			source: { testId, questionIndex },
		},
		headers: { 'x-client-id': clientId },
	});
	expect(served.status()).toBe(200);
	const servedBody = await served.json();
	expect(servedBody.cached).toBe(true);
	expect(servedBody.title).toBe('Linked Served');

	const links = await sql`
		SELECT test_id, question_index, question_key, cache_key
		FROM question_explainer_links
		WHERE client_id = ${clientId} AND test_id = ${testId}
	`;
	expect(links).toHaveLength(1);
	expect(links[0].test_id).toBe(testId);
	expect(Number(links[0].question_index)).toBe(questionIndex);
	expect(links[0].cache_key).toBe(cacheKeyFor({ topic }));
	// The request carried no question/answer, so the link key is the empty
	// pair: proof the stored key came through buildQuestionLinkKey.
	expect(links[0].question_key).toBe('::');

	const listed = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	expect(listed.status()).toBe(200);
	const item = (await listed.json()).items.find((entry) => entry.title === 'Linked Served');
	expect(item).toBeTruthy();
	expect(item.source).toEqual({ testId, questionIndex });

	const servedLinks = await request.get(`/api/playground/links?testId=${testId}`, {
		headers: { 'x-client-id': clientId },
	});
	expect(servedLinks.status()).toBe(200);
	const linkItems = (await servedLinks.json()).items;
	expect(linkItems).toHaveLength(1);
	expect(linkItems[0].questionIndex).toBe(questionIndex);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			servedStatus: served.status(),
			cached: servedBody.cached,
			linkRows: links.length,
			storedQuestionIndex: Number(links[0].question_index),
			storedCacheKeyMatches: links[0].cache_key === cacheKeyFor({ topic }),
			librarySource: item.source,
			linkItems: linkItems.length,
		}),
	});
});

test('ignores a malformed source instead of failing the serve', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const topic = 'e2e-link-malformed';
	const clientId = 'e2e-src-malformed-client';
	// The first storage touch runs ensureStorageSchema on the dev server. The
	// library read keeps this warmup off the /api/test bucket the suite shares.
	await request.get('/api/playground/library', { headers: { 'x-client-id': clientId } });

	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Malformed Served',
			summary: 's',
			recipes: [],
			html: '<p id="e2e-link-malformed-marker">served</p>',
			css: '',
			js: '',
		},
	});

	const served = await request.post('/api/playground', {
		data: {
			topic,
			theme: 'light',
			profile: { viewport: 'wide', budget: 'full' },
			source: { testId: 123, questionIndex: 'x' },
		},
		headers: { 'x-client-id': clientId },
	});
	expect(served.status()).toBe(200);
	const servedBody = await served.json();
	expect(servedBody.cached).toBe(true);
	expect(servedBody.title).toBe('Malformed Served');

	const linkRows = await sql`
		SELECT COUNT(*) AS count FROM question_explainer_links WHERE client_id = ${clientId}
	`;
	const links = Number(linkRows[0]?.count ?? 0);

	const listed = await request.get('/api/playground/library', {
		headers: { 'x-client-id': clientId },
	});
	const item = (await listed.json()).items.find((entry) => entry.title === 'Malformed Served');
	expect(links).toBe(0);
	expect(item.source).toBeNull();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			servedStatus: served.status(),
			cached: servedBody.cached,
			linkRows: links,
			librarySource: item.source,
		}),
	});
});

// --- Playground client surfaces: the Judging stage, the refusal guidance
// panel, and the library provenance chip. Every spec stubs /api/playground or
// seeds through it, so no run can reach a model. Spec:
// docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md §7.2

test('shows the judging stage, then planning, on a slow generation', async ({ page }, testInfo) => {
	await page.route('**/api/playground', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 4000));
		await route.fulfill({
			status: 200,
			json: {
				title: 'Judged title',
				summary: 's',
				recipes: [],
				html: '<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>Stub</title></head><body><div id="e2e-judging-marker">judged</div></body></html>',
				cached: false,
			},
		});
	});

	// Hydration gate: onMount runs the URL prefill and fires the library fetch,
	// so wait for that fetch before typing (a pre-hydration fill would be reset
	// by the prefill assignment).
	const hydrated = page.waitForResponse((response) =>
		response.url().includes('/api/playground/library')
	);
	await page.goto('/playground');
	await hydrated;
	await page.locator('#playground-topic').fill('Judging stage topic');
	await page.getByRole('button', { name: 'Create explainer' }).click();

	// The judge runs first: Judging is the honest first stage, and Planning
	// appears on the 2000 ms flip; the stub answers at 4000 ms, so the planning
	// copy is observable for a full two seconds instead of half a second.
	await expect(page.getByText('Checking if a visual helps...')).toBeVisible();
	await expect(page.getByText('Planning the explainer…')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Judged title' })).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ judgingCopy: true, planningCopy: true, artifact: 'Judged title' }),
	});
});

test('guides on a refused topic and generates once the topic is refined', async ({
	page,
}, testInfo) => {
	let refuse = true;
	await page.route('**/api/playground', async (route) => {
		if (refuse) {
			await route.fulfill({
				status: 200,
				json: { code: 'VISUAL_NOT_WORTHY', category: 'too_vague' },
			});
			return;
		}
		await route.fulfill({
			status: 200,
			json: {
				title: 'Refined artifact',
				summary: 's',
				recipes: [],
				html: '<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>Stub</title></head><body><div id="e2e-refined-marker">refined</div></body></html>',
				cached: false,
			},
		});
	});

	// Hydration gate: onMount runs the URL prefill and fires the library fetch,
	// so wait for that fetch before typing (a pre-hydration fill would be reset
	// by the prefill assignment).
	const hydrated = page.waitForResponse((response) =>
		response.url().includes('/api/playground/library')
	);
	await page.goto('/playground');
	await hydrated;
	await page.locator('#playground-topic').fill('Something vague');
	await page.getByRole('button', { name: 'Create explainer' }).click();

	// A refusal is guidance, not an error: the bordered panel renders its
	// category hint, the red error alert never does, and no artifact was
	// built or charged for.
	await expect(page.getByText("A visual won't add much here")).toBeVisible();
	await expect(
		page.getByText('Add what you want to see: the process, the change, or the relationship.')
	).toBeVisible();
	await expect(page.locator('.alert-danger')).toHaveCount(0);
	await expect(page.locator('iframe.artifact-frame')).toHaveCount(0);

	// The topic stayed editable and the button enabled: refine in place and
	// the very next Generate goes through.
	refuse = false;
	await page.locator('#playground-topic').fill('A process with clear change over time');
	await expect(page.getByRole('button', { name: 'Create explainer' })).toBeEnabled();
	await page.getByRole('button', { name: 'Create explainer' }).click();
	await expect(page.getByRole('heading', { name: 'Refined artifact' })).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			refusalPanel: true,
			errorAlertAbsent: true,
			artifactBuilt: true,
			topicStayedEditable: true,
		}),
	});
});

test('shows the From your test chip on a linked library item', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const topic = 'e2e-prov-chip';
	const clientId = 'e2e-prov-client';
	// The first storage touch runs ensureStorageSchema on the dev server. The
	// library read keeps this warmup off the /api/test bucket the suite shares.
	await request.get('/api/playground/library', { headers: { 'x-client-id': clientId } });

	const testId = 'e2e-src-test';
	const questionIndex = 4;
	await seedExplainer(sql, {
		topic,
		profile: { viewport: 'wide', budget: 'full' },
		payload: {
			title: 'Provenance served',
			summary: 's',
			recipes: [],
			html: '<p id="e2e-prov-marker">prov</p>',
			css: '',
			js: '',
		},
	});

	// Serving with a source records the question link; the library list turns
	// that link into the provenance chip (same seeding path as the
	// linked-serve spec above, a different identity).
	const served = await request.post('/api/playground', {
		data: {
			topic,
			theme: 'light',
			profile: { viewport: 'wide', budget: 'full' },
			source: { testId, questionIndex },
		},
		headers: { 'x-client-id': clientId },
	});
	expect(served.status()).toBe(200);

	await page.addInitScript((value) => {
		window.localStorage.setItem('selftest_client_id', value);
	}, clientId);
	await page.goto('/playground');

	const chip = page.getByRole('link', { name: 'From your test' });
	await expect(chip).toBeVisible();
	const href = (await chip.getAttribute('href')) || '';
	expect(href).toContain(`/results?id=${testId}#question-${questionIndex}`);
	// The chip is a sibling of the row button, never inside it: interactive
	// content in a button is invalid markup and would join the button's
	// accessible name.
	await expect(page.locator('.playground-library-item a')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /From your test/ })).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ chipVisible: true, href, anchorsInsideRowButton: 0 }),
	});
});
