// Failure modes P1-P4 were written in tasks/plan-intent-capture.md before this
// file and before the originalRequest block existed in prompt.js.

import { describe, expect, it } from 'vitest';
import { generatePrompt } from './prompt.js';

const BASE = {
	topic: 'python built-in data structures',
	numQuestions: 10,
	difficulty: 'intermediate',
	testType: 'multiple-choice',
	topicContext: 'TOPIC CONTEXT',
	previousQuestions: [],
	language: 'english',
};

describe('generatePrompt originalRequest failure modes', () => {
	it('P1: omits the block when absent', () => {
		expect(generatePrompt(BASE)).not.toContain('ORIGINAL REQUEST');
		expect(generatePrompt({ ...BASE, originalRequest: null })).not.toContain('ORIGINAL REQUEST');
	});

	it('P2: omits the block when blank', () => {
		expect(generatePrompt({ ...BASE, originalRequest: '   ' })).not.toContain('ORIGINAL REQUEST');
	});

	it('P3: truncates to 1000 characters', () => {
		const prompt = generatePrompt({ ...BASE, originalRequest: 'z'.repeat(2000) });
		expect(prompt).toContain('z'.repeat(1000));
		expect(prompt).not.toContain('z'.repeat(1001));
	});

	it('P4: carries the qualifier instruction before topic information', () => {
		const prompt = generatePrompt({
			...BASE,
			originalRequest: 'python built-in data structures',
		});
		const blockIndex = prompt.indexOf('ORIGINAL REQUEST');
		expect(blockIndex).toBeGreaterThan(-1);
		expect(prompt.slice(blockIndex, blockIndex + 200)).toMatch(/honou?r/i);
		expect(blockIndex).toBeLessThan(prompt.indexOf('TOPIC INFORMATION'));
	});
});
