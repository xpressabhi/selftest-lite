import { expect, test } from '@playwright/test';

// Security-hardening contract suite. These assert the *absence* of a leak on
// live HTTP responses, which no unit test can cover: the unit tests prove the
// pure functions behave, these prove the deployed JSON actually omits the field.
//
// Covered here:
//   - the anonymous device id is never returned by any endpoint (it is an
//     authorization credential for /api/user/*, so disclosing it is a
//     cross-account read)
//   - answer keys never ride along on a history read
//   - a prompt-bound field cannot be used to smuggle a megabyte into the model
//   - rate-limit buckets cannot be minted by rotating a header
//   - a push subscription cannot be mutated by someone else's endpoint

const MAX_PROMPT_FIELD_LENGTH = 200;

test.describe('identity disclosure', () => {
	// Recursive on purpose: requestParams can sit at the top of a bare paper or
	// nested under `test`, and a shallow check would miss one of them.
	function findClientId(value, trail = '$') {
		if (Array.isArray(value)) {
			for (const [index, item] of value.entries()) {
				const hit = findClientId(item, `${trail}[${index}]`);
				if (hit) {
					return hit;
				}
			}
			return null;
		}
		if (value && typeof value === 'object') {
			for (const [key, item] of Object.entries(value)) {
				if (key === 'clientId') {
					return `${trail}.${key} = ${JSON.stringify(item)}`;
				}
				const hit = findClientId(item, `${trail}.${key}`);
				if (hit) {
					return hit;
				}
			}
		}
		return null;
	}

	function findAnswer(value, trail = '$') {
		if (Array.isArray(value)) {
			for (const [index, item] of value.entries()) {
				const hit = findAnswer(item, `${trail}[${index}]`);
				if (hit) {
					return hit;
				}
			}
			return null;
		}
		if (value && typeof value === 'object') {
			if (Object.hasOwn(value, 'answer') && value.answer !== undefined) {
				return `${trail}.answer = ${JSON.stringify(value.answer)}`;
			}
			for (const [key, item] of Object.entries(value)) {
				const hit = findAnswer(item, `${trail}.${key}`);
				if (hit) {
					return hit;
				}
			}
		}
		return null;
	}

	test('GET /api/test never returns the stored clientId or an answer key', async ({
		request,
	}, testInfo) => {
		// Collect real ids from the public list, then read each one.
		const list = await request.get('/api/test?limit=10');
		expect(list.ok()).toBeTruthy();
		const ids = (await list.json())?.tests?.map((row) => row.id) ?? [];
		test.skip(ids.length === 0, 'no generated papers in this environment');

		const leaks = [];
		for (const id of ids) {
			const response = await request.get(`/api/test?id=${id}`);
			if (!response.ok()) {
				continue;
			}
			const body = await response.json();
			const clientId = findClientId(body);
			const answer = findAnswer(body);
			if (clientId || answer) {
				leaks.push({ id, clientId, answer });
			}
		}

		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify({ idsChecked: ids.length, leaks }, null, 2),
		});
		expect(leaks).toEqual([]);
	});

	test('GET /api/user/history never returns an answer key', async ({ request }, testInfo) => {
		// An anonymous client id is the only credential this route accepts, so
		// present one.
		const clientId = 'e2e-history-probe-0001';
		const response = await request.get('/api/user/history', {
			headers: { 'x-client-id': clientId },
		});
		expect(response.ok()).toBeTruthy();
		const body = await response.json();
		const attempts = body?.attempts ?? [];

		const leaks = [];
		for (const [index, attempt] of attempts.entries()) {
			const answer = findAnswer(attempt.test, `$.attempts[${index}].test`);
			const clientId = findClientId(attempt.test, `$.attempts[${index}].test`);
			if (answer || clientId) {
				leaks.push({ index, testId: attempt.testId, answer, clientId });
			}
		}

		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify({ attemptsChecked: attempts.length, leaks }, null, 2),
		});
		expect(leaks).toEqual([]);
	});
});

test.describe('request bounding', () => {
	// Every one of these is interpolated into a model prompt. Unbounded, a single
	// request within the 2MB body cap becomes a multi-megabyte billed prompt.
	const promptFields = [
		'examName',
		'examStream',
		'category',
		'board',
		'classLevel',
		'subject',
		'paperName',
		'school',
	];

	for (const field of promptFields) {
		test(`POST /api/generate rejects an over-long ${field}`, async ({ request }) => {
			const response = await request.post('/api/generate', {
				data: {
					topic: 'Physics',
					language: 'english',
					testType: 'multiple-choice',
					numQuestions: 5,
					difficulty: 'intermediate',
					testMode: 'full-exam',
					examName: 'SSC CGL',
					objectiveOnly: true,
					[field]: 'x'.repeat(MAX_PROMPT_FIELD_LENGTH + 1),
				},
			});
			expect(response.status()).toBe(400);
			const body = await response.json();
			expect(body.code).toBe('PROMPT_FIELD_TOO_LONG');
		});
	}
});

test.describe('rate limit buckets', () => {
	test('rotating User-Agent does not mint a new bucket', async ({ request }) => {
		// /api/auth/me is the cheapest metered route (900/min), so it will not
		// rate-limit inside the test; what matters is that the bucket key does not
		// depend on a caller-controlled header.
		const keys = new Set();
		for (const ua of ['agent-one', 'agent-two', 'agent-three']) {
			const response = await request.get('/api/auth/me', {
				headers: { 'user-agent': ua },
			});
			expect(response.ok()).toBeTruthy();
			// A stable bucket means the same reset window is reported back.
			keys.add(response.headers()['x-ratelimit-reset'] ?? 'none');
		}
		expect(keys.size).toBe(1);
	});
});

test.describe('push subscription ownership', () => {
	const subscription = (endpoint) => ({
		subscription: {
			endpoint,
			keys: { p256dh: 'e2e-probe-p256dh-key', auth: 'e2e-probe-auth-secret' },
		},
		timezone: 'Asia/Kolkata',
		hour: 7,
	});

	test('PATCH cannot mutate a subscription it does not own', async ({ request }) => {
		// Plant a subscription as one identity, then try to change it with a
		// different client id. The second caller must not be able to re-enable or
		// reschedule it.
		const owner = { 'x-client-id': 'e2e-owner-client-0001' };
		const stranger = { 'x-client-id': 'e2e-stranger-client-02' };
		const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-ownership-probe';

		await request.post('/api/reminders/subscribe', {
			headers: owner,
			data: subscription(endpoint),
		});

		const hijack = await request.patch('/api/reminders/subscribe', {
			headers: stranger,
			data: { endpoint, hour: 3 },
		});

		// Scoping means the stranger matches no row: it is refused, and crucially
		// it is not the success the unscoped UPDATE used to return.
		expect(hijack.status()).toBe(404);
		const body = await hijack.json().catch(() => ({}));
		expect(body.code).toBe('SUBSCRIPTION_NOT_FOUND');

		// The owner can still change it, proving the row exists and was not merely
		// missing for everyone. Without this the 404 above could pass for a row
		// that never saved.
		const byOwner = await request.patch('/api/reminders/subscribe', {
			headers: owner,
			data: { endpoint, hour: 7 },
		});
		expect(byOwner.status()).toBe(200);
	});

	test('DELETE requires a rate limit', async ({ request }) => {
		// DELETE had none at all. Hammer it past the shared limit and expect a 429.
		const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-delete-probe';
		const headers = { 'x-client-id': 'e2e-delete-client-0001' };
		await request.post('/api/reminders/subscribe', {
			headers,
			data: subscription(endpoint),
		});

		const statuses = [];
		for (let attempt = 0; attempt < 25; attempt += 1) {
			const response = await request.delete('/api/reminders/subscribe', {
				headers,
				data: { endpoint },
			});
			statuses.push(response.status());
		}

		// Without a limiter every one of these is a DB write.
		expect(statuses).toContain(429);
	});
});