import { describe, expect, it } from 'vitest';
import {
	MAX_ARTIFACT_CSS_BYTES,
	MAX_ARTIFACT_HTML_BYTES,
	MAX_ARTIFACT_JS_BYTES,
} from './quizConfig';
import { validateArtifactPayload } from './artifactValidation';

const goodPayload = {
	html: `
		<div class="stage">
			<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>
			<button class="control" type="button">Go</button>
			<input type="range" min="0" max="10" aria-label="speed" />
			<img src="data:image/png;base64,AA==" alt="" />
		</div>
	`,
	css: '.stage { color: red; } .control { background: url(data:image/svg+xml,%3Csvg%3E); }',
	js: 'const el = document.querySelector(".control"); el.addEventListener("click", () => {});',
};

function codesFor(payload) {
	return validateArtifactPayload(payload).issues.map((issue) => issue.code);
}

describe('validateArtifactPayload', () => {
	it('accepts a well-formed payload', () => {
		const result = validateArtifactPayload(goodPayload);
		expect(result.ok).toBe(true);
		expect(result.issues).toEqual([]);
	});

	describe('sizes', () => {
		it('accepts html at exactly the cap and rejects one byte over', () => {
			expect(validateArtifactPayload({ ...goodPayload, html: 'a'.repeat(MAX_ARTIFACT_HTML_BYTES) }).ok).toBe(true);
			expect(codesFor({ ...goodPayload, html: 'a'.repeat(MAX_ARTIFACT_HTML_BYTES + 1) })).toContain('size');
		});

		it('accepts css at exactly the cap and rejects one byte over', () => {
			expect(validateArtifactPayload({ ...goodPayload, css: 'a'.repeat(MAX_ARTIFACT_CSS_BYTES) }).ok).toBe(true);
			expect(codesFor({ ...goodPayload, css: 'a'.repeat(MAX_ARTIFACT_CSS_BYTES + 1) })).toContain('size');
		});

		it('accepts js at exactly the cap and rejects one byte over', () => {
			expect(validateArtifactPayload({ ...goodPayload, js: 'a'.repeat(MAX_ARTIFACT_JS_BYTES) }).ok).toBe(true);
			expect(codesFor({ ...goodPayload, js: 'a'.repeat(MAX_ARTIFACT_JS_BYTES + 1) })).toContain('size');
		});
	});

	describe('banned tags', () => {
		const bannedTags = [
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
		];

		it.each(bannedTags)('rejects <%s>', (tag) => {
			expect(codesFor({ ...goodPayload, html: `<${tag}></${tag}>` })).toContain('tag-banned');
		});

		it('allows the whitelisted interactive and svg tags', () => {
			const html =
				'<svg><circle r="1"></circle></svg><canvas width="10" height="10"></canvas>' +
				'<button type="button">Go</button><label>Speed <input type="range" /></label>' +
				'<details><summary>More</summary><p>Body</p></details><img src="data:image/gif;base64,AA==" alt="" />';
			expect(validateArtifactPayload({ ...goodPayload, html }).ok).toBe(true);
		});
	});

	describe('attributes', () => {
		it('rejects on* handler attributes but allows data-on and aria-click', () => {
			expect(codesFor({ ...goodPayload, html: '<button onclick="run()">Go</button>' })).toContain('attr-event');
			expect(
				validateArtifactPayload({ ...goodPayload, html: '<button data-on="a" aria-click="b">Go</button>' }).ok
			).toBe(true);
		});

		it('rejects inline style attributes', () => {
			expect(codesFor({ ...goodPayload, html: '<div style="color:red">x</div>' })).toContain('attr-style');
		});

		it('allows same-document hrefs and rejects page or external hrefs', () => {
			expect(validateArtifactPayload({ ...goodPayload, html: '<a href="#step-2">next</a>' }).ok).toBe(true);
			expect(codesFor({ ...goodPayload, html: '<a href="https://example.com">x</a>' })).toContain('attr-href');
			expect(codesFor({ ...goodPayload, html: '<a href="/page">x</a>' })).toContain('attr-href');
		});

		it('only allows data: sources', () => {
			expect(codesFor({ ...goodPayload, html: '<img src="https://example.com/x.png" alt="" />' })).toContain(
				'attr-src'
			);
			expect(validateArtifactPayload({ ...goodPayload, html: '<img src="data:image/gif;base64,AA==" alt="" />' }).ok).toBe(
				true
			);
		});

		it('rejects external URLs in other attribute values', () => {
			expect(codesFor({ ...goodPayload, html: '<div data-source="https://example.com/x">x</div>' })).toContain(
				'url-external'
			);
		});
	});

	describe('css', () => {
		it('rejects @import', () => {
			expect(codesFor({ ...goodPayload, css: "@import url('x.css');" })).toContain('css-import');
		});

		it('rejects non-data url() and allows data urls', () => {
			expect(codesFor({ ...goodPayload, css: '.a { background: url(https://example.com/x.png); }' })).toContain(
				'css-url'
			);
			expect(
				validateArtifactPayload({ ...goodPayload, css: ".a { background: url('data:image/svg+xml,%3Csvg%3E'); }" })
					.ok
			).toBe(true);
		});

		it('rejects style breakouts', () => {
			expect(codesFor({ ...goodPayload, css: '.a { content: "</style>"; }' })).toContain('css-breakout');
			expect(codesFor({ ...goodPayload, css: '.a { content: "</STYLE >"; }' })).toContain('css-breakout');
		});

		it('rejects hardcoded black colours but allows token usage and other hexes', () => {
			expect(codesFor({ ...goodPayload, css: '.a { border: 2px solid #000; }' })).toContain(
				'css-hardcoded-colour'
			);
			expect(codesFor({ ...goodPayload, css: '.a { color: black; }' })).toContain(
				'css-hardcoded-colour'
			);
			expect(codesFor({ ...goodPayload, css: '.a { box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4); }' })).toContain(
				'css-hardcoded-colour'
			);
			expect(
				validateArtifactPayload({
					...goodPayload,
					css: '.a { border: 1px solid var(--line); color: #0000ff; }',
				}).ok
			).toBe(true);
		});

		it('rejects var(--brand) used as a fill but allows it for text and borders', () => {
			expect(codesFor({ ...goodPayload, css: '.a { background: var(--brand); }' })).toContain(
				'css-brand-fill'
			);
			expect(
				codesFor({ ...goodPayload, css: '.a { background-color: var(--brand); }' })
			).toContain('css-brand-fill');
			expect(
				validateArtifactPayload({
					...goodPayload,
					css: '.a { color: var(--brand); border: 1px solid var(--brand); background: var(--brand-fill); color: var(--on-brand); }',
				}).ok
			).toBe(true);
		});
	});

	describe('js', () => {
		const deniedSnippets = [
			'fetch("/api/explain")',
			'new XMLHttpRequest()',
			'new WebSocket("wss://x")',
			'new EventSource("/events")',
			'navigator.sendBeacon("/x")',
			'eval("1")',
			'new Function("return 1")',
			"import('./x.js')",
			'document.cookie',
			'localStorage.setItem("a", "b")',
			'sessionStorage.setItem("a", "b")',
			'indexedDB.open("a")',
			'window.open("/x")',
			'location.assign("/x")',
			'parent.document.body',
			'window.parent.document',
			'top.location.href',
			'window.top.location',
		];

		it.each(deniedSnippets)('rejects %s', (snippet) => {
			expect(codesFor({ ...goodPayload, js: snippet })).toContain('js-denylist');
		});

		it('rejects script breakouts in every casing and spacing', () => {
			expect(codesFor({ ...goodPayload, js: 'const s = "</script";' })).toContain('js-breakout');
			expect(codesFor({ ...goodPayload, js: 'const s = "</SCRIPT >";' })).toContain('js-breakout');
			expect(codesFor({ ...goodPayload, js: 'const s = "</script >";' })).toContain('js-breakout');
		});
	});

	it('allows external URLs in visible text', () => {
		expect(validateArtifactPayload({ ...goodPayload, html: '<p>Read https://ncert.nic.in for more</p>' }).ok).toBe(
			true
		);
	});

	it('rejects empty html as malformed and never throws on unbalanced markup', () => {
		expect(codesFor({ ...goodPayload, html: '   ' })).toContain('malformed');
		expect(() => validateArtifactPayload({ ...goodPayload, html: '<div><span></div>' })).not.toThrow();
		expect(typeof validateArtifactPayload({ ...goodPayload, html: '<div><span></div>' }).ok).toBe('boolean');
	});
});
