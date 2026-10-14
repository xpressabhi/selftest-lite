// Server-owned shell for concept artifacts. The model writes only a body
// fragment ({ html, css, js }); everything structural — doctype, language,
// theme, CSP, base CSS, sizing script — is composed here so it can never be
// model-controlled. The base styling follows docs/design-system.md: app token
// names, the 480/768 breakpoints, the 4px spacing grid, and the three radius
// tokens only. Bump ARTIFACT_SCAFFOLD_VERSION when this template changes: it
// is part of the explainer cache key, so a bump supersedes old rows without
// deleting them.

export const ARTIFACT_SCAFFOLD_VERSION = 'scaffold-v4';

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
/* Theme tokens mirror src/lib/styles/globals.css so an artifact always reads
   as part of the app. Components must consume these, never raw colours.
   --brand is text-grade (it flips to a light tint in dark mode); fills use
   --brand-fill with --on-brand text, which never flip. */
:root {
	--radius-control: 10px;
	--radius-surface: 12px;
	--radius-overlay: 16px;
	--brand-fill: #4f46e5;
	--on-brand: #f8fafc;
}
:root[data-theme='light'] {
	color-scheme: light;
	--surface: #ffffff;
	--surface-muted: #f8fafc;
	--text: #111827;
	--text-muted: #64748b;
	--line: #e2e8f0;
	--brand: #4f46e5;
	--ok: #15803d;
	--warn: #b45309;
	--danger: #b91c1c;
}
:root[data-theme='dark'] {
	color-scheme: dark;
	--surface: #111827;
	--surface-muted: #0f172a;
	--text: #f8fafc;
	--text-muted: #94a3b8;
	--line: #334155;
	--brand: #a5b4fc;
	--ok: #6ee7b7;
	--warn: #fcd34d;
	--danger: #fca5a5;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
	background: var(--surface-muted);
	color: var(--text);
	font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	font-size: 1rem;
	line-height: 1.55;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 12px;
}
/* Design-system breakpoints only: 480 (phone), 768 (roomier). */
@media (min-width: 480px) { body { padding: 16px; } }
@media (min-width: 768px) { body { padding: 24px; } }

/* The hosts (playground card, public page) render the title and summary; the
   artifact body must not repeat them, so the shell has no header block. */
.explainer-main { width: 100%; max-width: 720px; margin: 0 auto; }

/* Section rhythm: 16 on phones, 24 from 768 up (4px grid only). */
.explainer-main { display: grid; gap: 16px; }
@media (min-width: 768px) { .explainer-main { gap: 24px; } }

/* Prose defaults for model markup, so unstyled content still reads well. */
.explainer-main p { margin: 0 0 12px; }
.explainer-main p:last-child { margin-bottom: 0; }
.explainer-main h2 { margin: 0 0 8px; font-size: 1.125rem; line-height: 1.3; }
@media (min-width: 768px) { .explainer-main h2 { font-size: 1.25rem; } }
.explainer-main h3 { margin: 0 0 4px; font-size: 1rem; line-height: 1.3; }
.explainer-main ul, .explainer-main ol { margin: 0 0 12px; padding-left: 20px; }
.explainer-main li { margin: 4px 0; }
.explainer-main a { color: var(--brand); text-decoration: underline; text-underline-offset: 2px; }
.explainer-main code {
	background: var(--surface-muted);
	border: 1px solid var(--line);
	border-radius: 4px;
	padding: 0 6px;
	font-size: 0.9em;
}
.explainer-main pre {
	margin: 0 0 12px;
	background: var(--surface-muted);
	border: 1px solid var(--line);
	border-radius: var(--radius-control);
	padding: 12px;
	overflow-x: auto;
}
.explainer-main pre code { background: none; border: 0; padding: 0; }
.explainer-main blockquote {
	margin: 0 0 12px;
	padding: 4px 12px;
	border-left: 3px solid var(--brand);
	color: var(--text-muted);
}
.explainer-main img, .explainer-main svg, .explainer-main canvas { max-width: 100%; }
.explainer-main img, .explainer-main canvas { height: auto; }
.explainer-main figure { margin: 0 0 12px; }
.explainer-main figcaption { margin-top: 4px; color: var(--text-muted); font-size: 0.8rem; }
.explainer-main hr { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }
.explainer-main table {
	display: block;
	max-width: 100%;
	overflow-x: auto;
	border-collapse: collapse;
}
.explainer-main th, .explainer-main td {
	border: 1px solid var(--line);
	padding: 6px 10px;
	text-align: left;
}
.explainer-main th { background: var(--surface-muted); font-weight: 600; }

/* Scaffold components. Cards sit on the surface token, controls keep 44px
   tap targets, and every radius comes from the three radius tokens. */
.stage {
	background: var(--surface);
	border: 1px solid var(--line);
	border-radius: var(--radius-surface);
	padding: 16px;
}
@media (min-width: 768px) { .stage { padding: 24px; } }
.controls { display: flex; flex-wrap: wrap; gap: 8px; }
.control {
	min-height: 44px;
	min-width: 44px;
	padding: 8px 14px;
	border-radius: var(--radius-control);
	border: 1px solid var(--line);
	background: var(--surface);
	color: var(--text);
	font: inherit;
	cursor: pointer;
}
.control:hover { border-color: var(--brand); }
.control:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 30%, transparent);
}
/* Filled controls: the fill never flips with the theme, so the label stays
   readable on the indigo in both themes. */
.control-primary {
	background: var(--brand-fill);
	border-color: var(--brand-fill);
	color: var(--on-brand);
}
.control-primary:hover { border-color: var(--brand-fill); filter: brightness(1.08); }
input[type='range'] { accent-color: var(--brand); }
.steps { display: grid; gap: 8px; }
.step { border-left: 3px solid var(--line); padding-left: 12px; }
.step-active { border-left-color: var(--brand); }

/* Responsive guards: the artifact must fit a 320px phone without the parent
   page scrolling sideways, whatever the model draws. */
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
<main class="explainer-main">${html}</main>
${HEIGHT_SCRIPT}${modelScript}
</body>
</html>`;
}
