import { NextResponse } from 'next/server';

export function proxy(request) {
	const { nextUrl } = request;
	const hostHeader = (request.headers.get('host') || '').toLowerCase();
	const hostname = hostHeader.split(':')[0];
	const isLocal =
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname.endsWith('.local');

	if (!isLocal && hostname === 'www.selftest.in') {
		const redirectUrl = nextUrl.clone();
		redirectUrl.hostname = 'selftest.in';
		redirectUrl.port = '';
		return NextResponse.redirect(redirectUrl, 308);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		'/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|icons/).*)',
	],
};
