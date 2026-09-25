#!/usr/bin/env node
// Guards a production build against being compiled in development mode.
//
// Vite derives `import.meta.env.DEV` / `PROD` from NODE_ENV when it resolves
// the config. If a build inherits NODE_ENV=development (a hosting dashboard
// variable, a wrapper script, ...) it keeps DEV-only code and strips every
// `import.meta.env.PROD` block — including the /sw.js registration in
// +layout.svelte — so the deployed app never gets a service worker. That
// shipped once; vite.config.js now forces production for builds and this check
// fails the build if that ever regresses.
//
// Run after `vite build`; wired into `npm run build` and `npm run check`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_DIR = '.svelte-kit/output/client';
const IMMUTABLE_DIR = join(CLIENT_DIR, '_app', 'immutable');
// A string that only survives compilation when import.meta.env.DEV is true.
const DEV_ONLY_CANARY = 'SquishSwitch: pass';
// Production-only code: the root layout registers the service worker.
const PROD_ONLY_NEEDLE = '/sw.js';

function walk(dir) {
	const files = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			files.push(...walk(path));
		} else if (path.endsWith('.js')) {
			files.push(path);
		}
	}
	return files;
}

let files;
try {
	files = walk(IMMUTABLE_DIR);
} catch {
	console.error(`check-build-mode: ${IMMUTABLE_DIR} not found — run \`vite build\` first`);
	process.exit(1);
}

const devChunks = [];
const prodChunks = [];
for (const file of files) {
	const source = readFileSync(file, 'utf8');
	if (source.includes(DEV_ONLY_CANARY)) {
		devChunks.push(file);
	}
	if (source.includes('serviceWorker.register') && source.includes(PROD_ONLY_NEEDLE)) {
		prodChunks.push(file);
	}
}

const failures = [];
if (devChunks.length > 0) {
	failures.push(`${devChunks.length} chunk(s) contain DEV-only code (${DEV_ONLY_CANARY})`);
}
if (prodChunks.length === 0) {
	failures.push(`no chunk registers the service worker (${PROD_ONLY_NEEDLE})`);
}

if (failures.length > 0) {
	console.error('check-build-mode: production build compiled in development mode');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	console.error(
		'  vite.config.js must force NODE_ENV=production for builds; check hosting env vars for NODE_ENV.'
	);
	process.exit(1);
}

console.log(
	`check-build-mode: OK — ${files.length} chunks, no DEV-only code, service worker registration present`
);
