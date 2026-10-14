import { describe, expect, it } from 'vitest';
import { stripRepeatedLead } from './artifactLead';

const brief = {
	title: 'Pythagoras Theorem',
	summary:
		'In any right triangle, the square on the hypotenuse equals the sum of the squares on the other two sides.',
};

describe('stripRepeatedLead', () => {
	it('removes the confirmed model pattern: wrapper > header > h2 + summary', () => {
		const html = `<section class="wrap">
  <header class="lead">
    <h2>Pythagoras Theorem</h2>
    <p class="sub">In any right triangle, the square on the hypotenuse equals the sum of the squares on the other two sides.</p>
  </header>

  <section class="stage" aria-labelledby="s1-h">
    <h3 id="s1-h">1. Identify the sides</h3>
  </section>
</section>`;
		const result = stripRepeatedLead(html, brief);
		expect(result).not.toContain('Pythagoras Theorem');
		expect(result).not.toContain('In any right triangle');
		expect(result).toContain('1. Identify the sides');
		expect(result).toContain('class="wrap"');
	});

	it('removes a bare leading h1 + summary paragraph', () => {
		const html = `<h1>Pythagoras Theorem</h1><p>In any right triangle, the square on the hypotenuse equals the sum of the squares on the other two sides.</p><div class="stage">Body</div>`;
		const result = stripRepeatedLead(html, brief);
		expect(result).not.toContain('Pythagoras Theorem');
		expect(result).toContain('<div class="stage">Body</div>');
	});

	it('removes a leading title heading even when the paragraph does not match the summary', () => {
		const html = `<h2>Pythagoras Theorem</h2><p>A different intro.</p><div>Body</div>`;
		const result = stripRepeatedLead(html, brief);
		expect(result).not.toContain('Pythagoras Theorem');
		expect(result).toContain('A different intro.');
		expect(result).toContain('<div>Body</div>');
	});

	it('removes a wrapper that contains only the title heading', () => {
		const html = `<header><h2>Pythagoras Theorem</h2></header><section><h3>1. Step</h3></section>`;
		const result = stripRepeatedLead(html, brief);
		expect(result).not.toContain('Pythagoras Theorem');
		expect(result).toContain('1. Step');
	});

	it('matches entity-encoded titles through the parser', () => {
		const result = stripRepeatedLead('<h2>Ohm &amp; Power</h2><p>x</p><div>Body</div>', {
			title: 'Ohm & Power',
			summary: 'x',
		});
		expect(result).not.toContain('Ohm');
		expect(result).toContain('Body');
	});

	it('leaves content alone when the first heading is a real section', () => {
		const html = `<h2>1. Identify the sides</h2><p>Tap next.</p>`;
		expect(stripRepeatedLead(html, brief)).toBe(html);
	});

	it('leaves content alone when it does not start with a heading or wrapper', () => {
		const html = `<p>Lead-in sentence.</p><h2>1. Step</h2>`;
		expect(stripRepeatedLead(html, brief)).toBe(html);
	});

	it('does not touch a mid-document title repeat', () => {
		const html = `<div class="stage"><h3>1. Step</h3></div><h2>Pythagoras Theorem</h2>`;
		expect(stripRepeatedLead(html, brief)).toBe(html);
	});

	it('is idempotent and safe on empty input', () => {
		const html = `<h2>Pythagoras Theorem</h2><p>x</p><div>Body</div>`;
		const once = stripRepeatedLead(html, brief);
		expect(stripRepeatedLead(once, brief)).toBe(once);
		expect(stripRepeatedLead('', brief)).toBe('');
	});

	it('returns the input when the brief has no title or summary', () => {
		const html = `<h2>Anything</h2><p>Body</p>`;
		expect(stripRepeatedLead(html, {})).toBe(html);
	});
});
