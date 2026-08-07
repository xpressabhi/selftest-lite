// Handles Android App Links inside the Capacitor app (e.g. a shared
// selftest.in/test?id=1234 URL). The app loads the remote site in its
// WebView, so deep links must be routed client-side via the SvelteKit router.
import { goto } from '$app/navigation';

const APP_HOSTS = new Set(['selftest.in', 'www.selftest.in']);

function navigateToAppUrl(url) {
	try {
		const parsed = new URL(url);
		if (!APP_HOSTS.has(parsed.hostname)) {
			return;
		}
		const target = parsed.pathname + parsed.search + parsed.hash;
		const current = window.location.pathname + window.location.search + window.location.hash;
		if (target !== current) {
			void goto(target);
		}
	} catch {
		// Malformed URLs are ignored.
	}
}

export async function initDeepLinks() {
	if (typeof window === 'undefined') {
		return;
	}
	if (!window.Capacitor?.isNativePlatform?.()) {
		return;
	}

	const { App } = await import('@capacitor/app');

	App.addListener('appUrlOpen', ({ url }) => {
		navigateToAppUrl(url);
	});

	// Cold start: the app was launched by the deep link before any listener
	// could attach; the launch URL is delivered by the plugin on demand.
	const launch = await App.getLaunchUrl();
	if (launch?.url) {
		navigateToAppUrl(launch.url);
	}
}
