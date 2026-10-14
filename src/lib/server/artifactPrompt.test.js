import { describe, expect, it } from 'vitest';
import { RECIPE_IDS } from './artifactScaffold';
import { generateArtifactPrompt, generateConceptBriefPrompt } from './prompt';

const brief = {
	concept: 'Ohm law',
	title: 'Ohm law in motion',
	summary: 'Voltage pushes current.',
	level: 'class 10',
	recipes: ['step-reveal'],
	sections: [
		{ heading: 'Setup', purpose: 'introduce', recipe: 'step-reveal' },
		{ heading: 'Compare', purpose: 'toggle states', recipe: 'toggle-compare' },
	],
};

describe('generateConceptBriefPrompt', () => {
	it('names the topic, language, every recipe and the JSON shape', () => {
		const prompt = generateConceptBriefPrompt({
			topic: 'Ohm law',
			question: 'What does V equal?',
			answer: 'IR',
			language: 'hindi',
		});
		expect(prompt).toContain('Ohm law');
		expect(prompt).toContain('hindi');
		expect(prompt).toContain('What does V equal?');
		expect(prompt).toContain('IR');
		for (const id of RECIPE_IDS) {
			expect(prompt).toContain(id);
		}
		expect(prompt).toContain('"concept"');
		expect(prompt).toContain('"recipes"');
		expect(prompt).toContain('"sections"');
	});

	it('omits context lines and never leaks undefined', () => {
		const prompt = generateConceptBriefPrompt({ topic: 'Ohm law' });
		expect(prompt).not.toContain('undefined');
		expect(prompt).not.toContain('Question:');
	});
});

describe('generateArtifactPrompt', () => {
	it('carries the brief, the scaffold classes and the contract', () => {
		const prompt = generateArtifactPrompt({ brief, language: 'english' });
		expect(prompt).toContain('Ohm law in motion');
		expect(prompt).toContain('step-reveal');
		expect(prompt).toContain('.stage');
		expect(prompt).toContain('.control');
		expect(prompt).toContain('.steps');
		expect(prompt).toContain('prefers-reduced-motion');
		expect(prompt).toContain('data-motion');
		expect(prompt).toContain('Responsive by construction');
		expect(prompt).toContain('"html"');
		expect(prompt).toContain('"css"');
		expect(prompt).toContain('"js"');
		expect(prompt).not.toContain('VALIDATION ERRORS');
	});

	it('appends the repair issues when provided', () => {
		const prompt = generateArtifactPrompt({
			brief,
			language: 'english',
			repairIssues: [
				{ code: 'tag-banned', detail: 'script' },
				{ code: 'size', detail: 'html exceeds 98304 bytes' },
			],
		});
		expect(prompt).toContain('VALIDATION ERRORS');
		expect(prompt).toContain('tag-banned');
		expect(prompt).toContain('script');
		expect(prompt).toContain('size');
		expect(prompt).toContain('html exceeds 98304 bytes');
	});
});
