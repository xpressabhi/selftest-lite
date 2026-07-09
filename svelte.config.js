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
	},
};

export default config;
