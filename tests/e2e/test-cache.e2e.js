import { expect, test } from '@playwright/test';
import { sqlClient } from './testDb';

// GET /api/test serves both read branches from a per-process TTL+LRU cache.
// These specs pin the observable contract on the live endpoint: repeat reads
// MISS then HIT with identical bodies, unknown ids are never cached, and a seed
// through the dev database bridge invalidates cached list reads so the rest of
// the suite stays deterministic.
//
// Cache keys are unique per test (timestamped probe strings) because the dev
// server is shared across parallel spec workers; the HIT assertion re-warms
// immediately before reading because another worker's bridge seed clears the
// cache, which is safe (a miss is always correct) but would flip a single
// back-to-back assertion.
//
// Runs in file order (not fullyParallel): the re-warm/re-read pair still races
// a concurrent bridge seed, and the whole file costs well under a second.
test.describe.configure({ mode: 'default' });

test.describe('GET /api/test response cache', () => {
	test('list pages MISS then HIT with identical bodies', async ({ request }) => {
		const url = `/api/test?q=cache-probe-${Date.now()}&limit=5`;

		const first = await request.get(url);
		expect(first.status()).toBe(200);
		expect(first.headers()['x-cache']).toBe('MISS');
		const firstBody = await first.json();

		await request.get(url);
		const second = await request.get(url);
		expect(second.status()).toBe(200);
		expect(second.headers()['x-cache']).toBe('HIT');
		expect(await second.json()).toEqual(firstBody);
	});

	test('a paper record MISSes then HITs, and unknown ids are never cached', async ({
		request,
	}) => {
		// Warm the schema through the endpoint the spec then seeds behind.
		await request.get('/api/test?limit=1');

		const sql = sqlClient(request);
		const topic = `CacheRecord ${Date.now()}`;
		const rows = await sql`
			INSERT INTO ai_test (test, topic, language, num_questions)
			VALUES (
				${JSON.stringify({ topic, questions: [{ question: 'Cache probe?', options: ['A', 'B'], answer: 'A' }] })}::jsonb,
				${topic},
				'english',
				1
			)
			RETURNING id
		`;
		const url = `/api/test?id=${rows[0].id}`;

		const first = await request.get(url);
		expect(first.status()).toBe(200);
		expect(first.headers()['x-cache']).toBe('MISS');
		const firstBody = await first.json();
		expect(firstBody.id).toBe(rows[0].id);
		expect(firstBody.myAttempt).toBeNull();

		await request.get(url);
		const second = await request.get(url);
		expect(second.headers()['x-cache']).toBe('HIT');
		expect(await second.json()).toEqual(firstBody);

		const missing1 = await request.get('/api/test?id=999999999');
		const missing2 = await request.get('/api/test?id=999999999');
		expect(missing1.status()).toBe(404);
		expect(missing2.status()).toBe(404);
		expect(missing2.headers()['x-cache']).toBeUndefined();
	});

	test('seeding through the dev bridge invalidates cached list reads', async ({ request }) => {
		const sql = sqlClient(request);
		const topic = `CacheProbe ${Date.now()}`;
		const url = `/api/test?q=${encodeURIComponent(topic)}`;

		await request.get(url); // schema warm; unique probe key is a fresh entry
		const warm = await request.get(url);
		expect(warm.status()).toBe(200);
		expect((await warm.json()).tests).toEqual([]);

		await sql`
			INSERT INTO ai_test (test, topic, language, num_questions)
			VALUES (${JSON.stringify({ topic, questions: [] })}::jsonb, ${topic}, 'english', 0)
		`;

		// Without the bridge's cache clear this read would be a HIT and return
		// the stale empty list.
		const after = await request.get(url);
		expect(after.headers()['x-cache']).toBe('MISS');
		const body = await after.json();
		expect(body.tests.map((row) => row.topic)).toContain(topic);
	});
});
