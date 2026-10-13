import { GOOGLE_SITE_VERIFICATION } from '$app/env/private';

export function load() {
	// Optional: set GOOGLE_SITE_VERIFICATION in the hosting env after
	// claiming the property in Search Console. Empty = no tag rendered.
	return { googleSiteVerification: GOOGLE_SITE_VERIFICATION || '' };
}
