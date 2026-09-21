// Single source of truth for the site's search-facing identity.
// Keep origin, noindex routing and (from phase 2) hreflang pairs here so
// pages never hardcode them.

export const SITE_ORIGIN = 'https://www.selftest.in';

// App-shell pages that must never be indexed. They stay out of the sitemap,
// carry `robots: noindex` in their own head and must not emit a canonical or
// og:url pointing crawlers at them.
export const NOINDEX_PREFIXES = ['/test', '/results', '/history', '/bookmarks', '/profile', '/admin'];

export function isNoindexPath(pathname) {
	return NOINDEX_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}
