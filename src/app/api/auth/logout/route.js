import { NextResponse } from 'next/server';
import {
	clearSessionCookie,
	getRawSessionTokenFromRequest,
	revokeSessionByToken,
} from '../../utils/auth';

export async function POST(request) {
	try {
		const rawSessionToken = getRawSessionTokenFromRequest(request);
		if (rawSessionToken) {
			await revokeSessionByToken(rawSessionToken);
		}

		const response = NextResponse.json({ success: true });
		clearSessionCookie(response);
		return response;
	} catch (error) {
		console.error('Failed to sign out:', error);
		const response = NextResponse.json(
			{ error: 'Failed to sign out' },
			{ status: 500 },
		);
		clearSessionCookie(response);
		return response;
	}
}
