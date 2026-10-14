// Server-owned shell for concept artifacts. The model writes only a body
// fragment ({ html, css, js }); everything structural — doctype, language,
// theme, CSP, base CSS, sizing script — is composed here so it can never be
// model-controlled. Bump ARTIFACT_SCAFFOLD_VERSION when this template changes:
// it is part of the explainer cache key, so a bump supersedes old rows without
// deleting them.

export const ARTIFACT_SCAFFOLD_VERSION = 'scaffold-v2';

/** Animation vocabulary the brief may pick from. Ids are validated by schema. */
export const ARTIFACT_RECIPES = [
	{
		id: 'step-reveal',
		description: 'walk a process through clearly labeled steps the learner advances',
	},
	{
		id: 'timeline',
		description: 'place events along a time axis and move through them',
	},
	{
		id: 'particle-flow',
		description: 'animate many small elements moving along a path or field',
	},
	{
		id: 'orbit',
		description: 'show bodies rotating around a central object',
	},
	{
		id: 'graph-plot',
		description: 'draw and animate a function, curve, or plot of data',
	},
	{
		id: 'toggle-compare',
		description: 'switch between two contrasting states for comparison',
	},
];

export const RECIPE_IDS = ARTIFACT_RECIPES.map((recipe) => recipe.id);

const CSP_CONTENT =
	"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'";

const BASE_CSS = `
:root[data-theme='light'] {
	color-scheme: light;
	--bg: #f8fafc;
	--surface: #ffffff;
	--text: #111827;
	--muted: #64748b;
	--line: #e2e8f0;
	--brand: #4f46e5;
	--success: #15803d;
	--danger: #b91c1c;
}
:root[data-theme='dark'] {
	color-scheme: dark;
	--bg: #0f172a;
	--surface: #111827;
	--text: #f8fafc;
	--muted: #94a3b8;
	--line: #334155;
	--brand: #a5b4fc;
	--success: #6ee7b7;
	--danger: #fca5a5;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
	background: var(--bg);
	color: var(--text);
	font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	line-height: 1.5;
	overflow-y: auto;
	padding: 16px;
}
.explainer-head h1 { margin: 0 0 4px; font-size: 1.25rem; line-height: 1.3; }
.explainer-summary { margin: 0 0 16px; color: var(--muted); }
.stage {
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: 12px;
	padding: 16px;
}
.control {
	min-height: 44px;
	min-width: 44px;
	padding: 8px 14px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: var(--surface);
	color: var(--text);
	font: inherit;
	cursor: pointer;
}
.control:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 30%, transparent);
}
.steps { display: grid; gap: 8px; }
.step { border-left: 3px solid var(--line); padding-left: 10px; }
.step-active { border-left-color: var(--brand); }
/* Responsive guards: the artifact must fit a 320px phone without the parent
   page scrolling sideways, whatever the model draws. */
img, svg, canvas { max-width: 100%; }
img, canvas { height: auto; }
table { display: block; max-width: 100%; overflow-x: auto; }
body { overflow-x: hidden; }
@media (prefers-reduced-motion: reduce) {
	html[data-motion='reduced'] *,
	html[data-motion='reduced'] *::before,
	html[data-motion='reduced'] *::after {
		animation-duration: 0.001ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.001ms !important;
	}
}
`.trim();

const MOTION_SCRIPT = `<script>(function () {
	try {
		var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		document.documentElement.setAttribute('data-motion', reduced ? 'reduced' : 'full');
	} catch (error) {
		document.documentElement.setAttribute('data-motion', 'full');
	}
})();</script>`;

const HEIGHT_SCRIPT = `<script>(function () {
	var lastHeight = 0;
	function report() {
		var height = Math.max(
			document.documentElement.scrollHeight,
			document.body ? document.body.scrollHeight : 0
		);
		if (height === lastHeight) {
			return;
		}
		lastHeight = height;
		try {
			parent.postMessage({ type: 'selftest-explainer-height', height: height }, '*');
		} catch (error) {
			/* The parent is the only listener; failure is harmless. */
		}
	}
	if (typeof ResizeObserver === 'function') {
		new ResizeObserver(report).observe(document.documentElement);
	}
	window.addEventListener('load', report);
	setTimeout(report, 0);
})();</script>`;

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

/**
 * Composes the final artifact document. Pure and deterministic for a given
 * input; `theme` is cosmetic and deliberately not part of the cache key.
 */
export function composeArtifactDocument({ brief, payload, language, theme = 'light' }) {
	const lang = String(language ?? '').toLowerCase() === 'hindi' ? 'hi' : 'en';
	const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
	const title = escapeHtml(brief?.title ?? '');
	const summary = escapeHtml(brief?.summary ?? '');
	const html = String(payload?.html ?? '');
	const css = String(payload?.css ?? '');
	const js = String(payload?.js ?? '');

	const modelScript = js
		? `\n<script>(function () {\n'use strict';\n${js}\n})();</script>`
		: '';

	return `<!doctype html><html lang="${lang}" data-theme="${resolvedTheme}"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}" />
<title>${title}</title>
${MOTION_SCRIPT}
<style>${BASE_CSS}\n${css}</style>
</head>
<body>
<header class="explainer-head"><h1>${title}</h1><p class="explainer-summary">${summary}</p></header>
<main class="explainer-main">${html}</main>
${HEIGHT_SCRIPT}${modelScript}
</body>
</html>`;
}
