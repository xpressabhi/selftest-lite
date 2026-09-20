import { json } from '@sveltejs/kit';
import * as z from 'zod';
import {
	getMyAttemptForIdentity,
	getClientKey,
	getTestRecordById,
	logApiEvent,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
} from '$lib/server/quizValidation';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';
import { pickElimination } from '$lib/server/hint';

// Abuse control only; the per-test hint cap (3) is enforced at submit time
// against the stored attempt, so this bucket can stay generous.
const HINT_RATE_LIMIT = 20;
const HINT_RATE_WINDOW_MS = 60 * 1000;

const requestSchema = z.object({
	id: z.union([z.string(), z.number()]),
	index: z.number().int().min(0),
});

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	let body;
	try {
		body = await parseRequestBody(request);
	} catch (error) {
		if (error instanceof RequestBodyTooLargeError) {
			return json({ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' }, { status: 413 });
		}
		if (error instanceof InvalidRequestBodyError) {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}
		throw error;
	}

	const parsed = requestSchema.safeParse(body);
	const testId = Number(parsed.success ? parsed.data.id : NaN);
	const index = parsed.success ? parsed.data.index : NaN;
	if (!parsed.success || !Number.isInteger(testId) || testId <= 0) {
		return json({ error: 'Invalid test ID', code: 'INVALID_TEST_ID' }, { status: 400 });
	}

	const rateLimit = await rateLimiter(request, {
		bucket: '/api/test/hint',
		limit: HINT_RATE_LIMIT,
		windowMs: HINT_RATE_WINDOW_MS,
	});
	if (rateLimit.limited) {
		return json(
			{ error: 'Rate limit exceeded. Please try again later.', code: API_LIMIT_ERROR_CODE },
			{ status: 429 }
		);
	}

	const testRecord = await getTestRecordById(testId);
	const questions = testRecord?.test?.questions;
	if (!testRecord || !Array.isArray(questions) || questions.length === 0) {
		return json({ error: 'Test not found', code: 'TEST_NOT_FOUND' }, { status: 404 });
	}
	if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
		return json({ error: 'Invalid question index', code: 'INVALID_INDEX' }, { status: 400 });
	}

	// Hints are for in-progress attempts only; submitted papers keep their key.
	const attempt = await getMyAttemptForIdentity(testId, {
		userId: user?.id,
		clientId,
	}).catch(() => null);
	if (attempt) {
		return json(
			{ error: 'Test already submitted', code: 'TEST_ALREADY_SUBMITTED' },
			{ status: 404 }
		);
	}

	const question = questions[index];
	const eliminated = pickElimination({
		options: question?.options,
		answer: question?.answer,
	});
	if (eliminated.length !== 2) {
		return json(
			{ error: 'No hint available for this question', code: 'HINT_UNAVAILABLE' },
			{ status: 400 }
		);
	}

	// Indexes only — the answer key never leaves the server.
	await logApiEvent({
		route: '/api/test/hint',
		action: 'test_hint',
		clientKey,
		clientId,
		request,
		statusCode: 200,
		durationMs: Date.now() - startedAt,
		userId: user?.id || null,
		metadata: { testId, index },
	});

	return json({ eliminated });
}
