import { describe, expect, it } from 'vitest';
import {
	MAX_QUESTIONS,
	MIN_QUESTIONS,
	MAX_TOPIC_CANDIDATES,
	buildExamCriteria,
	buildIntentQuestions,
	buildTopicCandidates,
	clampQuestions,
	classifyConfidence,
	deriveIntentParams,
	extractMentionedFields,
	extractQuestionCount,
	hasDifficultyContradiction,
	normalizePlan,
	repairTopicSpan,
	selectClarification,
} from './intentParse.js';

function choice(selected, probabilities, confidence = 0.9) {
	return { type: 'choice', choice: selected, probabilities, confidence };
}

function noul(value) {
	return { type: 'noul', noul: value };
}

const EXAM_PROBABILITIES = { 'jee-main': 0.74, 'neet-ug': 0.12, none: 0.14 };

describe('normalizePlan', () => {
	it('fills defaults for empty input', () => {
		expect(normalizePlan(null)).toMatchObject({
			topic: '',
			testType: 'multiple-choice',
			difficulty: 'intermediate',
			numQuestions: 10,
			examId: null,
			isFullExam: false,
			language: 'english',
		});
	});

	it('rejects unknown enum values and exam ids', () => {
		const plan = normalizePlan({
			testType: 'essay',
			difficulty: 'impossible',
			language: 'klingon',
			examId: 'not-an-exam',
			isFullExam: true,
		});
		expect(plan.testType).toBe('multiple-choice');
		expect(plan.difficulty).toBe('intermediate');
		expect(plan.language).toBe('english');
		expect(plan.examId).toBeNull();
		expect(plan.isFullExam).toBe(true);
	});

	it('clamps question counts', () => {
		expect(normalizePlan({ numQuestions: 500 }).numQuestions).toBe(MAX_QUESTIONS);
		expect(normalizePlan({ numQuestions: 1 }).numQuestions).toBe(MIN_QUESTIONS);
	});
});

describe('extractQuestionCount', () => {
	it('reads digits next to question words', () => {
		expect(extractQuestionCount('give me 20 questions on physics')).toEqual({
			count: 20,
			explicit: true,
		});
		expect(extractQuestionCount('questions: 15 on arrays')).toEqual({
			count: 15,
			explicit: true,
		});
		expect(extractQuestionCount('10 Qs please')).toEqual({ count: 10, explicit: true });
	});

	it('reads counts separated from the question word by adjectives', () => {
		expect(extractQuestionCount('20 hard Hindi coding questions for JEE').count).toBe(20);
	});

	it('reads number words and dozens', () => {
		expect(extractQuestionCount('twenty questions on algebra').count).toBe(20);
		expect(extractQuestionCount('a dozen questions on history').count).toBe(12);
		expect(extractQuestionCount('बीस प्रश्न').count).toBe(20);
	});

	it('treats a bare number as a count', () => {
		expect(extractQuestionCount('15')).toEqual({ count: 15, explicit: true });
	});

	it('does not treat class numbers as counts', () => {
		expect(extractQuestionCount('class 10 physics test')).toEqual({
			count: null,
			explicit: false,
		});
		expect(extractQuestionCount('physics for class 12, hard')).toEqual({
			count: null,
			explicit: false,
		});
	});

	it('returns nothing for a plain topic', () => {
		expect(extractQuestionCount('photosynthesis quiz')).toEqual({
			count: null,
			explicit: false,
		});
	});
});

describe('extractMentionedFields', () => {
	it('detects the fields a message talks about', () => {
		const mentioned = extractMentionedFields('make it 20 hard Hindi coding questions for JEE');
		expect(mentioned).toMatchObject({
			numQuestions: true,
			difficulty: true,
			language: true,
			testType: true,
			exam: true,
		});
	});

	it('leaves unrelated messages alone', () => {
		const mentioned = extractMentionedFields('photosynthesis');
		expect(mentioned).toMatchObject({
			numQuestions: false,
			difficulty: false,
			language: false,
			testType: false,
			exam: false,
		});
	});
});

describe('buildTopicCandidates', () => {
	it('keeps the subject phrase verbatim', () => {
		const candidates = buildTopicCandidates(
			'make me a hard test on photosynthesis and cellular respiration for class 10'
		);
		expect(candidates).toContain('photosynthesis');
		expect(candidates).toContain('photosynthesis and cellular respiration');
		expect(candidates).not.toContain('class');
	});

	it('works for Hindi text', () => {
		const candidates = buildTopicCandidates('हिंदी में प्रकाश संश्लेषण पर टेस्ट बनाओ');
		expect(candidates).toContain('प्रकाश संश्लेषण');
	});

	it('returns nothing for a config-only message', () => {
		expect(buildTopicCandidates('please make me a test')).toEqual([]);
	});

	it('ignores half-typed config words', () => {
		expect(buildTopicCandidates('10 questions')).toEqual([]);
		expect(buildTopicCandidates('10 questio')).toEqual([]);
		expect(buildTopicCandidates('cla 10')).toEqual([]);
		expect(buildTopicCandidates('har')).toEqual([]);
	});
});

describe('topic span repair (failure modes F1-F8)', () => {
	// F1: hyphenated compounds must survive tokenization as one token.
	it('keeps hyphenated compounds whole', () => {
		const candidates = buildTopicCandidates('python built-in data structures');
		expect(candidates).toContain('built-in');
		expect(candidates).toContain('python built-in data structures');
	});

	// F2: a fragment choice recovers the adjacent content tokens.
	it('repairs a fragment by absorbing adjacent content tokens', () => {
		expect(repairTopicSpan('python built-in data structures', 'data structures')).toBe(
			'python built-in data structures'
		);
		expect(repairTopicSpan('python built in data structures', 'data structures')).toBe(
			'python built in data structures'
		);
		expect(repairTopicSpan('photosynthesis and cellular respiration', 'photosynthesis')).toBe(
			'photosynthesis and cellular respiration'
		);
	});

	// F3: config words, numbers, and exam-name tokens stop expansion.
	it('does not cross config words or numbers', () => {
		expect(repairTopicSpan('make 10 physics questions on optics', 'optics')).toBe('optics');
		expect(repairTopicSpan('10 hard physics questions', 'physics')).toBe('physics');
		expect(repairTopicSpan('give me a quiz on data structures', 'data structures')).toBe(
			'data structures'
		);
	});

	it('does not absorb exam-name tokens', () => {
		expect(repairTopicSpan('jee main physics', 'physics')).toBe('physics');
		expect(repairTopicSpan('upsc prelims modern history', 'modern history')).toBe('modern history');
	});

	// F4: punctuation and newlines are hard boundaries.
	it('does not cross punctuation or line breaks', () => {
		expect(
			repairTopicSpan('python, built in data structures', 'data structures')
		).toBe('built in data structures');
		expect(repairTopicSpan('python\nbuilt in data structures', 'data structures')).toBe(
			'built in data structures'
		);
	});

	// F5: Devanagari spans expand like Latin ones.
	it('repairs Devanagari spans', () => {
		expect(repairTopicSpan('प्रकाश और संश्लेषण', 'संश्लेषण')).toBe('प्रकाश और संश्लेषण');
		expect(repairTopicSpan('हिंदी में प्रकाश संश्लेषण पर टेस्ट बनाओ', 'प्रकाश संश्लेषण')).toBe(
			'प्रकाश संश्लेषण'
		);
	});

	// F6: a span already covering the phrase is returned unchanged.
	it('leaves a fully covering span unchanged', () => {
		expect(
			repairTopicSpan('python built in data structures', 'python built in data structures')
		).toBe('python built in data structures');
		expect(
			repairTopicSpan(
				'photosynthesis and cellular respiration for class 10',
				'photosynthesis and cellular respiration'
			)
		).toBe('photosynthesis and cellular respiration');
	});

	// F7: over-long expansions fall back to the chosen span.
	it('falls back when the expansion exceeds the cap', () => {
		const long = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
		expect(repairTopicSpan(long, 'epsilon')).toBe('epsilon');
	});

	// F8: the tokenizer change does not explode candidate counts.
	it('keeps candidates within the existing limits', () => {
		const candidates = buildTopicCandidates(
			'python built-in data structures and algorithms for interviews'
		);
		expect(candidates.length).toBeLessThanOrEqual(MAX_TOPIC_CANDIDATES);
		expect(candidates).toContain('data structures and algorithms');
		expect(candidates.indexOf('data structures')).toBeLessThan(
			candidates.indexOf('data structures and algorithms')
		);
	});

	it('wires repair into an accepted topic span choice', () => {
		const result = deriveIntentParams({
			intent: 'python built-in data structures',
			judgments: {
				is_exam: noul(0.05),
				exam_id: choice('none', { none: 0.95 }, 0.95),
				topic_span: choice('data structures', { 'data structures': 0.72 }, 0.8),
				test_type: choice('multiple-choice', { 'multiple-choice': 0.9 }),
				difficulty: choice('intermediate', { intermediate: 0.9 }),
				language: choice('english', { english: 0.9 }),
			},
		});
		expect(result.plan.topic).toBe('python built-in data structures');
		expect(result.topicSource).toBe('span');
	});

	it('appends the exam suffix after repair', () => {
		const result = deriveIntentParams({
			intent: 'jee main python built-in data structures',
			judgments: {
				is_exam: noul(0.9),
				exam_id: choice('jee-main', EXAM_PROBABILITIES, 0.9),
				topic_span: choice('data structures', { 'data structures': 0.85 }, 0.9),
				test_type: choice('multiple-choice', { 'multiple-choice': 0.9 }),
				difficulty: choice('advanced', { advanced: 0.8 }),
				language: choice('english', { english: 0.9 }),
			},
		});
		expect(result.plan.topic).toBe('python built-in data structures (JEE Main)');
	});
});

describe('buildExamCriteria', () => {
	it('covers every objective exam plus none', () => {
		const criteria = buildExamCriteria();
		expect(Object.keys(criteria)).toContain('none');
		expect(Object.keys(criteria)).toContain('jee-main');
		expect(criteria['jee-main']).toMatch(/JEE/);
		expect(Object.keys(criteria).length).toBeGreaterThan(50);
	});
});

describe('buildIntentQuestions', () => {
	it('always asks the core questions', () => {
		const questions = buildIntentQuestions({ candidates: [] });
		expect(Object.keys(questions)).toEqual(
			expect.arrayContaining(['is_exam', 'exam_id', 'test_type', 'difficulty', 'language'])
		);
		expect(questions.topic_span).toBeUndefined();
	});

	it('adds the topic span question when candidates exist', () => {
		const questions = buildIntentQuestions({ candidates: ['physics', 'optics'] });
		expect(questions.topic_span.type).toBe('choice');
		expect(questions.topic_span.criteria).toMatchObject({
			none: expect.any(String),
			physics: null,
			optics: null,
		});
	});
});

describe('classifyConfidence', () => {
	it('maps thresholds', () => {
		expect(classifyConfidence(0.9)).toBe('high');
		expect(classifyConfidence(0.55)).toBe('medium');
		expect(classifyConfidence(0.2)).toBe('low');
		expect(classifyConfidence(null)).toBe('medium');
	});
});

describe('selectClarification', () => {
	const candidates = ['photosynthesis', 'respiration'];
	const basePlan = normalizePlan({});

	it('asks for a topic when nothing identifies it', () => {
		const clarify = selectClarification({
			intent: 'make me a test',
			plan: basePlan,
			judgments: {
				exam_id: choice('none', { none: 0.9 }),
				topic_span: choice('none', { none: 0.8 }),
			},
			candidates,
		});
		expect(clarify?.id).toBe('topic');
		expect(clarify.options.length).toBeGreaterThan(0);
	});

	it('still asks for a topic when there are no candidate spans', () => {
		const clarify = selectClarification({
			intent: 'make me a test please',
			plan: basePlan,
			judgments: {
				exam_id: choice('none', { none: 0.9 }),
				topic_span: choice('none', { none: 0.9 }),
			},
			candidates: [],
		});
		expect(clarify?.id).toBe('topic');
		expect(clarify.options).toEqual([]);
	});

	it('asks which exam when a candidate is plausible but uncertain', () => {
		const clarify = selectClarification({
			intent: 'banking mock test',
			plan: basePlan,
			judgments: {
				exam_id: choice('ibps-po', { 'ibps-po': 0.42, 'ibps-clerk': 0.3, none: 0.28 }, 0.5),
				topic_span: choice('none', { none: 0.9 }),
			},
			candidates: [],
		});
		expect(clarify?.id).toBe('examId');
		expect(clarify.options.map((option) => option.value)).toContain('ibps-po');
	});

	it('never asks about an accepted exam or topic', () => {
		const clarify = selectClarification({
			intent: 'jee main physics test',
			plan: normalizePlan({ examId: 'jee-main' }),
			judgments: {
				exam_id: choice('jee-main', EXAM_PROBABILITIES, 0.9),
				topic_span: choice('physics', { physics: 0.8 }, 0.9),
			},
			candidates,
		});
		expect(clarify).toBeNull();
	});

	it('respects the round cap, skipped fields and asked fields', () => {
		const args = {
			intent: 'make me a test',
			plan: basePlan,
			judgments: { topic_span: choice('none', { none: 0.9 }) },
			candidates,
		};
		expect(selectClarification({ ...args, round: 2 })).toBeNull();
		expect(selectClarification({ ...args, skippedFields: ['topic'] })).toBeNull();
		expect(selectClarification({ ...args, askedFields: ['topic'] })).toBeNull();
	});

	it('asks difficulty when the message contradicts itself', () => {
		const clarify = selectClarification({
			intent: 'an easy test but hard questions for kids',
			plan: basePlan,
			judgments: {
				exam_id: choice('none', { none: 0.9 }),
				topic_span: choice('physics', { physics: 0.8 }, 0.9),
			},
			candidates: [],
		});
		expect(clarify?.id).toBe('difficulty');
	});
});

describe('hasDifficultyContradiction', () => {
	it('detects mixed signals', () => {
		expect(hasDifficultyContradiction('easy but hard')).toBe(true);
		expect(hasDifficultyContradiction('beginner test for kids')).toBe(false);
		expect(hasDifficultyContradiction('advanced physics')).toBe(false);
	});
});

describe('deriveIntentParams', () => {
	it('returns safe defaults and asks for a topic when nothing identifies it', () => {
		const result = deriveIntentParams({ intent: 'photosynthesis test', judgments: {} });
		expect(result.plan).toMatchObject({
			topic: 'photosynthesis test',
			testType: 'multiple-choice',
			difficulty: 'intermediate',
			numQuestions: 10,
			examId: null,
			language: 'english',
		});
		expect(result.clarify?.id).toBe('topic');
		expect(result.messageKey).toBe('plannerNeedOneThing');
	});

	it('uses an accepted topic span verbatim and deduces nothing else', () => {
		const result = deriveIntentParams({
			intent: 'hard test on photosynthesis and cellular respiration for class 10',
			judgments: {
				is_exam: noul(0.05),
				exam_id: choice('none', { none: 0.95 }, 0.95),
				test_type: choice('true-false', { 'true-false': 0.7, 'multiple-choice': 0.3 }),
				difficulty: choice('advanced', { advanced: 0.8 }),
				language: choice('english', { english: 0.95 }),
				topic_span: choice('photosynthesis and cellular respiration', {
					'photosynthesis and cellular respiration': 0.72,
				}),
			},
		});
		expect(result.plan.topic).toBe('photosynthesis and cellular respiration');
		expect(result.plan.testType).toBe('true-false');
		expect(result.plan.difficulty).toBe('advanced');
		expect(result.plan.isFullExam).toBe(false);
		expect(result.clarify).toBeNull();
	});

	it('accepts a confident exam and builds the exam topic', () => {
		const result = deriveIntentParams({
			intent: 'jee main mock test',
			judgments: {
				is_exam: noul(0.96),
				exam_id: choice('jee-main', EXAM_PROBABILITIES, 0.88),
				test_type: choice('multiple-choice', { 'multiple-choice': 0.95 }),
				difficulty: choice('advanced', { advanced: 0.8 }),
				language: choice('english', { english: 0.95 }),
				topic_span: choice('none', { none: 0.9 }),
			},
		});
		expect(result.plan.examId).toBe('jee-main');
		expect(result.plan.isFullExam).toBe(true);
		expect(result.plan.topic).toBe('JEE Main objective exam paper');
		expect(result.plan.numQuestions).toBe(20);
	});

	it('combines an accepted topic span with an exam', () => {
		const result = deriveIntentParams({
			intent: 'jee main physics mock test',
			judgments: {
				is_exam: noul(0.9),
				exam_id: choice('jee-main', EXAM_PROBABILITIES, 0.9),
				topic_span: choice('physics', { physics: 0.85 }, 0.9),
				test_type: choice('multiple-choice', { 'multiple-choice': 0.9 }),
				difficulty: choice('advanced', { advanced: 0.8 }),
				language: choice('english', { english: 0.9 }),
			},
		});
		expect(result.plan.topic).toBe('physics (JEE Main)');
	});

	it('rejects an uncertain exam and asks about it', () => {
		const result = deriveIntentParams({
			intent: 'banking mock test',
			judgments: {
				is_exam: noul(0.7),
				exam_id: choice(
					'ibps-po',
					{ 'ibps-po': 0.42, 'ibps-clerk': 0.31, none: 0.27 },
					0.5
				),
				topic_span: choice('none', { none: 0.9 }),
				test_type: choice('multiple-choice', { 'multiple-choice': 0.9 }),
				difficulty: choice('intermediate', { intermediate: 0.9 }),
				language: choice('english', { english: 0.9 }),
			},
		});
		expect(result.plan.examId).toBeNull();
		expect(result.clarify?.id).toBe('examId');
	});

	it('honours an explicit question count unless the message mentions it', () => {
		const kept = deriveIntentParams({
			intent: 'make it harder',
			previousPlan: { topic: 'physics', numQuestions: 25, difficulty: 'intermediate' },
			explicit: { numQuestions: true },
			judgments: {},
		});
		expect(kept.plan.numQuestions).toBe(25);

		const changed = deriveIntentParams({
			intent: 'make it 30 questions',
			previousPlan: { topic: 'physics', numQuestions: 25, difficulty: 'intermediate' },
			explicit: { numQuestions: true },
			judgments: {},
		});
		expect(changed.plan.numQuestions).toBe(30);
	});

	it('lets a clarification answer override the previous plan', () => {
		const result = deriveIntentParams({
			intent: 'done',
			previousPlan: { topic: 'banking exam prep', examId: null },
			answers: { examId: 'ibps-po', topic: 'IBPS PO practice' },
		});
		expect(result.plan.examId).toBe('ibps-po');
		expect(result.plan.topic).toBe('IBPS PO practice');
		expect(result.plan.isFullExam).toBe(true);
		expect(result.fieldConfidence.exam).toBe(1);
		expect(result.clarify).toBeNull();
	});

	it('falls back to the profile language when nothing else says', () => {
		const result = deriveIntentParams({
			intent: 'physics test',
			judgments: {},
			preferredLanguage: 'hindi',
		});
		expect(result.plan.language).toBe('hindi');
	});

	it('keeps the previous topic when the new message adds no subject', () => {
		const result = deriveIntentParams({
			intent: 'make it harder',
			previousPlan: { topic: 'thermodynamics', difficulty: 'intermediate' },
			judgments: {
				is_exam: noul(0.05),
				exam_id: choice('none', { none: 0.95 }, 0.95),
				topic_span: choice('none', { none: 0.9 }),
				test_type: choice('multiple-choice', { 'multiple-choice': 0.9 }),
				difficulty: choice('advanced', { advanced: 0.9 }),
				language: choice('english', { english: 0.9 }),
			},
		});
		expect(result.plan.topic).toBe('thermodynamics');
		expect(result.plan.difficulty).toBe('advanced');
		expect(result.messageKey).toBe('plannerPlanUpdated');
	});

	it('never throws on malformed answers', () => {
		const result = deriveIntentParams({
			intent: 'physics',
			judgments: {
				exam_id: { type: 'choice' },
				topic_span: { type: 'choice', choice: 42, probabilities: null },
				test_type: 'nonsense',
				is_exam: { type: 'noul', noul: 'high' },
			},
		});
		expect(result.plan.testType).toBe('multiple-choice');
		expect(result.plan.examId).toBeNull();
	});

	it('clamps explicit counts into range', () => {
		expect(
			deriveIntentParams({ intent: 'give me 500 questions on physics', judgments: {} }).plan
				.numQuestions
		).toBe(MAX_QUESTIONS);
		expect(clampQuestions(0)).toBe(MIN_QUESTIONS);
	});
});
