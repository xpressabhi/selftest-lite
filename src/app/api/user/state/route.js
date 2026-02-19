import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../utils/auth';
import {
	getUserStorageState,
	listUserTestAttemptsWithTests,
	upsertUserStorageState,
	upsertUserTestAttempts,
} from '../../utils/storage';

function mapAttemptRow(row) {
	return {
		testId: row.test_id,
		userAnswers: row.user_answers || {},
		score: row.score,
		totalQuestions: row.total_questions,
		timeTaken: row.time_taken,
		submittedAt: row.submitted_at,
		metadata: row.metadata || {},
		test: row.test || null,
		testCreatedAt: row.created_at || null,
	};
}

export async function GET(request) {
	try {
		const authUser = await getAuthenticatedUser(request);
		if (!authUser?.id) {
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 },
			);
		}

		const [storage, attempts] = await Promise.all([
			getUserStorageState(authUser.id),
			listUserTestAttemptsWithTests(authUser.id, { limit: 200 }),
		]);

		return NextResponse.json({
			storage: storage || {},
			attempts: attempts.map(mapAttemptRow),
		});
	} catch (error) {
		console.error('Failed to fetch user state:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch user state' },
			{ status: 500 },
		);
	}
}

export async function POST(request) {
	try {
		const authUser = await getAuthenticatedUser(request);
		if (!authUser?.id) {
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 },
			);
		}

		const { storage = {}, attempts = [] } = await request.json();

		const [stateResult, attemptResults] = await Promise.all([
			upsertUserStorageState(authUser.id, storage),
			upsertUserTestAttempts(authUser.id, attempts),
		]);

		return NextResponse.json({
			success: true,
			storedKeys: Object.keys(stateResult?.storage || {}).length,
			storedAttempts: attemptResults.length,
		});
	} catch (error) {
		console.error('Failed to update user state:', error);
		return NextResponse.json(
			{ error: 'Failed to update user state' },
			{ status: 500 },
		);
	}
}
