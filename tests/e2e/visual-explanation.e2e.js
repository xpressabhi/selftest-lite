import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';
import { MAX_QUESTION_TEXT_LENGTH } from '../../src/lib/server/quizConfig.js';

// Inline visual explanations: the visual-fit verdict endpoint review cards
// call before offering to build a visual. These specs pin the request contract
// (required fields, length caps, language) and the content-addressed cache
// hit, which is provider-independent: a seeded verdict must be served without
// any judge call, with or without a TypeSafe key in the environment.
// Spec: docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md

const CLIENT_ID = 'e2e-visual-fit-client';

function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

// Independently computed to pin the documented formula: drift in either
// implementation makes the seeded row invisible and fails the test.
function cacheKeyFor({ topic, question, answer, language = 'english' }) {
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

test('rejects a visual-fit request without a question', async ({ request }, testInfo) => {
	const response = await request.post('/api/visual-fit', {
		data: { answer: 'A' },
		headers: { 'x-client-id': CLIENT_ID },
	});

	expect(response.status()).toBe(400);
	const body = await response.json();
	expect(body.code).toBe('VISUAL_FIT_FIELDS_REQUIRED');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ status: response.status(), code: body.code }),
	});
});

test('rejects oversized visual-fit fields and unknown languages', async ({ request }, testInfo) => {
	const tooLong = await request.post('/api/visual-fit', {
		data: { question: 'x'.repeat(MAX_QUESTION_TEXT_LENGTH + 1), answer: 'A' },
		headers: { 'x-client-id': CLIENT_ID },
	});
	expect(tooLong.status()).toBe(400);
	const tooLongBody = await tooLong.json();
	expect(tooLongBody.code).toBe('VISUAL_FIT_FIELDS_TOO_LONG');

	const badLanguage = await request.post('/api/visual-fit', {
		data: { question: 'Q?', answer: 'A', language: 'klingon' },
		headers: { 'x-client-id': CLIENT_ID },
	});
	expect(badLanguage.status()).toBe(400);
	const badLanguageBody = await badLanguage.json();
	expect(badLanguageBody.code).toBe('INVALID_LANGUAGE');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			tooLongStatus: tooLong.status(),
			tooLongCode: tooLongBody.code,
			badLanguageStatus: badLanguage.status(),
			badLanguageCode: badLanguageBody.code,
		}),
	});
});

test('serves a seeded verdict from the content-addressed cache without judging', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// The first storage touch runs ensureStorageSchema on the dev server. The
	// library read keeps this warmup off the /api/test bucket the whole suite
	// shares, so this spec adds no pressure to it.
	await request.get('/api/playground/library', { headers: { 'x-client-id': CLIENT_ID } });

	const topic = 'e2e-fit-topic';
	const question = 'Q?';
	const answer = 'A';
	const cacheKey = cacheKeyFor({ topic, question, answer });

	await sql`
		INSERT INTO question_visual_fits (cache_key, language, category, confidence, model)
		VALUES (${cacheKey}, 'english', 'worth_it', 0.9, 'e2e-seed')
		ON CONFLICT (cache_key) DO UPDATE
			SET category = EXCLUDED.category,
				confidence = EXCLUDED.confidence,
				model = EXCLUDED.model
	`;

	const response = await request.post('/api/visual-fit', {
		data: { topic, question, answer },
		headers: { 'x-client-id': CLIENT_ID },
	});
	expect(response.status()).toBe(200);

	const body = await response.json();
	// The seeded verdict is the only source of this answer: a cache miss would
	// judge (or degrade without a TypeSafe key), so this stays deterministic.
	expect(body).toEqual({
		suggested: true,
		category: 'worth_it',
		confidence: 0.9,
		cached: true,
		degraded: false,
	});

	const used = await sql`
		SELECT use_count FROM question_visual_fits WHERE cache_key = ${cacheKey}
	`;
	expect(Number(used[0]?.use_count)).toBe(1);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			status: response.status(),
			served: body,
			seededCacheKey: cacheKey,
			useCount: Number(used[0]?.use_count),
		}),
	});
});

// --- GET /api/playground/links: the owner-only read the results page makes
// once per test to learn which questions already have a visual explainer. The
// specs pin the item shape and no-store, identity isolation, and the testId
// bounds. Spec:
// docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md §4.3

const LINKS_CLIENT_ID = 'e2e-links-alpha';

// Independently computed to pin the documented playground tuple: drift in
// either implementation makes the seeded rows invisible and fails the test.
function explainerCacheKeyFor({
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

// One linked explainer for one identity: the shared cache row, the caller's
// library row, and the pointer tying one question of one test to it. The slug
// is seeded rather than backfilled by /api/playground, so the response contract
// is pinned to the stored value.
async function seedLinkedExplainer(
	sql,
	{ clientId, testId, topic = 'e2e-links-topic', questionIndex = 2 }
) {
	const cacheKey = explainerCacheKeyFor({ topic });
	const slug = 'e2e-links-slug-0000abcd';

	await sql`
		INSERT INTO concept_explainers (cache_key, language, concept, payload, model, slug)
		VALUES (
			${cacheKey},
			'english',
			'Linked title',
			${JSON.stringify({
				title: 'Linked title',
				summary: 'Linked summary',
				recipes: ['step-reveal'],
				html: '<p id="e2e-links-marker">linked body</p>',
				css: '',
				js: '',
			})}::jsonb,
			'e2e-seed',
			${slug}
		)
		ON CONFLICT (cache_key) DO UPDATE
			SET slug = EXCLUDED.slug,
				payload = EXCLUDED.payload,
				last_used_at = NOW()
	`;

	const library = await sql`
		INSERT INTO user_explainers (user_id, client_id, cache_key, concept, title, summary, language)
		VALUES (NULL, ${clientId}, ${cacheKey}, 'Linked title', 'Linked title', 'Linked summary', 'english')
		ON CONFLICT (client_id, cache_key) WHERE user_id IS NULL DO UPDATE
			SET title = EXCLUDED.title,
				summary = EXCLUDED.summary,
				last_opened_at = NOW()
		RETURNING id
	`;

	await sql`
		INSERT INTO question_explainer_links (user_id, client_id, test_id, question_index, question_key, cache_key)
		VALUES (NULL, ${clientId}, ${testId}, ${questionIndex}, 'E2E linked question::A', ${cacheKey})
		ON CONFLICT (client_id, test_id, question_index) WHERE user_id IS NULL DO UPDATE
			SET cache_key = EXCLUDED.cache_key,
				question_key = EXCLUDED.question_key,
				updated_at = NOW()
	`;

	return { cacheKey, slug, libraryId: Number(library[0].id) };
}

test('serves the caller question links for one test with no-store', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// Schema warmup on the library bucket, not the suite-shared /api/test one.
	await request.get('/api/playground/library', { headers: { 'x-client-id': LINKS_CLIENT_ID } });

	const testId = 'e2e-links-test';
	const { slug, libraryId } = await seedLinkedExplainer(sql, {
		clientId: LINKS_CLIENT_ID,
		testId,
	});

	const response = await request.get(`/api/playground/links?testId=${testId}`, {
		headers: { 'x-client-id': LINKS_CLIENT_ID },
	});
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('no-store');

	const body = await response.json();
	expect(body.items).toHaveLength(1);
	// toEqual pins the full item shape: the five contract keys, no more.
	expect(body.items[0]).toEqual({
		questionIndex: 2,
		libraryId,
		slug,
		title: 'Linked title',
		createdAt: expect.any(String),
	});

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			status: response.status(),
			cacheControl: response.headers()['cache-control'],
			items: body.items,
			seededLibraryId: libraryId,
			seededSlug: slug,
		}),
	});
});

test('keeps one device question links invisible to another identity', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// Schema warmup on the library bucket, not the suite-shared /api/test one.
	await request.get('/api/playground/library', { headers: { 'x-client-id': LINKS_CLIENT_ID } });

	const testId = 'e2e-links-isolation';
	await seedLinkedExplainer(sql, { clientId: LINKS_CLIENT_ID, testId });

	// The owner sees the seeded link, so an empty stranger read below means
	// isolation rather than missing data.
	const owner = await request.get(`/api/playground/links?testId=${testId}`, {
		headers: { 'x-client-id': LINKS_CLIENT_ID },
	});
	expect(owner.status()).toBe(200);
	const ownerItems = (await owner.json()).items;
	expect(ownerItems).toHaveLength(1);

	const stranger = await request.get(`/api/playground/links?testId=${testId}`, {
		headers: { 'x-client-id': 'e2e-links-beta' },
	});
	expect(stranger.status()).toBe(200);
	const strangerBody = await stranger.json();
	expect(strangerBody).toEqual({ items: [] });

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			ownerStatus: owner.status(),
			ownerItems: ownerItems.length,
			strangerStatus: stranger.status(),
			strangerItems: strangerBody.items.length,
		}),
	});
});

test('rejects a links read without a testId', async ({ request }, testInfo) => {
	const missing = await request.get('/api/playground/links', {
		headers: { 'x-client-id': LINKS_CLIENT_ID },
	});
	expect(missing.status()).toBe(400);
	const missingBody = await missing.json();
	expect(missingBody.code).toBe('LINKS_TESTID_REQUIRED');

	// Whitespace-only trims to empty and is rejected the same way.
	const blank = await request.get('/api/playground/links?testId=%20%20', {
		headers: { 'x-client-id': LINKS_CLIENT_ID },
	});
	expect(blank.status()).toBe(400);
	const blankBody = await blank.json();
	expect(blankBody.code).toBe('LINKS_TESTID_REQUIRED');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			missingStatus: missing.status(),
			missingCode: missingBody.code,
			blankStatus: blank.status(),
			blankCode: blankBody.code,
		}),
	});
});

test('rejects an oversized links testId', async ({ request }, testInfo) => {
	const oversized = await request.get(`/api/playground/links?testId=${'x'.repeat(200)}`, {
		headers: { 'x-client-id': LINKS_CLIENT_ID },
	});
	expect(oversized.status()).toBe(400);
	const body = await oversized.json();
	expect(body.code).toBe('LINKS_TESTID_REQUIRED');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			testIdLength: 200,
			status: oversized.status(),
			code: body.code,
		}),
	});
});

// --- The review card's visual section: one-tap build, inline embed, restored
// links, and the hash deep link. The specs drive the real page against seeded
// localStorage history; the DB is only touched for the seeded/linked cases and
// the build POST is stubbed, so no spec can reach a model.
// Spec: docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md §7.1

const CARD_CLIENT_ID = 'e2e-visual-alpha';
const CARD_TEST_ID = 'e2e-visual-a';
const HISTORY_KEY = 'selftest_history';

/** One-question device-local paper: the results page renders from this. */
function cardPaper({ id, correct = true }) {
	return {
		id,
		topic: 'e2e-visual topic',
		timestamp: 10,
		questions: [{ question: 'Q1', options: ['A1', 'B1', 'C1'], answer: 'A1' }],
		userAnswers: { 0: correct ? 'A1' : 'B1' },
		score: correct ? 1 : 0,
		totalQuestions: 1,
		timeTaken: 12,
	};
}

/** Two-question paper: the first question is wrong, the second is correct. */
function twoQuestionPaper({ id }) {
	return {
		id,
		topic: 'e2e-visual topic',
		timestamp: 10,
		questions: [
			{ question: 'Q1', options: ['A1', 'B1', 'C1'], answer: 'A1' },
			{ question: 'Q2', options: ['A2', 'B2', 'C2'], answer: 'A2' },
		],
		userAnswers: { 0: 'B1', 1: 'A2' },
		score: 1,
		totalQuestions: 2,
		timeTaken: 24,
	};
}

/** Identity + history land before any app code runs, so the first fetch is attributed. */
async function seedCardState(page, { clientId, history }) {
	await page.addInitScript(
		({ clientIdValue, historyKey, historyValue }) => {
			window.localStorage.setItem('selftest_client_id', clientIdValue);
			window.localStorage.setItem(historyKey, historyValue);
		},
		{ clientIdValue: clientId, historyKey: HISTORY_KEY, historyValue: JSON.stringify(history) }
	);
}

/** Counts POSTs to the build endpoint, whatever else the page requests. */
function countBuilds(page) {
	const builds = [];
	page.on('request', (requestEvent) => {
		if (requestEvent.method() === 'POST' && requestEvent.url().endsWith('/api/playground')) {
			builds.push(requestEvent.url());
		}
	});
	return builds;
}

/** The verdict gate runs before the build offer: stub it as worth-it. */
async function stubVisualFitWorthIt(page) {
	await page.route('**/api/visual-fit', async (route) => {
		await route.fulfill({
			status: 200,
			json: {
				suggested: true,
				category: 'worth_it',
				confidence: 0.9,
				cached: false,
				degraded: false,
			},
		});
	});
}

test('restores a linked visual and opens it inline from the hash deep link', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// Schema warmup on the library bucket, not the suite-shared /api/test one.
	await request.get('/api/playground/library', { headers: { 'x-client-id': CARD_CLIENT_ID } });

	const { slug, libraryId } = await seedLinkedExplainer(sql, {
		clientId: CARD_CLIENT_ID,
		testId: CARD_TEST_ID,
		topic: 'e2e-links-topic',
		questionIndex: 0,
	});

	const builds = countBuilds(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: CARD_CLIENT_ID,
		history: [cardPaper({ id: CARD_TEST_ID })],
	});
	await page.goto(`/results?id=${CARD_TEST_ID}#question-0`);

	// The hash opens the card on load: no head tap is needed to reach the
	// restored affordance.
	await expect(page.locator('.review-card-body')).toHaveCount(1);
	await expect(page.getByRole('heading', { name: 'Visual explanation' })).toBeVisible();
	await page.getByRole('button', { name: 'Show visual explanation' }).click();

	const frame = page.locator('iframe.artifact-frame');
	await expect(frame).toBeVisible();
	await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
	await expect(
		page.frameLocator('iframe.artifact-frame').locator('#e2e-links-marker')
	).toHaveText('linked body');
	await expect(page.getByRole('link', { name: 'Open full page' })).toHaveAttribute(
		'href',
		`/explain/${slug}`
	);
	// A linked explainer opens from the library: no generation was ever asked for.
	expect(builds).toEqual([]);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				libraryId,
				slug,
				sandbox: await frame.getAttribute('sandbox'),
				openFullPage: await page
					.getByRole('link', { name: 'Open full page' })
					.getAttribute('href'),
				builds: builds.length,
			},
			null,
			2
		),
	});
});

test('arms the linked visual when the wrong-answers action opens the card', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// Schema warmup on the library bucket, not the suite-shared /api/test one.
	await request.get('/api/playground/library', { headers: { 'x-client-id': CARD_CLIENT_ID } });

	const testId = 'e2e-visual-review-action';
	await seedLinkedExplainer(sql, {
		clientId: CARD_CLIENT_ID,
		testId,
		topic: 'e2e-links-topic',
		questionIndex: 0,
	});

	const builds = countBuilds(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: CARD_CLIENT_ID,
		history: [twoQuestionPaper({ id: testId })],
	});
	await page.goto(`/results?id=${testId}`);

	// Hero action: narrows the review list to the wrong answers and opens the
	// first one. That same click must arm the visual section for the card it
	// opens; the card is never collapsed and re-expanded by hand here.
	await page.getByRole('button', { name: 'Review wrong answers' }).click();

	const wrongCard = page.locator('#question-0');
	await expect(wrongCard.locator('.review-card-body')).toHaveCount(1);
	await expect(wrongCard.getByRole('button', { name: 'Show visual explanation' })).toBeVisible();
	// The action really ran: only the wrong card survives the incorrect filter.
	await expect(page.locator('#question-1')).toHaveCount(0);
	// And it is a restore, not a build.
	expect(builds).toEqual([]);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				expandedCard: 0,
				showButtonVisible: true,
				correctCardFilteredOut: true,
				builds: builds.length,
			},
			null,
			2
		),
	});
});

test('builds a visual inline and keeps it across collapse and expand', async ({
	page,
}, testInfo) => {
	let buildCalls = 0;
	await stubVisualFitWorthIt(page);
	await page.route('**/api/playground', async (route) => {
		buildCalls += 1;
		// The honest loading state is asserted below, so the stub must not
		// answer before the browser has painted it.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await route.fulfill({
			status: 200,
			json: {
				title: 'Stub visual title',
				summary: 'Stub visual summary',
				slug: 'stub-visual-0000abcd',
				recipes: ['step-reveal'],
				html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stub</title></head><body><div id="e2e-stub-marker">stub body</div></body></html>',
				cached: false,
			},
		});
	});

	const testId = 'e2e-visual-build';
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: 'e2e-visual-beta',
		history: [cardPaper({ id: testId })],
	});
	await page.goto(`/results?id=${testId}`);

	// A correct answer starts collapsed, so the head tap opens the card and its
	// visual section together.
	await page.locator('.review-card-head').click();
	await page.getByRole('button', { name: 'Build visual explanation' }).click();
	await expect(page.getByText('Planning the explainer…')).toBeVisible();
	await expect(page.frameLocator('iframe.artifact-frame').locator('#e2e-stub-marker')).toHaveText(
		'stub body'
	);
	await expect(page.locator('iframe.artifact-frame')).toHaveAttribute('sandbox', 'allow-scripts');
	await expect(page.getByRole('heading', { name: 'Stub visual title' })).toBeVisible();

	// Collapsing unmounts the iframe; expanding again re-renders the retained
	// artifact, and the stub was called exactly once for both mounts.
	await page.locator('.review-card-head').click();
	await expect(page.locator('iframe.artifact-frame')).toHaveCount(0);
	await page.locator('.review-card-head').click();
	await expect(page.frameLocator('iframe.artifact-frame').locator('#e2e-stub-marker')).toHaveText(
		'stub body'
	);
	expect(buildCalls).toBe(1);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ buildCalls, markerRemounted: true }, null, 2),
	});
});

test('shows the localized build error with a working retry', async ({ page }, testInfo) => {
	let buildCalls = 0;
	await stubVisualFitWorthIt(page);
	await page.route('**/api/playground', async (route) => {
		buildCalls += 1;
		await route.fulfill({
			status: 429,
			json: {
				error: 'Rate limit exceeded. Please try again later.',
				code: 'API_LIMIT_EXCEEDED',
				resetTime: new Date(Date.now() + 60_000).toISOString(),
			},
		});
	});

	const testId = 'e2e-visual-error';
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: 'e2e-visual-gamma',
		history: [cardPaper({ id: testId })],
	});
	await page.goto(`/results?id=${testId}`);

	await page.locator('.review-card-head').click();
	await page.getByRole('button', { name: 'Build visual explanation' }).click();

	const section = page.locator('.visual-explainer');
	await expect(section.getByText('Rate limit exceeded. Please try again later.')).toBeVisible();
	const retry = section.getByRole('button', { name: 'Try Again' });
	await expect(retry).toBeVisible();

	// Retry re-runs the build rather than leaving the card stuck.
	await retry.click();
	await expect(section.getByText('Rate limit exceeded. Please try again later.')).toBeVisible();
	// The 429 copy above is already on screen before the retry, so poll for the
	// second request instead of asserting the counter the moment the click lands.
	await expect.poll(() => buildCalls).toBe(2);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ buildCalls }, null, 2),
	});
});

// --- The verdict gate on the review card: the Jev visual-fit call decides
// whether the no-link affordance ever appears. The specs stub the endpoint, so
// no spec reaches a judge. The ruling pinned here: reader-driven expansions
// judge their card immediately, while cards the page opens for the reader are
// judged the first time they reach the viewport, never in a load-time sweep.
// Spec: docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md §7.1

/** Ten wrong answers: every card opens at load, the whole list on one page. */
function tenQuestionPaper({ id }) {
	return {
		id,
		topic: 'e2e-visual topic',
		timestamp: 10,
		questions: Array.from({ length: 10 }, (_, questionIndex) => ({
			question: `Q${questionIndex + 1}`,
			options: ['A', 'B', 'C'],
			answer: 'A',
		})),
		userAnswers: Object.fromEntries(
			Array.from({ length: 10 }, (_, questionIndex) => [questionIndex, 'B'])
		),
		score: 0,
		totalQuestions: 10,
		timeTaken: 60,
	};
}

test('offers the build affordance once when the verdict suggests a visual', async ({
	page,
}, testInfo) => {
	const fitRequests = [];
	await page.route('**/api/visual-fit', async (route) => {
		fitRequests.push({
			body: route.request().postDataJSON(),
			headers: route.request().headers(),
		});
		await route.fulfill({
			status: 200,
			json: {
				suggested: true,
				category: 'worth_it',
				confidence: 0.9,
				cached: false,
				degraded: false,
			},
		});
	});

	const testId = 'e2e-visual-fit-offer';
	const clientId = 'e2e-visual-delta';
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, { clientId, history: [cardPaper({ id: testId })] });
	await page.goto(`/results?id=${testId}`);

	// A correct answer starts collapsed, so the head tap is the reader's own
	// expansion: the verdict is fetched with it, not on page load.
	await page.locator('.review-card-head').click();
	await expect(page.getByRole('heading', { name: 'Visual explanation' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Build visual explanation' })).toBeVisible();
	await expect.poll(() => fitRequests.length).toBe(1);
	// The pinned contract: the same context fields the build request will send.
	expect(fitRequests[0].body).toEqual({
		topic: 'e2e-visual topic',
		question: 'Q1',
		answer: 'A1',
		language: 'english',
	});
	expect(fitRequests[0].headers['x-client-id']).toBe(clientId);

	// Collapsing and re-expanding reuses the held verdict: no second judge call.
	await page.locator('.review-card-head').click();
	await expect(page.locator('.review-card-body')).toHaveCount(0);
	await page.locator('.review-card-head').click();
	await expect(page.getByRole('button', { name: 'Build visual explanation' })).toBeVisible();
	expect(fitRequests).toHaveLength(1);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ fitCalls: fitRequests.length, body: fitRequests[0].body }, null, 2),
	});
});

test('hides the visual affordance when the verdict says it is not visual', async ({
	page,
}, testInfo) => {
	let fitCalls = 0;
	await page.route('**/api/visual-fit', async (route) => {
		fitCalls += 1;
		// The honest checking state is asserted below, so the stub must not
		// answer before the browser has painted the open card.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await route.fulfill({
			status: 200,
			json: {
				suggested: false,
				category: 'not_visual',
				confidence: 0.9,
				cached: false,
				degraded: false,
			},
		});
	});

	const testId = 'e2e-visual-fit-hidden';
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: 'e2e-visual-zeta',
		history: [cardPaper({ id: testId })],
	});
	await page.goto(`/results?id=${testId}`);

	const verdict = page.waitForResponse('**/api/visual-fit');
	await page.locator('.review-card-head').click();
	// While the verdict is in flight the section shows nothing: no button flash.
	await expect(page.locator('.review-card-body')).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Build visual explanation' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Visual explanation' })).toHaveCount(0);

	// The verdict landed and said no: the section stays absent.
	await verdict;
	await expect(page.locator('.visual-explainer')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Build visual explanation' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Visual explanation' })).toHaveCount(0);
	expect(fitCalls).toBe(1);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ fitCalls, affordanceRendered: false }, null, 2),
	});
});

test('keeps the build affordance when the verdict request fails', async ({ page }, testInfo) => {
	let fitCalls = 0;
	await page.route('**/api/visual-fit', async (route) => {
		fitCalls += 1;
		await route.fulfill({
			status: 429,
			json: {
				error: 'Rate limit exceeded. Please try again later.',
				code: 'API_LIMIT_EXCEEDED',
				resetTime: new Date(Date.now() + 60_000).toISOString(),
			},
		});
	});

	const testId = 'e2e-visual-fit-fail-open';
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: 'e2e-visual-eta',
		history: [cardPaper({ id: testId })],
	});
	await page.goto(`/results?id=${testId}`);

	await page.locator('.review-card-head').click();
	// Fail-open: an unavailable verdict never hides the affordance.
	await expect(page.getByRole('button', { name: 'Build visual explanation' })).toBeVisible();
	await expect.poll(() => fitCalls).toBe(1);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ fitCalls, status: 429, affordanceRendered: true }, null, 2),
	});
});

test('judges an auto-opened card only when it reaches the viewport', async ({ page }, testInfo) => {
	const judgedQuestions = [];
	await page.route('**/api/visual-fit', async (route) => {
		judgedQuestions.push(route.request().postDataJSON()?.question ?? '');
		await route.fulfill({
			status: 200,
			json: {
				suggested: true,
				category: 'worth_it',
				confidence: 0.9,
				cached: false,
				degraded: false,
			},
		});
	});

	const testId = 'e2e-visual-fit-viewport';
	await page.setViewportSize({ width: 390, height: 844 });
	await seedCardState(page, {
		clientId: 'e2e-visual-epsilon',
		history: [tenQuestionPaper({ id: testId })],
	});
	await page.goto(`/results?id=${testId}`);

	// Every answer is wrong, so every card opens at load; only the cards that
	// reach the viewport may judge. A load-time sweep would call ten times.
	await page.locator('#question-0').scrollIntoViewIfNeeded();
	await expect(
		page.locator('#question-0').getByRole('button', { name: 'Build visual explanation' })
	).toBeVisible();
	const judgedAtLoad = judgedQuestions.length;
	expect(judgedAtLoad).toBeGreaterThan(0);
	expect(judgedAtLoad).toBeLessThan(5);
	expect(judgedQuestions).not.toContain('Q10');

	// The last card sits far below the fold: scrolling it into view is the
	// first time it is seen, and that is when its verdict is fetched.
	await page.locator('#question-9').scrollIntoViewIfNeeded();
	await expect(
		page.locator('#question-9').getByRole('button', { name: 'Build visual explanation' })
	).toBeVisible();
	await expect.poll(() => judgedQuestions.includes('Q10')).toBe(true);
	expect(judgedQuestions.filter((question) => question === 'Q10')).toHaveLength(1);
	// Still not a sweep: the load never judged the whole paper.
	expect(judgedQuestions.length).toBeLessThan(10);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				judgedAtLoad,
				judgedAfterScroll: judgedQuestions.length,
				lastCardJudged: judgedQuestions.includes('Q10'),
			},
			null,
			2
		),
	});
});
