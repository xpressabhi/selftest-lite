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
