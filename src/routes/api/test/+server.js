import { json } from '@sveltejs/kit';
import {
	createTestRecord,
	getTestRecordById,
	listTestRecords,
} from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';
import { parseRequestBody, validateTestRecordPayload } from '$lib/server/quizValidation';

const SEARCH_RATE_LIMIT = 60;
const CREATE_RATE_LIMIT = 10;

function rateLimitHeaders(rateLimit) {
	return {
		'X-RateLimit-Limit': String(CREATE_RATE_LIMIT),
		'X-RateLimit-Remaining': rateLimit.remaining.toString(),
		'X-RateLimit-Reset': rateLimit.resetTime.toString(),
	};
}

export async function GET({ request, url }) {
	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/test:list',
			limit: SEARCH_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: rateLimitHeaders(rateLimit),
				},
			);
		}

		const { searchParams } = url;
		const id = searchParams.get('id');
		const search = searchParams.get('q') || '';
		const limit = searchParams.get('limit') || '10';
		const offset = searchParams.get('offset') || '0';
		const language = searchParams.get('language') || 'all';
		const examType = searchParams.get('examType') || 'all';

		if (!id) {
			const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
			const tests = await listTestRecords({
				search,
				limit: Math.min(requestedLimit + 1, 10),
				offset: Number(offset),
				language,
				examType,
			});
			const hasMore = tests.length > requestedLimit;

			return json({
				tests: hasMore ? tests.slice(0, requestedLimit) : tests,
				hasMore,
			});
		}

		const testRecord = await getTestRecordById(id);
		if (!testRecord) {
			return json(
				{ error: 'Test not found', code: 'TEST_NOT_FOUND' },
				{ status: 404 },
			);
		}

		return json({
			...testRecord,
			myAttempt: null,
		});
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ error: 'An error occurred while fetching the test', code: 'TEST_FETCH_ERROR' },
			{ status: 500 },
		);
	}
}

export async function POST({ request }) {
	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/test:create',
			limit: CREATE_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: rateLimitHeaders(rateLimit),
				},
			);
		}

		const { test, requestParams = {} } = await parseRequestBody(request);

		if (!test) {
			return json(
				{ error: 'Test data is required', code: 'TEST_DATA_REQUIRED' },
				{ status: 400 },
			);
		}

		const validationError = validateTestRecordPayload(test);
		if (validationError) {
			return json(
				{ error: validationError.message, code: validationError.code },
				{ status: 400 },
			);
		}

		const testId = await createTestRecord(test, requestParams);

		return json({
			message: 'Test created successfully',
			id: testId,
		});
	} catch (error) {
		console.error('Database error:', error);
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
		return json(
			{ error: 'An error occurred while creating the test', code: 'TEST_CREATE_ERROR' },
			{ status: 500 },
		);
	}
}
