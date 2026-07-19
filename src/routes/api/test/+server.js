import { json } from '@sveltejs/kit';
import {
	createTestRecord,
	getTestRecordById,
	listTestRecords,
} from '$lib/server/storage';

export async function GET({ url }) {
	try {
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
			return json({ error: 'Test not found' }, { status: 404 });
		}

		return json({
			...testRecord,
			myAttempt: null,
		});
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ error: 'An error occurred while fetching the test' },
			{ status: 500 },
		);
	}
}

export async function POST({ request }) {
	try {
		const { test, requestParams = {} } = await request.json();

		if (!test) {
			return json(
				{ error: 'Test data is required' },
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
		return json(
			{ error: 'An error occurred while creating the test' },
			{ status: 500 },
		);
	}
}
