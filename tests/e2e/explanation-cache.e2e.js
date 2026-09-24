import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { neon } from '@neondatabase/serverless';

// Explanation cache suite: proves /api/explain serves a stored explanation
// from the database without calling the model. Real dev server + local DB;
// skipped when DATABASE_URL is unavailable. No Gemini calls.
// Spec: docs/superpowers/specs/2026-09-24-engagement-and-exam-engine-design.md

// Vite precedence: .env.local overrides .env, and a pre-set process env wins.
// loadEnvFile never overwrites an existing variable, so load the override
// first and stop once DATABASE_URL is present.
for (const file of ['.env.local', '.env']) {
	try {
		process.loadEnvFile(file);
	} catch {
		// The file is optional; contributors without one skip this suite.
	}
	if (process.env.DATABASE_URL) {
		break;
	}
}

const databaseUrl = process.env.DATABASE_URL || '';

function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

// Independently computed to pin the documented formula: drift in either
// implementation makes the seeded row invisible and fails the test.
function cacheKeyFor({ question, answer, language }) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'ex-v1',
				normalizeText(language).toLowerCase() || 'english',
				normalizeText(question),
				normalizeText(answer),
			])
		)
		.digest('hex');
}

const seed = {
	topic: 'e2e-cache-probe',
	question: 'E2E explanation cache probe: why is the sky blue?',
	answer: 'Rayleigh scattering',
	language: 'english',
	explanation: 'The seeded explanation proves the database cache is served before generation.',
};

test('serves a seeded explanation from the database cache without generating', async ({
	request,
}, testInfo) => {
	test.skip(!databaseUrl, 'DATABASE_URL is not configured');

	const sql = neon(databaseUrl);
	try {
		await sql`SELECT 1 AS ok`;
	} catch {
		test.skip(true, 'Database is not reachable from the test runner');
	}

	// The first storage touch runs ensureStorageSchema on the dev server.
	await request.get('/api/test?id=1');

	const cacheKey = cacheKeyFor(seed);

	await sql`
		INSERT INTO question_explanations (cache_key, language, explanation, model)
		VALUES (
			${cacheKey},
			${seed.language},
			${JSON.stringify({ explanation: seed.explanation })}::jsonb,
			'e2e-seed'
		)
		ON CONFLICT (cache_key) DO UPDATE
			SET language = EXCLUDED.language,
				explanation = EXCLUDED.explanation,
				last_used_at = NOW()
	`;

	const before = await sql`
		SELECT use_count FROM question_explanations WHERE cache_key = ${cacheKey}
	`;

	const payload = {
		topic: seed.topic,
		question: seed.question,
		answer: seed.answer,
		language: seed.language,
	};
	const first = await request.post('/api/explain', { data: payload });
	const second = await request.post('/api/explain', { data: payload });

	expect(first.status()).toBe(200);
	expect(second.status()).toBe(200);
	const firstPayload = await first.json();
	const secondPayload = await second.json();
	expect(firstPayload.cached).toBe(true);
	expect(secondPayload.cached).toBe(true);
	expect(firstPayload.explanation).toBe(seed.explanation);
	expect(secondPayload.explanation).toBe(seed.explanation);

	const after = await sql`
		SELECT use_count FROM question_explanations WHERE cache_key = ${cacheKey}
	`;
	const useCountDelta = Number(after[0]?.use_count ?? 0) - Number(before[0]?.use_count ?? 0);
	expect(useCountDelta).toBe(2);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			cachedFirst: firstPayload.cached,
			cachedSecond: secondPayload.cached,
			explanationMatches: firstPayload.explanation === seed.explanation,
			useCountDelta,
		}),
	});
});
