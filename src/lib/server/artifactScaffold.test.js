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

	it('renders the escaped title only in head metadata, never a shell header', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english' });
		expect(document).toContain('<title>Ohm law, &lt;b&gt;visually&lt;/b&gt;</title>');
		expect(document).not.toContain('<b>visually</b>');
		expect(document).not.toContain('explainer-head');
		expect(document).not.toContain('<h1');
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
		expect(ARTIFACT_SCAFFOLD_VERSION).toBe('scaffold-v4');
	});

	it('ships the design-system base styles: tokens, radii, spacing and breakpoints', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english' });
		// Theme tokens mirror the app, so artifacts read as part of it.
		expect(document).toContain('--radius-control: 10px');
		expect(document).toContain('--radius-surface: 12px');
		expect(document).toContain('--radius-overlay: 16px');
		expect(document).toContain('--brand-fill: #4f46e5');
		expect(document).toContain('--on-brand: #f8fafc');
		expect(document).toContain('--surface-muted: #0f172a');
		expect(document).toContain('--text-muted: #94a3b8');
		// Responsive spacing on the documented breakpoints only.
		expect(document).toContain('@media (min-width: 480px) { body { padding: 16px; } }');
		expect(document).toContain('@media (min-width: 768px) { body { padding: 24px; } }');
		expect(document).toContain(
			'.explainer-main { width: 100%; max-width: 720px; margin: 0 auto; }'
		);
		// Filled controls keep a readable label in both themes.
		expect(document).toContain('.control-primary');
		expect(document).toContain('background: var(--brand-fill)');
		// Prose defaults for model markup.
		expect(document).toContain('.explainer-main h2');
		expect(document).toContain('.explainer-main p:last-child { margin-bottom: 0; }');
		expect(document).toContain('.controls');
	});

	it('strips a model-written lead block that repeats the title and summary', () => {
		const leadBrief = { ...brief, title: 'Ohm law visually', summary: 'Voltage pushes current' };
		const duplicated = {
			...payload,
			html: `<header class="lead"><h2>Ohm law visually</h2><p>Voltage pushes current</p></header><div class="stage" id="artifact-body">BODY_MARKER</div>`,
		};
		const document = composeArtifactDocument({
			brief: leadBrief,
			payload: duplicated,
			language: 'english',
		});
		expect(document).not.toContain('class="lead"');
		expect(document).not.toContain('Voltage pushes current');
		expect(document).toContain('BODY_MARKER');
	});

	it('ships responsive guards in the base css', () => {
		const document = composeArtifactDocument({ brief, payload, language: 'english' });
		expect(document).toContain(
			'.explainer-main img, .explainer-main svg, .explainer-main canvas { max-width: 100%; }'
		);
		expect(document).toContain('.explainer-main img, .explainer-main canvas { height: auto; }');
		expect(document).toContain('overflow-x: auto');
		expect(document).toContain('overflow-x: hidden');
	});
});
