import { injectAnalytics } from '@vercel/analytics/sveltekit';
import { get } from 'svelte/store';
import { activeLanguage } from '$lib/client/i18n';
import { loadDictionary } from '$lib/client/locales';
import { isNoindexPath, splitLang } from '$lib/shared/seo';

// Language for this render. Indexable pages take it from the URL so SSR and
// prerender are deterministic (and Hindi is fetched before anything renders);
// app-shell pages return null and follow the saved preference instead.
export async function load({ url }) {
	const { lang, path } = splitLang(url.pathname);
	if (isNoindexPath(path)) {
		return { lang: null };
	}
	if (lang === 'hindi') {
		await loadDictionary('hindi');
	}
	if (get(activeLanguage) !== lang) {
		activeLanguage.set(lang);
	}
	return { lang };
}

// Single canonical URL per page: /about serves, /about/ redirects.
// Prevents trailing-slash duplicate content in the index.
export const trailingSlash = 'never';

const isLocalDevelopment =
	typeof window !== 'undefined' &&
	['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

// Data-saver users opted into saving bandwidth: skip the analytics script
// (~2KB + tracking calls) for them. Reads localStorage directly because the
// store in preferences.js isn't hydrated yet at module load time.
let dataSaverKey = null;
if (typeof window !== 'undefined') {
	try {
		dataSaverKey = window.localStorage.getItem('dataSaverMode');
	} catch {
		// Private mode / blocked storage: fall back to the connection signals.
		dataSaverKey = null;
	}
}
const connection =
	typeof navigator !== 'undefined'
		? navigator.connection || navigator.mozConnection || navigator.webkitConnection
		: null;
const slowConnection =
	Boolean(connection?.saveData) ||
	['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || '').toLowerCase());
const isDataSaverActive = dataSaverKey === 'true' || (dataSaverKey === null && slowConnection);

if (!isDataSaverActive) {
	injectAnalytics({
		// Do not rely on esm-env's build-time mode resolution; deployed builds can
		// otherwise be emitted as development and silently disable tracking.
		mode: isLocalDevelopment ? 'development' : 'production',
	});
}
