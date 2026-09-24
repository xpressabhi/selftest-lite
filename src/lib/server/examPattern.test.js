import { describe, expect, it } from 'vitest';
import {
	assignSectionsToPaper,
	buildPatternResearchPrompt,
	examPatternSchema,
	isPatternExpired,
	normalizeExamPattern,
	patternKeyFor,
} from './examPattern';

function validPattern() {
	return {
		examName: 'SSC CGL Tier 1',
		board: null,
		classLevel: null,
		subject: null,
		patternYear: '2026',
		durationMinutes: 60,
		totalMarks: 200,
		negativeMarking: 0.5,
		sections: [
			{
				name: 'General Intelligence',
				questionTypes: ['multiple-choice'],
				questionCount: 2,
				marksPerQuestion: 2,
				negativeMarks: 0.5,
				instructions: 'Two marks for each correct answer.',
			},
			{
				name: 'Quantitative Aptitude',
				questionTypes: ['multiple-choice'],
				questionCount: 3,
				marksPerQuestion: 2,
				negativeMarks: 0.5,
				instructions: null,
			},
		],
		generalInstructions: ['Use of calculator is not allowed.'],
	};
}

describe('examPatternSchema', () => {
	it('accepts a realistic pattern', () => {
		const result = examPatternSchema.safeParse(validPattern());
		expect(result.success).toBe(true);
	});

	it('rejects a pattern without sections', () => {
		const result = examPatternSchema.safeParse({ ...validPattern(), sections: [] });
		expect(result.success).toBe(false);
	});

	it('rejects invalid counts, marks and durations', () => {
		const base = validPattern();
		expect(
			examPatternSchema.safeParse({
				...base,
				sections: [{ ...base.sections[0], questionCount: 0 }],
			}).success
		).toBe(false);
		expect(
			examPatternSchema.safeParse({
				...base,
				sections: [{ ...base.sections[0], marksPerQuestion: -1 }],
			}).success
		).toBe(false);
		expect(examPatternSchema.safeParse({ ...base, durationMinutes: 0 }).success).toBe(false);
	});

	it('rejects sections with empty question-type lists', () => {
		const base = validPattern();
		const result = examPatternSchema.safeParse({
			...base,
			sections: [{ ...base.sections[0], questionTypes: [] }],
		});
		expect(result.success).toBe(false);
	});
});

describe('normalizeExamPattern', () => {
	it('adds stable slugs and trims text', () => {
		const pattern = normalizeExamPattern({
			...validPattern(),
			examName: '  SSC CGL Tier 1  ',
			sections: [
				{ ...validPattern().sections[0], name: 'General Intelligence & Reasoning' },
				validPattern().sections[1],
			],
		});
		expect(pattern.examName).toBe('SSC CGL Tier 1');
		expect(pattern.sections[0].id).toBe('general-intelligence-reasoning');
		expect(pattern.sections[1].id).toBe('quantitative-aptitude');
	});

	it('de-duplicates colliding section slugs', () => {
		const base = validPattern();
		const pattern = normalizeExamPattern({
			...base,
			sections: [
				{ ...base.sections[0], name: 'Maths' },
				{ ...base.sections[1], name: 'Maths' },
			],
		});
		expect(pattern.sections.map((section) => section.id)).toEqual(['maths', 'maths-2']);
	});
});

describe('patternKeyFor', () => {
	it('builds exam, board and paper keys', () => {
		expect(patternKeyFor({ examId: 'ssc-cgl' })).toBe('exam:ssc-cgl');
		expect(patternKeyFor({ board: 'CBSE', classLevel: '10', subject: 'Science' })).toBe(
			'board:cbse:10:science'
		);
		expect(patternKeyFor({ paperName: 'SSC CGL Tier 1 2026' })).toBe(
			'paper:ssc-cgl-tier-1-2026'
		);
	});

	it('prefers the exam id, then a named paper, then board details', () => {
		expect(
			patternKeyFor({ examId: 'ssc-cgl', paperName: 'Ignored', board: 'CBSE' })
		).toBe('exam:ssc-cgl');
		expect(patternKeyFor({ paperName: 'Half Yearly', board: 'CBSE', classLevel: '9' })).toBe(
			'paper:half-yearly'
		);
	});

	it('returns null when there is not enough to identify a pattern', () => {
		expect(patternKeyFor({})).toBeNull();
		expect(patternKeyFor({ board: 'CBSE' })).toBeNull();
		expect(patternKeyFor({ board: 'CBSE', classLevel: '10' })).toBeNull();
	});
});

describe('isPatternExpired', () => {
	const now = new Date('2026-09-24T12:00:00.000Z');
	it('treats missing dates as expired and future dates as fresh', () => {
		expect(isPatternExpired(null, now)).toBe(true);
		expect(isPatternExpired('2026-10-24T12:00:00.000Z', now)).toBe(false);
		expect(isPatternExpired('2026-09-01T12:00:00.000Z', now)).toBe(true);
	});
});

describe('buildPatternResearchPrompt', () => {
	it('refuses an empty target instead of letting the model invent an exam', () => {
		expect(() => buildPatternResearchPrompt({})).toThrow();
	});

	it('names the exam and board details in the prompt', () => {
		const prompt = buildPatternResearchPrompt({
			examName: 'SSC CGL Tier 1',
			board: 'CBSE',
			classLevel: '10',
			subject: 'Science',
		});
		expect(prompt).toContain('SSC CGL Tier 1');
		expect(prompt).toContain('CBSE board');
		expect(prompt).toContain('class 10');
		expect(prompt).toContain('Science');
	});
});

describe('assignSectionsToPaper', () => {
	const questions = Array.from({ length: 4 }, (_, index) => ({ question: `Q${index + 1}` }));
	const pattern = normalizeExamPattern({
		...validPattern(),
		sections: [
			{ ...validPattern().sections[0], questionCount: 2 },
			{ ...validPattern().sections[1], questionCount: 2 },
		],
	});

	it('assigns sequential index ranges from the pattern', () => {
		const result = assignSectionsToPaper(questions, pattern);
		expect(result.sections.map((section) => section.questionIndexes)).toEqual([
			[0, 1],
			[2, 3],
		]);
		expect(result.examMeta.examName).toBe('SSC CGL Tier 1');
		expect(result.examMeta.patternCheckedAt).toBeTruthy();
	});

	it('drops sections with no remaining questions and lets the last absorb extras', () => {
		const short = assignSectionsToPaper(questions.slice(0, 3), pattern);
		expect(short.sections.map((section) => section.questionIndexes)).toEqual([[0, 1], [2]]);
		const long = assignSectionsToPaper([...questions, { question: 'Q5' }], pattern);
		expect(long.sections[1].questionIndexes).toEqual([2, 3, 4]);
		expect(long.sections[1].questionCount).toBe(3);
	});

	it('returns no sections when there is no pattern', () => {
		const result = assignSectionsToPaper(questions, null);
		expect(result.sections).toEqual([]);
		expect(result.examMeta).toBeNull();
	});

	it('focuses a single section for sectional papers', () => {
		const result = assignSectionsToPaper(questions, pattern, {
			section: pattern.sections[0],
		});
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0].questionIndexes).toEqual([0, 1, 2, 3]);
		expect(result.examMeta.sectionOnly).toBe(true);
	});
});
