import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_ORIGIN, connectOrSkip, sqlClient } from './testDb.js';
import { addVirtualAuthenticator, signUpWithPasskey } from './passkeySignIn.js';
import { stubVisualFit } from './visualFit.js';

// Cross-device results suite: an attempt stored for an account is re-graded on
// read, so a second device signed into the same account renders the full
// review — and an anonymous visitor still receives no answer key.
// Spec: docs/superpowers/specs/2026-10-12-cross-device-results-design.md

// The review card asks for a visual-fit verdict before it offers to build a
// visual; the endpoint is stubbed per page so the suite never reaches a model
// provider.
test.beforeEach(async ({ page }) => {
	await stubVisualFit(page);
});

const PROBE_TOPIC = 'E2E cross-device probe';
const PROBE_QUESTIONS = [
	{
		question: 'E2E cross-device probe one: which option is first?',
		options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
		answer: 'Alpha',
	},
	{
		question: 'E2E cross-device probe two: which option is second?',
		options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
		answer: 'Beta',
	},
	{
		question: 'E2E cross-device probe three: which option is third?',
		options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
		answer: 'Gamma',
	},
];
const SEEDED_EXPLANATION =
	'Seeded explanation: the second device reached the answer and the cache row was served.';

async function seedPaper(sql) {
	const paper = {
		topic: PROBE_TOPIC,
		questions: PROBE_QUESTIONS,
		// Sections make the attempt carry marks, so the review's marks row can
		// be asserted at parity with the submitting device.
		sections: [
			{ title: 'Section A', questionIndexes: [0, 1, 2], marksPerQuestion: 2, negativeMarks: 0.5 },
		],
	};
	const rows = await sql`
		INSERT INTO ai_test (test, topic, language, num_questions)
		VALUES (${JSON.stringify(paper)}::jsonb, ${PROBE_TOPIC}, 'english', ${PROBE_QUESTIONS.length})
		RETURNING id
	`;
	return rows[0].id;
}

function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

// Independently computed to pin the documented formula in
// src/lib/server/explanationCache.js: drift makes the seeded row invisible and
// fails the test instead of silently calling the model.
function explanationKeyFor({ question, answer, language }) {
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

// The results page asks /api/personalize for a central decision, and a live
// answer can switch the review filter mid-test. Pin it to "no decision" so the
// assertions describe the review itself, not the personalization layer.
async function stubPersonalize(page) {
	await page.route('**/api/personalize', async (route) => {
		await route.fulfill({ json: { applied: false, action: null, hide: [], promote: [] } });
	});
}

test('a second signed-in device renders the full review of a stored attempt', async ({
	browser,
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// The first storage touch runs ensureStorageSchema on the dev server.
	await request.get('/api/test?id=1');
	const testId = await seedPaper(sql);

	// Device A: a real account, submitting with its own session.
	await addVirtualAuthenticator(page);
	const user = await signUpWithPasskey(page);
	expect(user?.id).toBeTruthy();
	const submit = await page.request.post('/api/test/submit', {
		data: { id: testId, answers: { 0: 'Alpha', 1: 'Delta' }, timeTaken: 42 },
	});
	expect(submit.ok()).toBeTruthy();
	expect((await submit.json()).score).toBe(1);

	const attempts = await sql`
		SELECT user_id, user_answers FROM ai_test_attempts WHERE test_id = ${testId}
	`;
	expect(attempts).toHaveLength(1);
	expect(Number(attempts[0].user_id)).toBe(Number(user.id));
	expect(attempts[0].user_answers).toMatchObject({ 0: 'Alpha', 1: 'Delta' });

	// Seed the explanation the second device will ask for, so /api/explain
	// serves it from the database cache and makes no model call.
	const cacheKey = explanationKeyFor({
		question: PROBE_QUESTIONS[0].question,
		answer: PROBE_QUESTIONS[0].answer,
		language: 'english',
	});
	await sql`
		INSERT INTO question_explanations (cache_key, language, explanation, model)
		VALUES (
			${cacheKey},
			'english',
			${JSON.stringify({ explanation: SEEDED_EXPLANATION })}::jsonb,
			'e2e-seed'
		)
		ON CONFLICT (cache_key) DO UPDATE SET explanation = EXCLUDED.explanation
	`;

	// Device B: a fresh context holding only A's session cookie — signed in,
	// zero local storage, exactly what a second device looks like.
	const contextB = await browser.newContext();
	await contextB.addCookies(await page.context().cookies());
	const pageB = await contextB.newPage();
	await stubPersonalize(pageB);
	// pageB visits the review list; keep its verdict hermetic too.
	await stubVisualFit(pageB);
	const explainPayloads = [];
	pageB.on('request', (outgoing) => {
		if (outgoing.url().includes('/api/explain') && outgoing.method() === 'POST') {
			try {
				explainPayloads.push(outgoing.postDataJSON());
			} catch {
				// Non-JSON body; the assertions below surface it.
			}
		}
	});

	await pageB.goto(`${TEST_ORIGIN}/results?id=${testId}`);
	await expect(pageB.locator('.hero-topic')).toContainText(PROBE_TOPIC);
	// The reported defect: for the attempt owner the guard is gone.
	await expect(pageB.locator('.alert.alert-warning')).toHaveCount(0);

	const cards = pageB.locator('article[id^="question-"]');
	await expect(cards).toHaveCount(3);
	const first = pageB.locator('#question-0');
	const second = pageB.locator('#question-1');
	const third = pageB.locator('#question-2');
	await expect(first.locator('.review-card-head .badge')).toHaveText('Correct');
	await expect(second.locator('.review-card-head .badge')).toHaveText('Incorrect');
	await expect(third.locator('.review-card-head .badge')).toHaveText('Not Answered');

	// Marks parity: 2 for the correct answer minus 0.5 for the wrong one.
	await expect(pageB.locator('.hero-compare.is-best')).toContainText('1.5/6 marks');

	// Wrong and unanswered questions start expanded; the correct one does not.
	await expect(first.locator('.review-card-head')).toHaveAttribute('aria-expanded', 'false');
	await expect(second.locator('.review-card-head')).toHaveAttribute('aria-expanded', 'true');
	await expect(second.locator('p', { hasText: 'Correct Answer' })).toContainText('Beta');

	// Explanations work from another device: the request carries the answer,
	// and the seeded cache row is served.
	await first.locator('.review-card-head').click();
	await expect(first.locator('.review-card-head')).toHaveAttribute('aria-expanded', 'true');
	await first.getByRole('button', { name: 'Generate Explanation' }).click();
	await expect(first).toContainText(SEEDED_EXPLANATION);
	expect(explainPayloads).toHaveLength(1);
	expect(explainPayloads[0].answer).toBe('Alpha');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				testId,
				userId: user.id,
				submittedScore: 1,
				marksRow: '1.5/6',
				explainAnswer: explainPayloads[0]?.answer,
			},
			null,
			2
		),
	});

	await contextB.close();
});

test('an anonymous visitor never receives the answer key or the review', async ({
	browser,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');
	const testId = await seedPaper(sql);

	// Fresh anonymous context: no session, no storage.
	const context = await browser.newContext();
	const anon = await context.newPage();

	const response = await anon.request.get(`${TEST_ORIGIN}/api/test?id=${testId}`);
	expect(response.ok()).toBeTruthy();
	const body = await response.json();
	expect(body.myAttempt).toBeNull();
	expect(body.test.questions.every((question) => question.answer === undefined)).toBe(true);
	expect(JSON.stringify(body)).not.toContain('correctAnswer');

	await anon.goto(`${TEST_ORIGIN}/results?id=${testId}`);
	await expect(anon.locator('.alert.alert-warning')).toContainText('has not been submitted');
	await expect(anon.locator('article[id^="question-"]')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				testId,
				myAttempt: body.myAttempt,
				answerKeyPresent: body.test.questions.some(
					(question) => question.answer !== undefined
				),
			},
			null,
			2
		),
	});

	await context.close();
});

test('a device that already holds the paper but not the attempt still loads the review', async ({
	browser,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');
	const testId = await seedPaper(sql);

	// The attempt exists on the server for this device, but the graded result
	// never landed here: this is a device that opened the result with the
	// pre-CHG-0013 code, so local history holds the paper while the attempt
	// only lives on the server.
	const deviceId = 'e2e-stale-paper-device-01';
	const submit = await request.post('/api/test/submit', {
		data: { id: testId, answers: { 0: 'Alpha', 1: 'Delta' }, timeTaken: 42 },
		headers: { 'x-client-id': deviceId },
	});
	expect(submit.ok()).toBeTruthy();

	const context = await browser.newContext();
	await context.addInitScript(
		({ id, topic, questions, deviceId }) => {
			localStorage.setItem('selftest_welcome_tour_done_at', '1759000000000');
			localStorage.setItem('selftest_client_id', deviceId);
			localStorage.setItem(
				'selftest_history',
				JSON.stringify([
					{
						id,
						topic,
						timestamp: Date.now(),
						questions,
						userAnswers: { 0: 'Alpha', 1: 'Delta' },
						score: 1,
						totalQuestions: questions.length,
						timeTaken: 42,
					},
				])
			);
		},
		{
			id: testId,
			topic: PROBE_TOPIC,
			questions: PROBE_QUESTIONS.map(({ question, options }) => ({ question, options })),
			deviceId,
		}
	);
	const page = await context.newPage();
	await stubPersonalize(page);
	// This page renders the review list; keep its verdict hermetic too.
	await stubVisualFit(page);
	await page.goto(`${TEST_ORIGIN}/results?id=${testId}`);

	// The cached paper alone cannot render the review; the page must fetch the
	// graded attempt for this device and fill it in.
	await expect(page.locator('.alert.alert-warning')).toHaveCount(0);
	const first = page.locator('#question-0');
	const second = page.locator('#question-1');
	await expect(first.locator('.review-card-head .badge')).toHaveText('Correct');
	await expect(second.locator('.review-card-head .badge')).toHaveText('Incorrect');
	await expect(second.locator('p', { hasText: 'Correct Answer' })).toContainText('Beta');

	const seeded = await page.evaluate(
		(id) => localStorage.getItem(`selftest_attempt_result_${id}`),
		testId
	);
	expect(seeded, 'the graded attempt should be seeded locally for later visits').toBeTruthy();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ testId, deviceId, seededLocally: Boolean(seeded) }, null, 2),
	});

	await context.close();
});
