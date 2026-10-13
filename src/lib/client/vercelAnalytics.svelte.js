// Vercel Web Analytics — SvelteKit 3 integration.
//
// The upstream helper (`injectAnalytics` from '@vercel/analytics/sveltekit')
// still imports the `page` store from `$app/stores`, which SvelteKit 3
// removed, so it cannot run on Kit 3 until @vercel/analytics ships a new
// release. This local drop-in keeps the same call signature and behaviour
// using only public Kit 3 APIs — swap back once the package supports Kit 3.
import { inject } from '@vercel/analytics';
import { browser } from '$app/env';
import { page } from '$app/state';

function getBasePath() {
	return import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH;
}

function getConfigString() {
	return import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG;
}

export function injectAnalytics(props = {}) {
	if (!browser) {
		return;
	}

	// Same script the upstream helper loads: auto-tracking off, because the
	// pageviews below carry the SvelteKit route id.
	inject(
		{
			...props,
			basePath: getBasePath(),
			disableAutoTrack: true,
			framework: 'sveltekit',
		},
		getConfigString()
	);

	// Replaces the upstream `page.subscribe(...)`: emits a pageview for the
	// initial page and for every client-side navigation.
	$effect.root(() => {
		$effect(() => {
			const routeId = page.route?.id;
			const path = page.url.pathname;
			if (routeId) {
				window.va?.('pageview', { route: routeId, path });
			}
		});
	});
}
