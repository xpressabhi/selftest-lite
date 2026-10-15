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
	// The first storage touch runs ensureStorageSchema on the dev server.
	await request.get('/api/test?id=1');

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
	await request.get('/api/test?id=1');

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
	await request.get('/api/test?id=1');

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
