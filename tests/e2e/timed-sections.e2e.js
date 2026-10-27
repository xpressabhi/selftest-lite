import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Pattern papers (the /exam-paper flow) carry sections, per-question marks and
// a negative-marking penalty. Grading already uses them; this pins the parts a
// student must see before and during the attempt, so a "full exam" never looks
// like a plain quiz.
test('a pattern paper shows its marks, penalty and section context', async ({
	page,
	request,
}, testInfo) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error?.message || error)));

	// The dev-only PGlite bridge shares the server's database; the feed read
	// runs ensureStorageSchema, so the seed below cannot race table creation.
	await page.goto('/');
	await request.get('/api/exam-notifications');
	const sql = sqlClient(request);
	await connectOrSkip(sql);

	const questions = Array.from({ length: 3 }, (_, index) => ({
		question: `Section probe ${index + 1}?`,
		options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
		answer: 'Alpha',
	}));
	const sections = [
		{
			id: 'gi',
			name: 'General Intelligence',
			questionTypes: ['mcq'],
			marksPerQuestion: 2,
			negativeMarks: 0.5,
			instructions: 'Two marks for a correct answer; 0.5 is deducted for a wrong one.',
			questionCount: 2,
			questionIndexes: [0, 1],
		},
		{
			id: 'ga',
			name: 'General Awareness',
			questionTypes: ['mcq'],
			marksPerQuestion: 2,
			negativeMarks: 0.5,
			instructions: null,
			questionCount: 1,
			questionIndexes: [2],
		},
	];
	const rows = await sql`
		INSERT INTO ai_test (test, topic, language, num_questions)
		VALUES (${JSON.stringify({
			topic: 'Section probe',
			questions,
			sections,
			examMeta: { examName: 'SSC CGL', durationMinutes: 3 },
		})}::jsonb, 'Section probe', 'english', 3)
		RETURNING id
	`;
	const testId = rows[0].id;

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`/test?id=${testId}`);

	await expect(page.locator('.test-marking-row')).toContainText('6 marks');
	await expect(page.locator('.test-marking-row')).toContainText('−0.5 for a wrong answer');
	await expect(page.locator('.test-timer')).toHaveCount(0);
	const marking = await page.locator('.test-marking-row').textContent();

	await page.getByRole('button', { name: 'Start Test' }).click();

	await expect(page.locator('.test-section-banner')).toContainText('General Intelligence');
	await expect(page.locator('.test-section-banner')).toContainText('2 marks each');
	await expect(page.locator('.test-section-banner')).toContainText('−0.5 if wrong');
	await expect(page.locator('.test-section-instructions')).toContainText('0.5 is deducted');

	// The header clock is a countdown, because the pattern supplied a duration.
	await expect
		.poll(
			async () =>
				page.locator('.test-timer').evaluate((el) => el.getAttribute('aria-label')),
			{ timeout: 5000 }
		)
		.toMatch(/^Time left: 0[23]:\d\d$/);

	// Section two has its own name and instructions (none), so the banner must
	// change with the question rather than staying on section one.
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.locator('.test-section-banner')).toContainText('General Awareness');
	await expect(page.locator('.test-section-banner')).toContainText('Section 2 of 2');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				testId,
				marking,
				banner: await page.locator('.test-section-banner').textContent(),
				timer: await page.locator('.test-timer').getAttribute('aria-label'),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});
