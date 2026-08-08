import adapter from '@sveltejs/adapter-vercel';

const config = {
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
		}),
		alias: {
			$lib: 'src/lib',
			$routes: 'src/routes',
		},
		// Inline stylesheet chunks into the SSR HTML. Saves a network round trip
		// on slow connections (FCP win) at the cost of a larger document; the
		// document is cached by the service worker on repeat visits.
		inlineStyleThreshold: 100000,
	},
};

export default config;
