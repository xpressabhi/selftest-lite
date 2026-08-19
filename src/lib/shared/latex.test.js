import { describe, expect, it } from 'vitest';
import { normalizeMathText, prepareMathTextForRendering } from './latex';

describe('normalizeMathText', () => {
	it('handles null and undefined', () => {
		expect(normalizeMathText(null)).toBe('');
		expect(normalizeMathText(undefined)).toBe('');
	});

	it('leaves plain text unchanged', () => {
		expect(normalizeMathText('What is force?')).toBe('What is force?');
	});

	it('restores JSON-escaped LaTeX control sequences', () => {
		expect(normalizeMathText('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
		expect(normalizeMathText('$\u0008infty$')).toBe('$\\binfty$');
	});

	it('braces unbraced function superscripts', () => {
		expect(normalizeMathText('$x^\\sin 30$')).toBe('$x^{\\sin 30}$');
	});

	it('preserves display-mode delimiters', () => {
		expect(normalizeMathText('$$\\sum_{i=1}^n i$$')).toBe('$$\\sum_{i=1}^n i$$');
	});
});

describe('prepareMathTextForRendering', () => {
	it('keeps text without math markers untouched', () => {
		expect(prepareMathTextForRendering('Plain text')).toBe('Plain text');
	});

	it('wraps bare LaTeX in inline math delimiters', () => {
		expect(prepareMathTextForRendering('$F = ma$')).toBe('$F = ma$');
		expect(prepareMathTextForRendering('E = mc^2')).toBe('$E = mc^2$');
	});

	it('does not double-wrap already-delimited math', () => {
		expect(prepareMathTextForRendering('$E = mc^2$')).toBe('$E = mc^2$');
		expect(prepareMathTextForRendering('$$E = mc^2$$')).toBe('$$E = mc^2$$');
	});

	it('does not wrap bare math that appears only inside code spans', () => {
		expect(prepareMathTextForRendering('Literal syntax uses the `BUILD_TUPLE` opcode.')).toBe(
			'Literal syntax uses the `BUILD_TUPLE` opcode.'
		);
		expect(prepareMathTextForRendering('`snake_case_var` is an identifier')).toBe(
			'`snake_case_var` is an identifier'
		);
		expect(prepareMathTextForRendering('```\nBUILD_TUPLE\n```')).toBe('```\nBUILD_TUPLE\n```');
	});

	it('still wraps bare math outside code spans', () => {
		expect(prepareMathTextForRendering('E = mc^2')).toBe('$E = mc^2$');
		expect(prepareMathTextForRendering('x_1 = 5')).toBe('$x_1 = 5$');
	});
});
