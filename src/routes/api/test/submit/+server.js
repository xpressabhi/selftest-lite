import { json } from '@sveltejs/kit';
import {
	createTestAttempt,
	getClientKey,
	getTestRecordById,
	logApiEvent,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { parseRequestBody } from '$lib/server/quizValidation';
import { MAX_ANSWER_TEXT_LENGTH } from '$lib/server/quizConfig';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';

const SUBMIT_RATE_LIMIT = 10;
const MAX_TIME_TAKEN_SECONDS = 6 * 60 * 60;

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

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

			return json(
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
				},
			);
		}

		const { id, answers, timeTaken } = await parseRequestBody(request);

		const testId = Number(id);
		if (!Number.isInteger(testId) || testId <= 0) {
			return json(
				{ error: 'Invalid test ID', code: 'INVALID_TEST_ID' },
				{ status: 400 },
			);
		}

		if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
			return json(
				{ error: 'Answers must be an object', code: 'INVALID_ANSWERS' },
				{ status: 400 },
			);
		}

		const testRecord = await getTestRecordById(testId);
		if (!testRecord) {
			return json(
				{ error: 'Test not found', code: 'TEST_NOT_FOUND' },
				{ status: 404 },
			);
		}

		const questions = testRecord.test?.questions;
		if (!Array.isArray(questions) || questions.length === 0) {
			return json(
				{ error: 'Test has no questions', code: 'TEST_INVALID_CONTENT' },
				{ status: 500 },
			);
		}

		const maxIndex = questions.length - 1;
		const gradedAnswers = new Map();
		for (const [rawIndex, rawAnswer] of Object.entries(answers)) {
			const index = Number(rawIndex);
			if (!Number.isInteger(index) || index < 0 || index > maxIndex) {
				continue;
			}
			const value =
				typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
			if (
				!value ||
				value.length > MAX_ANSWER_TEXT_LENGTH
			) {
				continue;
			}
			gradedAnswers.set(index, value);
		}

		const results = questions.map((question, index) => {
			const yourAnswer = gradedAnswers.get(index) || null;
			const correctAnswer =
				typeof question?.answer === 'string' ? question.answer : null;
			return {
				index,
				correct:
					yourAnswer !== null &&
					correctAnswer !== null &&
					yourAnswer === correctAnswer,
				yourAnswer,
				correctAnswer,
			};
		});
		const score = results.filter((result) => result.correct).length;
		const normalizedTimeTaken = Math.min(
			Math.max(Number(timeTaken) || 0, 0),
			MAX_TIME_TAKEN_SECONDS,
		);
		const answeredMap = {};
		for (const [index, value] of gradedAnswers) {
			answeredMap[index] = value;
		}

		try {
			await createTestAttempt({
				testId,
				score,
				totalQuestions: results.length,
				timeTaken: Math.round(normalizedTimeTaken),
				userId: user?.id || null,
				clientId,
				userAnswers: answeredMap,
			});
		} catch (attemptError) {
			// Grading must succeed even if attempt persistence fails.
			console.error('Failed to persist test attempt:', attemptError);
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
			},
		});

		return json({
			id: testId,
			score,
			totalQuestions: results.length,
			timeTaken: normalizedTimeTaken,
			results,
		});
	} catch (error) {
		console.error(error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 },
			);
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 },
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

		return json(
			{
				error: 'An error occurred while submitting the test',
				code: 'SUBMIT_FAILED',
			},
			{ status: 500 },
		);
	}
}
