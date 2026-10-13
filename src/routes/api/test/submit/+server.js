import { createTestAttempt, getTestRecordById, logApiEvent } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';
import { parseRequestBody } from '#lib/server/requestBody.js';
import { sanitizeHintedIndexes } from '#lib/server/hint.js';
import { markTestsSubmitted } from '#lib/server/testStats.js';
import { computeAttemptMarks } from '#lib/shared/marks.js';
import { gradeAttemptResults } from '#lib/shared/grading.js';
import { MAX_ANSWER_TEXT_LENGTH } from '#lib/server/quizConfig.js';
import { API_LIMIT_ERROR_CODE } from '#lib/shared/apiLimitError.js';

const SUBMIT_RATE_LIMIT = 10;
const MAX_TIME_TAKEN_SECONDS = 6 * 60 * 60;

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/test:submit',
			limit: SUBMIT_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/test:submit',
				action: 'submit_test',
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});

			return Response.json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': String(SUBMIT_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const { id, answers, timeTaken, hintedIndexes, name } = await parseRequestBody(request);

		const testId = Number(id);
		if (!Number.isInteger(testId) || testId <= 0) {
			return Response.json({ error: 'Invalid test ID', code: 'INVALID_TEST_ID' }, { status: 400 });
		}

		if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
			return Response.json(
				{ error: 'Answers must be an object', code: 'INVALID_ANSWERS' },
				{ status: 400 }
			);
		}

		const testRecord = await getTestRecordById(testId);
		if (!testRecord) {
			return Response.json({ error: 'Test not found', code: 'TEST_NOT_FOUND' }, { status: 404 });
		}

		const questions = testRecord.test?.questions;
		if (!Array.isArray(questions) || questions.length === 0) {
			return Response.json(
				{ error: 'Test has no questions', code: 'TEST_INVALID_CONTENT' },
				{ status: 500 }
			);
		}

		const maxIndex = questions.length - 1;
		const gradedAnswers = new Map();
		for (const [rawIndex, rawAnswer] of Object.entries(answers)) {
			const index = Number(rawIndex);
			if (!Number.isInteger(index) || index < 0 || index > maxIndex) {
				continue;
			}
			const value = typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
			if (!value || value.length > MAX_ANSWER_TEXT_LENGTH) {
				continue;
			}
			gradedAnswers.set(index, value);
		}

		const answeredMap = {};
		for (const [index, value] of gradedAnswers) {
			answeredMap[index] = value;
		}

		const results = gradeAttemptResults(questions, answeredMap);
		const score = results.filter((result) => result.correct).length;
		const normalizedTimeTaken = Math.min(
			Math.max(Number(timeTaken) || 0, 0),
			MAX_TIME_TAKEN_SECONDS
		);
		// Hint usage is tracked only: verified against the stored key (a
		// cheating payload is dropped, grading never fails because of it).
		const cleanHints = sanitizeHintedIndexes(hintedIndexes, questions);

		const marksResult = computeAttemptMarks({
			questions,
			answers: answeredMap,
			sections: testRecord.test?.sections || [],
		});

		try {
			await createTestAttempt({
				testId,
				score,
				totalQuestions: results.length,
				timeTaken: Math.round(normalizedTimeTaken),
				userId: user?.id || null,
				clientId,
				userAnswers: answeredMap,
				hintedIndexes: cleanHints,
				marks: marksResult?.marks ?? null,
				totalMarks: marksResult?.totalMarks ?? null,
			});
		} catch (attemptError) {
			// Grading must succeed even if attempt persistence fails.
			console.error('Failed to persist test attempt:', attemptError);
		}

		try {
			await markTestsSubmitted({
				testIds: [testId],
				userId: user?.id || null,
				clientId,
				displayName: name,
			});
		} catch (markError) {
			console.error('Failed to mark test submitted:', markError);
		}

		await logApiEvent({
			route: '/api/test:submit',
			action: 'submit_test',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: {
				testId,
				score,
				totalQuestions: results.length,
				answeredCount: gradedAnswers.size,
				hintedCount: Object.keys(cleanHints).length,
			},
		});

		return Response.json({
			id: testId,
			score,
			totalQuestions: results.length,
			timeTaken: normalizedTimeTaken,
			results,
			marks: marksResult?.marks ?? null,
			totalMarks: marksResult?.totalMarks ?? null,
		});
	} catch (error) {
		console.error(error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return Response.json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 }
			);
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return Response.json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}

		await logApiEvent({
			route: '/api/test:submit',
			action: 'submit_test',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});

		return Response.json(
			{
				error: 'An error occurred while submitting the test',
				code: 'SUBMIT_FAILED',
			},
			{ status: 500 }
		);
	}
}
