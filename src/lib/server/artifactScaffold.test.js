import { describe, expect, it } from 'vitest';
import {
	ARTIFACT_SCAFFOLD_VERSION,
	ARTIFACT_RECIPES,
	RECIPE_IDS,
	composeArtifactDocument,
} from './artifactScaffold';

const brief = {
	concept: 'Ohm law',
	title: 'Ohm law, <b>visually</b>',
	summary: 'Voltage pushes <i>current</i>',
	level: 'class 10',
	recipes: ['step-reveal'],
	sections: [],
};

const payload = {
	html: '<div class="stage" id="artifact-body">BODY_MARKER</div>',
	css: '.stage { color: var(--brand); }',
	js: 'const el = document.querySelector("#artifact-body");',
};

const cspContent =
	"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'";

describe('composeArtifactDocument', () => {
	it('is deterministic', () => {
		const first = composeArtifactDocument({ brief, payload, language: 'english', theme: 'light' });
		const second = composeArtifactDocument({ brief, payload, language: 'english', theme: 'light' });
		expect(first).toBe(second);
	});

	it('builds exactly one html shell around the fragment', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english', theme: 'light' });
		expect(document.startsWith('<!doctype html><html')).toBe(true);
		expect(document.endsWith('</html>')).toBe(true);
		expect(document.match(/<html lang="en" data-theme="light">/g)).toHaveLength(1);
		expect(document.split('<html').length - 1).toBe(1);
	});

	it('maps language and theme attributes', () => {
		expect(
			composeArtifactDocument({ brief, payload, language: 'hindi', theme: 'dark' })
		).toContain('<html lang="hi" data-theme="dark">');
		expect(composeArtifactDocument({ brief, payload, language: 'english' })).toContain(
			'data-theme="light"'
		);
	});

	it('injects the exact CSP meta into every document', () => {
		expect(composeArtifactDocument({ brief, payload, language: 'english' })).toContain(
			`<meta http-equiv="Content-Security-Policy" content="${cspContent}" />`
		);
	});

	it('renders escaped title and summary server-side', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english' });
		expect(document).toContain('<title>Ohm law, &lt;b&gt;visually&lt;/b&gt;</title>');
		expect(document).toContain('<h1>Ohm law, &lt;b&gt;visually&lt;/b&gt;</h1>');
		expect(document).toContain('Voltage pushes &lt;i&gt;current&lt;/i&gt;');
		expect(document).not.toContain('<b>visually</b>');
	});

	it('slots the fragment and the model css', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english' });
		expect(document).toContain('BODY_MARKER');
		expect(document).toContain('.stage { color: var(--brand); }');
	});

	it('includes the height reporter and the reduced-motion probe', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english' });
		expect(document).toContain("'selftest-explainer-height'");
		expect(document).toContain('ResizeObserver');
		expect(document).toContain('prefers-reduced-motion: reduce');
		expect(document).toContain("setAttribute('data-motion'");
	});

	it('wraps model js in a strict-mode IIFE and skips it when empty', () => {
		const wrapped = composeArtifactDocument({ brief, payload, language: 'english' });
		expect(wrapped).toContain("(function () {\n'use strict';");
		expect(wrapped).toContain('const el = document.querySelector("#artifact-body");');
		const withoutJs = composeArtifactDocument({
			brief,
			payload: { ...payload, js: '' },
			language: 'english',
		});
		expect(withoutJs).not.toContain("'use strict'");
	});

	it('exposes a stable recipe menu and scaffold version', () => {
		expect(RECIPE_IDS).toEqual([
			'step-reveal',
			'timeline',
			'particle-flow',
			'orbit',
			'graph-plot',
			'toggle-compare',
		]);
		expect(ARTIFACT_RECIPES.every((recipe) => recipe.id && recipe.description)).toBe(true);
		expect(ARTIFACT_SCAFFOLD_VERSION).toBe('scaffold-v1');
	});
});
