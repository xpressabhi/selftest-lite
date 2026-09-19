import { describe, expect, it } from 'vitest';
import { jsonLdScript } from './jsonLd.js';

describe('jsonLdScript', () => {
	it('wraps the payload in an ld+json script tag', () => {
		const html = jsonLdScript({ '@type': 'FAQPage' });
		expect(html.startsWith('<script type="application/ld+json">{')).toBe(true);
		expect(html.endsWith('}</script>')).toBe(true);
	});

	it('escapes angle brackets so content cannot close the tag', () => {
		const html = jsonLdScript({ text: '</script><img src=x onerror=alert(1)>' });
		expect(html).not.toContain('</script><img');
		expect(html).toContain('\\u003c');
	});

	it('round-trips the payload through JSON.parse', () => {
		const payload = { '@type': 'Blog', name: 'selftest.in', posts: [1, 2, 3] };
		const html = jsonLdScript(payload);
		const inner = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
		expect(JSON.parse(inner)).toEqual(payload);
	});
});
