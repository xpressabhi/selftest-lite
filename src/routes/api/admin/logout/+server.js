import { json } from '@sveltejs/kit';
import { ADMIN_COOKIE_NAME } from '$lib/server/adminAuth';

export async function POST({ cookies }) {
	cookies.delete(ADMIN_COOKIE_NAME, { path: '/' });
	return json({ ok: true });
}
