#!/usr/bin/env node
// Concept-artifact evaluation harness.
//
// Generates explainers with the production pipeline (same code path as
// /api/playground), loads each composed document in Chromium, and reports
// validity, console errors, animation activity, external requests and byte
// sizes. The report is the evidence that picks ARTIFACT_MODEL — see
// docs/superpowers/specs/2026-10-14-playground-explainer-design.md, section 9.
//
// Usage:
//   npm run eval:artifact
//   npm run eval:artifact -- --limit=2 --model=gemini-flash-latest
//   npm run eval:artifact -- --strict
//
// Exit code is 0 unless --strict is passed and a gate fails.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { composeArtifactDocument } from '../src/lib/server/artifactScaffold.js';
import { generateExplainerArtifact } from '../src/lib/server/explainerPipeline.js';
import {
	ARTIFACT_MODEL,
	ARTIFACT_OPENCODE_MODEL,
	MAX_ARTIFACT_DOCUMENT_BYTES,
	OPENCODE_INFERENCE_BASE_URL,
} from '../src/lib/server/quizConfig.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const getArg = (name, fallback) => {
	const found = args.find((argument) => argument.startsWith(`--${name}=`));
	return found ? found.split('=').slice(1).join('=') : fallback;
};

const strict = hasFlag('strict');
const provider = getArg('provider', 'gemini');
const model = getArg('model', provider === 'opencode' ? ARTIFACT_OPENCODE_MODEL : ARTIFACT_MODEL);
const baseUrl = getArg('base-url', OPENCODE_INFERENCE_BASE_URL);
const limit = Number(getArg('limit', '0')) || 0;
const apiKey =
	provider === 'opencode' ? process.env.OPENCODE_API_KEY : process.env.GEMINI_API_KEY;

if (!apiKey) {
	console.error(
		provider === 'opencode'
			? 'OPENCODE_API_KEY is not set — export it or add it to .env.local'
			: 'GEMINI_API_KEY is not set — run via npm run eval:artifact (loads .env)'
	);
	process.exit(1);
}

const allConcepts = JSON.parse(readFileSync(join(here, 'eval-artifact-concepts.json'), 'utf8'));
const concepts = limit > 0 ? allConcepts.slice(0, limit) : allConcepts;

const outDir = join('test-results', 'artifact-eval');
mkdirSync(outDir, { recursive: true });

function slugify(topic, index) {
	const slug = topic
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || `concept-${index + 1}`;
}

function sampleScript() {
	return () => {
		const animations = document.getAnimations
			? document.getAnimations().filter((animation) => animation.playState === 'running').length
			: 0;
		return {
			animations,
			mutations: window.__artifactMutations ?? 0,
			controls: document.querySelectorAll('button, input, select, [role="button"]').length,
		};
	};
}

const browser = await chromium.launch();
const results = [];

for (const [index, concept] of concepts.entries()) {
	const slug = slugify(concept.topic, index);
	const startedAt = Date.now();
	const result = {
		topic: concept.topic,
		language: concept.language,
		ok: false,
		animated: false,
		error: null,
		consoleErrors: [],
		pageErrors: [],
		externalRequests: [],
		animations: 0,
		mutations: 0,
		controls: 0,
		bytes: null,
		durationMs: 0,
	};

	let generation = null;
	try {
		generation = await generateExplainerArtifact({
			...concept,
			apiKey,
			provider,
			baseUrl,
			artifactModel: model,
		});
		result.ok = true;
	} catch (error) {
		result.error = `${error?.name || 'Error'}: ${error?.message || error}`;
	}

	if (generation) {
		const document = composeArtifactDocument({
			brief: generation.brief,
			payload: generation.payload,
			language: concept.language,
			theme: 'light',
		});
		result.bytes = {
			document: Buffer.byteLength(document, 'utf8'),
			html: Buffer.byteLength(generation.payload.html, 'utf8'),
			css: Buffer.byteLength(generation.payload.css, 'utf8'),
			js: Buffer.byteLength(generation.payload.js, 'utf8'),
			overBudget: Buffer.byteLength(document, 'utf8') > MAX_ARTIFACT_DOCUMENT_BYTES,
		};

		const context = await browser.newContext();
		await context.route('**/*', async (route) => {
			result.externalRequests.push(route.request().url());
			await route.abort();
		});
		const page = await context.newPage();
		page.on('console', (message) => {
			if (message.type() === 'error') {
				result.consoleErrors.push(message.text());
			}
		});
		page.on('pageerror', (error) => {
			result.pageErrors.push(String(error));
		});

		try {
			await page.setContent(document, { waitUntil: 'load' });
			await page.evaluate(() => {
				window.__artifactMutations = 0;
				new MutationObserver((records) => {
					window.__artifactMutations += records.length;
				}).observe(document.documentElement, {
					subtree: true,
					childList: true,
					attributes: true,
					characterData: true,
				});
			});
			await page.waitForTimeout(400);
			const first = await page.evaluate(sampleScript());
			await page.waitForTimeout(1500);
			const second = await page.evaluate(sampleScript());
			result.animations = Math.max(first.animations, second.animations);
			result.mutations = second.mutations;
			result.controls = second.controls;
			result.animated =
				result.animations > 0 || result.mutations > 0 || result.controls > 0;
			if (result.consoleErrors.length > 0 || result.pageErrors.length > 0) {
				result.ok = false;
			}
			await page.screenshot({ path: join(outDir, `${slug}.png`), fullPage: true });
		} catch (error) {
			result.ok = false;
			result.error = `render: ${error?.message || error}`;
		} finally {
			await context.close();
		}
	}

	result.durationMs = Date.now() - startedAt;
	results.push(result);
	console.log(
		[
			result.ok ? 'ok  ' : 'FAIL',
			result.animated ? 'anim' : '----',
			`${String(result.durationMs).padStart(6)}ms`,
			result.bytes ? `${String(result.bytes.document).padStart(6)}B` : '     -',
			result.topic,
			result.error ? `— ${result.error}` : '',
		].join(' ')
	);
}

await browser.close();

const totals = {
	concepts: results.length,
	ok: results.filter((result) => result.ok).length,
	animated: results.filter((result) => result.animated).length,
	externalRequests: results.reduce((sum, result) => sum + result.externalRequests.length, 0),
	overBudget: results.filter((result) => result.bytes?.overBudget).length,
	consoleErrors: results.reduce(
		(sum, result) => sum + result.consoleErrors.length + result.pageErrors.length,
		0
	),
};

const report = { generatedAt: new Date().toISOString(), provider, model, totals, concepts: results };
writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, '\t')}\n`);

console.log(`\nprovider: ${provider}`);
console.log(`model: ${model}`);
console.log(JSON.stringify(totals, null, 2));
console.log(`report: ${join(outDir, 'report.json')}`);

if (strict) {
	const okGate = Math.ceil(results.length * 0.875);
	const animatedGate = Math.ceil(results.length * 0.75);
	const failed =
		totals.ok < okGate ||
		totals.animated < animatedGate ||
		totals.externalRequests > 0 ||
		totals.overBudget > 0;
	if (failed) {
		console.error(
			`strict gates failed (ok >= ${okGate}, animated >= ${animatedGate}, external requests = 0, over-budget = 0)`
		);
		process.exit(1);
	}
	console.log('strict gates passed');
}
