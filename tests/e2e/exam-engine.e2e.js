import { createHash, randomBytes } from 'node:crypto';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import { connectOrSkip, sqlClient, TEST_ORIGIN } from './testDb.js';

// Exam engine: a discovered pattern is served from cache, and a generated
// pattern-based paper renders section headers on the test page and a
// per-section breakdown on the results page. Seeded through the dev server's
// test database bridge. No model calls.

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		// Background session/state sync can be rate-limited when the whole
		// suite runs from one IP + user agent; this spec asserts its own
		// surfaces directly, so those environmental messages are ignored.
		if (/Rate limit exceeded|Failed to refresh auth session|Failed to fetch user state/i.test(message.text())) {
			return;
		}
		// Google Identity logs informational warnings in dev (unauthorized
		// origin for the client id) and can fail to load third-party; both are
		// environmental, not app errors.
		if (/GSI_LOGGER|Failed to load Google Sign-In script/i.test(message.text())) {
			return;
		}
		errors.push(message.text());
	});
	page.on('pageerror', (error) => {
		errors.push(String(error?.message || error));
	});
	return errors;
}

async function pressAndHold(page, locator, holdMs = 1100) {
	await locator.waitFor({ state: 'visible' });
	await locator.hover();
	await page.waitForTimeout(300);
	await locator.hover();
	await page.mouse.down();
	await page.waitForTimeout(holdMs);
	await page.mouse.up();
}

const seededPattern = {
	examName: 'E2E Pattern Exam',
	board: null,
	classLevel: null,
	subject: null,
	patternYear: '2026',
	durationMinutes: 30,
	totalMarks: 4,
	negativeMarking: null,
	sections: [
		{
			id: 'section-a',
			name: 'Section A',
			questionTypes: ['multiple-choice'],
			questionCount: 1,
			marksPerQuestion: 2,
			negativeMarks: null,
			instructions: 'Answer all questions.',
		},
		{
			id: 'section-b',
			name: 'Section B',
			questionTypes: ['multiple-choice'],
			questionCount: 1,
			marksPerQuestion: 2,
			negativeMarks: null,
			instructions: null,
		},
	],
	generalInstructions: [],
};

test('free exam flow offers cached sections and sends sectionFocus', async ({
	page,
	request,
}, testInfo) => {
	const errors = await collectErrors(page);
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	// Cache a pattern for a registry exam; the free flow must surface its
	// sections without any discovery call.
	await sql`
		INSERT INTO exam_patterns (pattern_key, source, payload, model, fetched_at, expires_at)
		VALUES (
			'exam:ibps-po',
			'exam',
			${JSON.stringify(seededPattern)}::jsonb,
			'e2e-seed',
			NOW(),
			NOW() + INTERVAL '30 days'
		)
		ON CONFLICT (pattern_key) DO UPDATE
			SET payload = EXCLUDED.payload,
				model = EXCLUDED.model,
				fetched_at = NOW(),
				expires_at = EXCLUDED.expires_at
	`;

	let capturedBody = null;
	const mockPaper = {
		id: 999999,
		topic: 'Mock paper',
		testMode: 'full-exam',
		language: 'english',
		questions: [{ question: 'Q1', options: ['A', 'B'], answer: 'A' }],
	};
	await page.route(
		(url) => url.pathname === '/api/generate',
		async (route) => {
			capturedBody = route.request().postDataJSON();
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(mockPaper),
			});
		}
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ...mockPaper, myAttempt: null }),
			})
	);

	await page.goto('/?exam=ibps-po&sections=1');
	await expect(page.locator('.exam-sections-row')).toBeVisible({ timeout: 15000 });
	await page.getByRole('button', { name: 'Section B' }).click();

	const generate = page.getByRole('button', { name: /Generate Test/ });
	await expect(generate).toBeEnabled({ timeout: 10000 });
	await generate.click();

	await expect.poll(() => capturedBody?.sectionFocus).toBe('section-b');
	expect(capturedBody).toMatchObject({
		testMode: 'full-exam',
		examId: 'ibps-po',
		numQuestions: 1,
		testType: 'multiple-choice',
	});

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ sectionFocus: capturedBody?.sectionFocus, numQuestions: capturedBody?.numQuestions },
			null,
			2
		),
	});
});

test('premium exam papers are gated for anonymous users', async ({ page, request }, testInfo) => {
	const errors = await collectErrors(page);

	await page.goto('/exam-paper');
	await expect(page.locator('.exam-paper-page')).toBeVisible({ timeout: 15000 });
	await expect(page.locator('.exam-paper-gate')).toBeVisible();
	await expect(page.locator('.exam-paper-gate')).toContainText('Early access');

	// The gate is enforced server-side too, not just in the UI.
	const blocked = await request.post('/api/generate', {
		data: {
			testMode: 'full-exam',
			objectiveOnly: true,
			examName: 'E2E Gate Probe',
			board: 'CBSE',
			classLevel: '10',
			subject: 'Science',
			numQuestions: 5,
			difficulty: 'intermediate',
			language: 'english',
		},
	});
	expect(blocked.status()).toBe(403);
	const blockedBody = await blocked.json();
	expect(blockedBody.code).toBe('PREMIUM_REQUIRED');

	// The admin API stays closed without an admin session.
	const adminDenied = await request.get('/api/admin/premium');
	expect(adminDenied.status()).toBe(401);

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ gateVisible: true, generateStatus: 403, adminStatus: 401 }, null, 2),
	});
});

test('admin grants premium access and the signed-in user can use it', async ({ request }) => {
	test.skip(
		!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD,
		'Admin credentials are not configured'
	);
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');

	// A real user row plus a session we can present as a cookie.
	const token = randomBytes(32).toString('hex');
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const email = `e2e-premium-${Date.now()}@example.com`;
	const users = await sql`
		INSERT INTO app_user (google_sub, email, name)
		VALUES (${`e2e-${token.slice(0, 16)}`}, ${email}, 'E2E Premium User')
		RETURNING id
	`;
	const userId = users[0].id;
	await sql`
		INSERT INTO app_user_session (user_id, session_token_hash, expires_at)
		VALUES (${userId}, ${tokenHash}, NOW() + INTERVAL '1 hour')
	`;

	const login = await request.post('/api/admin/login', {
		data: {
			username: process.env.ADMIN_USERNAME,
			password: process.env.ADMIN_PASSWORD,
		},
	});
	expect(login.status()).toBe(200);

	const userContext = await playwrightRequest.newContext({
		baseURL: TEST_ORIGIN,
		extraHTTPHeaders: { Cookie: `selftest_session=${token}` },
	});
	try {
		const before = await userContext.get('/api/premium/access');
		expect((await before.json()).allowed).toBe(false);

		const grant = await request.post('/api/admin/premium', {
			data: { email, notes: 'e2e grant' },
		});
		expect(grant.status()).toBe(200);

		const after = await userContext.get('/api/premium/access');
		const afterBody = await after.json();
		expect(afterBody.allowed).toBe(true);
		expect(afterBody.reason).toBe('entitlement');

		const revoke = await request.post('/api/admin/premium', {
			data: { action: 'revoke', userId },
		});
		expect(revoke.status()).toBe(200);
		const revoked = await userContext.get('/api/premium/access');
		expect((await revoked.json()).allowed).toBe(false);
	} finally {
		await userContext.dispose();
	}
});

test('serves a cached exam pattern without a model call', async ({ request }, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);

	// The first storage touch runs ensureStorageSchema on the dev server.
	await request.get('/api/test?id=1');

	await sql`
		INSERT INTO exam_patterns (pattern_key, source, payload, model, fetched_at, expires_at)
		VALUES (
			'exam:e2e-pattern-probe',
			'exam',
			${JSON.stringify(seededPattern)}::jsonb,
			'e2e-seed',
			NOW(),
			NOW() + INTERVAL '30 days'
		)
		ON CONFLICT (pattern_key) DO UPDATE
			SET payload = EXCLUDED.payload,
				model = EXCLUDED.model,
				fetched_at = NOW(),
				expires_at = EXCLUDED.expires_at
	`;

	const response = await request.get('/api/exam/pattern?examId=e2e-pattern-probe');
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.key).toBe('exam:e2e-pattern-probe');
	expect(body.pattern.stale).toBe(false);
	expect(body.pattern.sections.map((section) => section.name)).toEqual([
		'Section A',
		'Section B',
	]);

	const invalid = await request.get('/api/exam/pattern');
	expect(invalid.status()).toBe(400);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ key: body.key, sections: body.pattern.sections.length, stale: body.pattern.stale },
			null,
			2
		),
	});
});

test('pattern paper renders section headers and a per-section breakdown', async ({
	page,
	request,
}, testInfo) => {
	const errors = await collectErrors(page);
	const sql = sqlClient(request);
	await connectOrSkip(sql);

	const paper = {
		topic: 'E2E sections probe',
		questions: [
			{ question: 'Section A question?', options: ['Alpha', 'Beta'], answer: 'Alpha' },
			{ question: 'Section B question?', options: ['Gamma', 'Delta'], answer: 'Gamma' },
		],
		sections: seededPattern.sections.map((section, index) => ({
			...section,
			questionCount: 1,
			questionIndexes: [index],
			negativeMarks: 0.5,
		})),
		examMeta: {
			examName: 'E2E Pattern Exam',
			schoolName: 'E2E Public School',
			patternYear: '2026',
			durationMinutes: 30,
			patternCheckedAt: new Date().toISOString(),
			sectionOnly: false,
		},
	};
	const rows = await sql`
		INSERT INTO ai_test (test, topic, language, num_questions, test_mode, exam_id)
		VALUES (
			${JSON.stringify(paper)}::jsonb,
			'E2E sections probe',
			'english',
			2,
			'full-exam',
			'e2e-pattern-probe'
		)
		RETURNING id
	`;
	const testId = rows[0].id;

	await page.goto(`/test?id=${testId}`);
	await expect(page.locator('.test-summary-card')).toBeVisible({ timeout: 15000 });
	await expect(page.locator('.test-summary-exam')).toContainText('E2E Public School');
	await expect(page.locator('.test-summary-exam')).toContainText('E2E Pattern Exam');
	await page.getByRole('button', { name: 'Start Test' }).click();

	// First question carries the section header, instructions, marks and time.
	await expect(page.locator('.test-section-banner')).toContainText('Section 1 of 2');
	await expect(page.locator('.test-section-name')).toHaveText('Section A');
	await expect(page.locator('.test-section-instructions')).toContainText(
		'Answer all questions.'
	);
	await expect(page.locator('.test-section-marks')).toContainText('2 marks each');
	await expect(page.locator('.test-section-marks')).toContainText('15 min');

	// Answering advances to the next section's header.
	await page.locator('.test-option').first().click();
	await expect(page.locator('.test-section-name')).toHaveText('Section B');
	await expect(page.locator('.test-section-banner')).toContainText('Section 2 of 2');

	// Submit one correct and one unanswered question.
	await page.locator('.test-progress-pill').click();
	await pressAndHold(
		page,
		page.getByRole('button', { name: 'Submit Test', description: 'Press and hold to submit' })
	);
	await expect(page).toHaveURL(new RegExp(`/results\\?id=${testId}`));

	await expect(page.locator('.section-breakdown')).toBeVisible();
	const scores = await page.locator('.section-breakdown-score').allTextContents();
	expect(scores).toEqual(['1/1', '0/1']);
	const names = await page.locator('.section-breakdown-name').allTextContents();
	expect(names).toEqual(['Section A', 'Section B']);

	// Marks-aware scoring: +2 for the correct answer, nothing for the skipped one.
	await expect(page.getByText('2/4 marks')).toBeVisible();

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ sections: names, scores }, null, 2),
	});
});
