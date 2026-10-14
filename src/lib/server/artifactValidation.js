import { parse } from 'parse5';
import {
	MAX_ARTIFACT_CSS_BYTES,
	MAX_ARTIFACT_HTML_BYTES,
	MAX_ARTIFACT_JS_BYTES,
} from './quizConfig.js';

// Structural checks over the model's body fragment. These are a quality gate:
// the iframe sandbox and the composed document's CSP are the security
// boundary (see docs/superpowers/specs/2026-10-14-playground-explainer-design.md).
// Every failure carries a stable code so the repair prompt and telemetry can
// name exactly what to fix.

const BANNED_TAGS = new Set([
	'script',
	'style',
	'link',
	'meta',
	'iframe',
	'object',
	'embed',
	'base',
	'form',
	'video',
	'audio',
	'source',
	'track',
	'template',
]);

const JS_DENYLIST = [
	'fetch(',
	'XMLHttpRequest',
	'WebSocket',
	'EventSource',
	'sendBeacon',
	'eval(',
	'Function(',
	'import(',
	'document.cookie',
	'localStorage',
	'sessionStorage',
	'indexedDB',
	'window.open',
	'location.assign',
];

const PARENT_TOP_ACCESS = /\b(parent|top)\b\s*\./;
const SCRIPT_BREAKOUT = /<\/script/i;
const STYLE_BREAKOUT = /<\/style/i;
const CSS_IMPORT = /@import/i;
const EXTERNAL_URL = /https?:\/\//i;

/** Returns the first url() target that is not a data: URL, or null. */
function findNonDataUrl(css) {
	const urlPattern = /url\(\s*([^)]*?)\s*\)/gi;
	let match;
	while ((match = urlPattern.exec(css))) {
		const inner = match[1].trim().replace(/^['"]|['"]$/g, '');
		if (!/^data:/i.test(inner)) {
			return inner;
		}
	}
	return null;
}

function collectElements(node, out = []) {
	if (node.tagName) {
		out.push(node);
	}
	for (const child of node.childNodes ?? []) {
		collectElements(child, out);
	}
	return out;
}

function byteSize(value) {
	return Buffer.byteLength(value, 'utf8');
}

/**
 * Validates an artifact fragment. Returns `{ ok, issues: [{ code, detail }] }`.
 * Never throws: malformed input becomes a `malformed` issue.
 */
export function validateArtifactPayload(payload, limits = {}) {
	const maxHtmlBytes = limits.maxHtmlBytes ?? MAX_ARTIFACT_HTML_BYTES;
	const maxCssBytes = limits.maxCssBytes ?? MAX_ARTIFACT_CSS_BYTES;
	const maxJsBytes = limits.maxJsBytes ?? MAX_ARTIFACT_JS_BYTES;

	const html = String(payload?.html ?? '');
	const css = String(payload?.css ?? '');
	const js = String(payload?.js ?? '');
	const issues = [];

	if (byteSize(html) > maxHtmlBytes) {
		issues.push({ code: 'size', detail: `html exceeds ${maxHtmlBytes} bytes` });
	}
	if (byteSize(css) > maxCssBytes) {
		issues.push({ code: 'size', detail: `css exceeds ${maxCssBytes} bytes` });
	}
	if (byteSize(js) > maxJsBytes) {
		issues.push({ code: 'size', detail: `js exceeds ${maxJsBytes} bytes` });
	}

	if (html.trim() === '') {
		issues.push({ code: 'malformed', detail: 'html is empty' });
	} else {
		let document = null;
		try {
			document = parse(html);
		} catch {
			issues.push({ code: 'malformed', detail: 'html could not be parsed' });
		}
		if (document) {
			for (const element of collectElements(document)) {
				const tag = element.tagName;
				if (BANNED_TAGS.has(tag)) {
					issues.push({ code: 'tag-banned', detail: tag });
				}
				for (const attribute of element.attrs ?? []) {
					const name = String(attribute.name ?? '').toLowerCase();
					const value = String(attribute.value ?? '');
					if (name.startsWith('on')) {
						issues.push({ code: 'attr-event', detail: `${tag}[${name}]` });
					}
					if (name === 'style') {
						issues.push({ code: 'attr-style', detail: tag });
					}
					if (name === 'href' && !value.trim().startsWith('#')) {
						issues.push({ code: 'attr-href', detail: value.slice(0, 80) });
					}
					if (name === 'src' && !/^data:/i.test(value.trim())) {
						issues.push({ code: 'attr-src', detail: value.slice(0, 80) });
					}
					if (EXTERNAL_URL.test(value)) {
						issues.push({ code: 'url-external', detail: `${tag}[${name}]` });
					}
				}
			}
		}
	}

	if (CSS_IMPORT.test(css)) {
		issues.push({ code: 'css-import', detail: '@import' });
	}
	const nonDataUrl = findNonDataUrl(css);
	if (nonDataUrl !== null) {
		issues.push({ code: 'css-url', detail: nonDataUrl.slice(0, 80) || 'empty url()' });
	}
	if (STYLE_BREAKOUT.test(css)) {
		issues.push({ code: 'css-breakout', detail: '</style' });
	}

	for (const token of JS_DENYLIST) {
		if (js.includes(token)) {
			issues.push({ code: 'js-denylist', detail: token });
		}
	}
	if (PARENT_TOP_ACCESS.test(js)) {
		issues.push({ code: 'js-denylist', detail: 'parent/top access' });
	}
	if (SCRIPT_BREAKOUT.test(js)) {
		issues.push({ code: 'js-breakout', detail: '</script' });
	}

	return { ok: issues.length === 0, issues };
}
