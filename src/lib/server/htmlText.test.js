import { describe, expect, it } from 'vitest';
import { htmlToText } from './htmlText';

// Failure modes: script/style leakage, entity soup, relative or unsafe links,
// duplicate links, runaway page size, and malformed markup that must still
// yield whatever text is readable.

describe('htmlToText', () => {
	it('drops script, style, noscript and comment content', () => {
		const { text } = htmlToText(`
			<!-- hidden comment -->
			<script>alert('x')</script>
			<style>.a { color: red }</style>
			<noscript>enable js</noscript>
			<p>Real notice text</p>
		`);
		expect(text).toContain('Real notice text');
		for (const ghost of ['alert', 'color: red', 'enable js', 'hidden comment']) {
			expect(text).not.toContain(ghost);
		}
	});

	it('decodes named and numeric entities', () => {
		const { text } = htmlToText('<p>Post &amp; CGL &nbsp;2026 &#45; No.&#x2F;05</p>');
		expect(text).toContain('Post & CGL 2026 - No./05');
	});

	it('extracts, resolves and dedupes links, skipping unsafe schemes', () => {
		const { links, text } = htmlToText(
			`
				<a href="/notice/1.pdf">Notice PDF</a>
				<a href="https://upsc.gov.in/whats-new">What's new</a>
				<a href="/notice/1.pdf">Duplicate</a>
				<a href="#top">Top</a>
				<a href="javascript:alert(1)">nope</a>
				<a href="mailto:x@y.z">mail</a>
			`,
			{ baseUrl: 'https://ssc.gov.in/for-candidates/' }
		);
		expect(links.map((link) => link.href)).toEqual([
			'https://ssc.gov.in/notice/1.pdf',
			'https://upsc.gov.in/whats-new'
		]);
		expect(links[0].label).toBe('Notice PDF');
		// The numbered link list must appear in the text the model reads.
		expect(text).toContain('https://ssc.gov.in/notice/1.pdf');
	});

	it('keeps blocks on their own lines and collapses whitespace', () => {
		const { text } = htmlToText(
			'<div>First   line</div><div>Second\nline</div><ul><li>Item</li></ul>'
		);
		expect(text).toBe('First line\nSecond line\nItem');
	});

	it('caps the visible text', () => {
		const { text } = htmlToText(`<p>${'x'.repeat(5000)}</p>`, { maxChars: 100 });
		expect(text.length).toBeLessThanOrEqual(130);
	});

	it('caps the number of extracted links', () => {
		const anchors = Array.from(
			{ length: 30 },
			(_, index) => `<a href="https://ssc.gov.in/n/${index}">n${index}</a>`
		).join('');
		const { links } = htmlToText(anchors, { maxLinks: 5 });
		expect(links).toHaveLength(5);
	});

	it('survives empty and malformed markup', () => {
		expect(htmlToText('').text).toBe('');
		expect(htmlToText(null).text).toBe('');
		const { text } = htmlToText('<p>Broken <b>bold <p>next');
		expect(text).toContain('Broken');
		expect(text).toContain('next');
	});
});
