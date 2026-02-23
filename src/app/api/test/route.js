import { NextResponse } from 'next/server';
import {
	createTestRecord,
	getTestRecordById,
	getUserTestAttemptByTestId,
	listTestRecords,
} from '../utils/storage';
import { getAuthenticatedUser } from '../utils/auth';

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
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

			return NextResponse.json({ tests });
		}

		const authUser = await getAuthenticatedUser(request);
		const testRecord = await getTestRecordById(id);
		if (!testRecord) {
			return NextResponse.json({ error: 'Test not found' }, { status: 404 });
		}

		const myAttempt = authUser?.id
			? await getUserTestAttemptByTestId(authUser.id, id)
			: null;

		return NextResponse.json({
			...testRecord,
			myAttempt,
		});
	} catch (error) {
		console.error('Database error:', error);
		return NextResponse.json(
			{ error: 'An error occurred while fetching the test' },
			{ status: 500 },
		);
	}
}

export async function POST(request) {
	try {
		const { test, requestParams = {} } = await request.json();
		const authUser = await getAuthenticatedUser(request);

		if (!test) {
			return NextResponse.json(
				{ error: 'Test data is required' },
				{ status: 400 },
			);
		}

		const testId = await createTestRecord(
			test,
			requestParams,
			{
				createdByUserId: authUser?.id || null,
			},
		);

		return NextResponse.json({
			message: 'Test created successfully',
			id: testId,
		});
	} catch (error) {
		console.error('Database error:', error);
		return NextResponse.json(
			{ error: 'An error occurred while creating the test' },
			{ status: 500 },
		);
	}
}
