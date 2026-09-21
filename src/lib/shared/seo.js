// Single source of truth for the site's search-facing identity.
// Keep origin, noindex routing and hreflang pairs here so pages never
// hardcode them.

export const SITE_ORIGIN = 'https://www.selftest.in';

// App-shell pages that must never be indexed. They stay out of the sitemap,
// carry `robots: noindex` in their own head and must not emit a canonical or
// og:url pointing crawlers at them.
export const NOINDEX_PREFIXES = ['/test', '/results', '/history', '/bookmarks', '/profile', '/admin'];

export const HINDI_PREFIX = '/hi';

const OG_LOCALES = {
	english: 'en_IN',
	hindi: 'hi_IN',
};

export function isNoindexPath(pathname) {
	return NOINDEX_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

/**
 * Splits a pathname into its language and the language-neutral path.
 * `/hi/practice/ssc-cgl` → `{ lang: 'hindi', path: '/practice/ssc-cgl' }`
 */
export function splitLang(pathname) {
	if (pathname === HINDI_PREFIX) {
		return { lang: 'hindi', path: '/' };
	}
	if (pathname.startsWith(`${HINDI_PREFIX}/`)) {
		return { lang: 'hindi', path: pathname.slice(HINDI_PREFIX.length) };
	}
	return { lang: 'english', path: pathname };
}

/**
 * The URL for the same page in another language, or null when the page has no
 * twin (app-shell pages, unknown paths). Pure: used by the language toggle,
 * hreflang alternates and tests.
 */
export function languageHref(pathname, targetLang) {
	const { path } = splitLang(pathname);
	if (isNoindexPath(path)) {
		return null;
	}
	if (targetLang === 'hindi') {
		return path === '/' ? HINDI_PREFIX : `${HINDI_PREFIX}${path}`;
	}
	return path;
}

/**
 * Head payload for an indexable page. `path` is the canonical pathname for the
 * page's language (e.g. `/practice/ssc-cgl` or `/hi/practice/ssc-cgl`).
 *
 * Phase 1 emits canonical + x-default only; the en-IN/hi-IN hreflang pair is
 * added together with the /hi route tree so alternates never point at 404s.
 */
export function buildSeo({ path, lang = 'english', type = 'website' }) {
	const indexable = !isNoindexPath(path);
	const canonical = indexable ? `${SITE_ORIGIN}${path}` : null;
	return {
		indexable,
		canonical,
		ogType: type,
		ogUrl: canonical,
		ogLocale: OG_LOCALES[lang] ?? OG_LOCALES.english,
		ogLocaleAlternate: lang === 'hindi' ? OG_LOCALES.english : OG_LOCALES.hindi,
		alternates: canonical ? [{ hreflang: 'x-default', href: canonical }] : [],
	};
}
