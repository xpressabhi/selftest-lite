import { NextResponse } from 'next/server';
import {
	createTestRecord,
	getTestRecordById,
	listTestRecords,
} from '../utils/storage';

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get('id');
		const search = searchParams.get('q') || '';
		const limit = searchParams.get('limit') || '10';

		if (!id) {
			const tests = await listTestRecords({
				search,
				limit: Number(limit),
			});

			return NextResponse.json({ tests });
		}

		const testRecord = await getTestRecordById(id);
		if (!testRecord) {
			return NextResponse.json({ error: 'Test not found' }, { status: 404 });
		}

		return NextResponse.json(testRecord);
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

		if (!test) {
			return NextResponse.json(
				{ error: 'Test data is required' },
				{ status: 400 },
			);
		}

		const testId = await createTestRecord(test, requestParams);

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
