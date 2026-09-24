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

describe('generatePrompt format contracts', () => {
	it('matching asks for pairs and never for options', () => {
		const prompt = generatePrompt({ ...BASE, testType: 'matching' });
		expect(prompt).toContain('"columnA"');
		expect(prompt).toContain('"columnB"');
		expect(prompt).toContain('same order as columnA');
		expect(prompt).not.toContain('"options": ["Option A"');
		expect(prompt).not.toContain('OPTION LENGTH BALANCE');
	});

	it('assertion-reasoning asks for a-d codes and never for options', () => {
		const prompt = generatePrompt({ ...BASE, testType: 'assertion-reasoning' });
		expect(prompt).toContain('"assertion"');
		expect(prompt).toContain('"reason"');
		expect(prompt).toContain('"a or b or c or d"');
		expect(prompt).toContain('Distribute the codes');
		expect(prompt).not.toContain('"options": ["Option A"');
	});

	it('legacy formats keep the option contract and length checks', () => {
		const prompt = generatePrompt(BASE);
		expect(prompt).toContain('"options": ["Option A", "Option B", "Option C", "Option D"]');
		expect(prompt).toContain('OPTION LENGTH BALANCE');
		expect(prompt).toContain('FINAL LENGTH CHECK');
	});

	it('renders structured previous questions through the composer', () => {
		const prompt = generatePrompt({
			...BASE,
			testType: 'assertion-reasoning',
			previousQuestions: [
				{
					format: 'assertion-reasoning',
					assertion: 'Iron rusts in moist air.',
					reason: 'Oxygen and water react with iron.',
					answer: 'Both A and R are true, and R is the correct explanation of A',
				},
			],
		});
		expect(prompt).toContain('Q: Assertion (A): Iron rusts in moist air.');
		expect(prompt).toContain('Reason (R): Oxygen and water react with iron.');
	});
});
