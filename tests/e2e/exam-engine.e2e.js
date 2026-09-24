import { expect, test } from '@playwright/test';
import { neon } from '@neondatabase/serverless';

// Exam engine: a discovered pattern is served from cache, and a generated
// pattern-based paper renders section headers on the test page and a
// per-section breakdown on the results page. Real dev server + local DB;
// skipped when DATABASE_URL is unavailable. No model calls.

// Vite precedence: .env.local overrides .env, and a pre-set process env wins.
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

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
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

async function connectOrSkip(sql) {
	try {
		await sql`SELECT 1 AS ok`;
	} catch {
		test.skip(true, 'Database is not reachable from the test runner');
	}
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

test('serves a cached exam pattern without a model call', async ({ request }, testInfo) => {
	test.skip(!databaseUrl, 'DATABASE_URL is not configured');
	const sql = neon(databaseUrl);
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
}, testInfo) => {
	test.skip(!databaseUrl, 'DATABASE_URL is not configured');
	const errors = await collectErrors(page);
	const sql = neon(databaseUrl);
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
		})),
		examMeta: {
			examName: 'E2E Pattern Exam',
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
	await page.getByRole('button', { name: 'Start Test' }).click();

	// First question carries the section header and instructions.
	await expect(page.locator('.test-section-banner')).toContainText('Section 1 of 2');
	await expect(page.locator('.test-section-name')).toHaveText('Section A');
	await expect(page.locator('.test-section-instructions')).toContainText(
		'Answer all questions.'
	);
	await expect(page.locator('.test-section-marks')).toContainText('2 marks each');

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

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ sections: names, scores }, null, 2),
	});
});
