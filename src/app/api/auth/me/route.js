import { NextResponse } from 'next/server';
import {
	clearSessionCookie,
	getSessionFromRequest,
	setSessionCookie,
} from '../../utils/auth';

export async function GET(request) {
	try {
		const session = await getSessionFromRequest(request, { refresh: true });
		if (!session) {
			const response = NextResponse.json({ user: null }, { status: 401 });
			clearSessionCookie(response);
			return response;
		}

		const response = NextResponse.json({ user: session.user });
		setSessionCookie(response, session.rawSessionToken, session.expiresAt);
		return response;
	} catch (error) {
		console.error('Failed to fetch session:', error);
		return NextResponse.json(
			{ error: 'Unable to resolve session' },
			{ status: 500 },
		);
	}
}
