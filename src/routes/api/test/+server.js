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
		const language = searchParams.get('language') || 'all';
		const examType = searchParams.get('examType') || 'all';

		if (!id) {
			const tests = await listTestRecords({
				search,
				limit: Number(limit),
				language,
				examType,
			});

			return json({ tests });
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
