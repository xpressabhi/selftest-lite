import { ADMIN_COOKIE_NAME } from '#lib/server/adminAuth.js';

export async function POST({ cookies }) {
	cookies.delete(ADMIN_COOKIE_NAME, { path: '/' });
	return Response.json({ ok: true });
}
