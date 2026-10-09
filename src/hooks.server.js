import { splitLang } from '$lib/shared/seo';
import { rememberClientAddress } from '$lib/server/clientKey';

// Renders <html lang> on the server so /hi pages are Hindi for crawlers and
// first paint; client-side navigation updates the attribute from the app shell.
/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// getClientAddress() lives on the event, but routes pass the raw Request to
	// the rate limiter and telemetry helpers. Record the adapter-resolved peer
	// here, before resolve(), so those helpers can key per address instead of
	// collapsing every anonymous caller into one 'unknown' bucket.
	try {
		rememberClientAddress(event.request, event.getClientAddress());
	} catch {
		// Adapter without address support: getClientIp falls back to 'unknown'.
	}

	const { lang } = splitLang(event.url.pathname);
	const htmlLang = lang === 'hindi' ? 'hi' : 'en';
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', htmlLang),
	});
}
