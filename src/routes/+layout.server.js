import { env } from '$env/dynamic/private';

export function load() {
	// Optional: set GOOGLE_SITE_VERIFICATION in the hosting env after
	// claiming the property in Search Console. Empty = no tag rendered.
	return {
		googleSiteVerification: env.GOOGLE_SITE_VERIFICATION || '',
	};
}
