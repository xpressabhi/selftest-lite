import { splitLang } from '$lib/shared/seo';

// Renders <html lang> on the server so /hi pages are Hindi for crawlers and
// first paint; client-side navigation updates the attribute from the app shell.
/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const { lang } = splitLang(event.url.pathname);
	const htmlLang = lang === 'hindi' ? 'hi' : 'en';
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', htmlLang),
	});
}
