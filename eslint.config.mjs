import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
	{
		ignores: [
			'**/.svelte-kit/**',
			'**/.next/**',
			'**/.vercel/**',
			'**/build/**',
			'**/node_modules/**',
			'**/src/app/**',
			'**/src-next/**',
			'**/public/sw.js',
			'**/public/workbox-*.js',
		],
	},
	js.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			'no-console': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/no-dom-manipulating': 'off',
			'svelte/prefer-svelte-reactivity': 'off',
			'svelte/no-at-html-tags': 'off',
		},
	},
];
