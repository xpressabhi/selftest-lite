import { describe, expect, it } from 'vitest';
import {
	buildLocalPlanPatch,
	buildLocalPreview,
	isMeaningfulPreview,
	isTestIdQuery,
	needsJevPreview,
	shouldRunPreview,
} from './livePreview.js';

describe('buildLocalPreview', () => {
	it('returns null for text that is too short', () => {
		expect(buildLocalPreview('ab')).toBeNull();
		expect(buildLocalPreview('   ')).toBeNull();
	});

	it('returns null for a test-id search', () => {
		expect(buildLocalPreview('123')).toBeNull();
		expect(buildLocalPreview('1234')).toBeNull();
		expect(buildLocalPreview(' 12345 ')).toBeNull();
	});

	it('clamps a question count to the server range', () => {
		expect(buildLocalPreview('500 questions on photosynthesis').numQuestions).toBe(200);
		expect(buildLocalPreview('100 questions on photosynthesis').numQuestions).toBe(100);
		expect(buildLocalPreview('2 questions on photosynthesis').numQuestions).toBe(5);
	});

	it('reads a plain topic and its question count', () => {
		const local = buildLocalPreview('20 questions on photosynthesis');
		expect(local.topic).toBe('photosynthesis');
		expect(local.numQuestions).toBe(20);
		expect(local.examId).toBeNull();
	});

	it('resolves difficulty, language and test type when the words are clear', () => {
		expect(buildLocalPreview('hard photosynthesis quiz').difficulty).toBe('advanced');
		expect(buildLocalPreview('hindi photosynthesis quiz').language).toBe('hindi');
		expect(buildLocalPreview('photosynthesis coding quiz').testType).toBe('coding');
	});

	it('resolves an exam named exactly in the message', () => {
		const local = buildLocalPreview('SSC CGL mock test');
		expect(local.examId).toBe('ssc-cgl');
		expect(local.mentions.exam).toBe(true);
	});

	it('flags a fuller topic candidate the local ranker skipped', () => {
		const local = buildLocalPreview('class 10 physics quiz');
		expect(local.hasLongerCandidate).toBe(true);
	});
});

describe('isTestIdQuery', () => {
	it('matches only all-digit queries', () => {
		expect(isTestIdQuery('1234')).toBe(true);
		expect(isTestIdQuery(' 1234 ')).toBe(true);
		expect(isTestIdQuery('1234 physics')).toBe(false);
		expect(isTestIdQuery('abc123')).toBe(false);
		expect(isTestIdQuery('')).toBe(false);
	});
});

describe('isMeaningfulPreview', () => {
	it('accepts a resolved topic or an exam', () => {
		expect(isMeaningfulPreview({ topic: 'photosynthesis' })).toBe(true);
		expect(isMeaningfulPreview({ examId: 'ssc-cgl' })).toBe(true);
	});

	it('rejects a raw or missing topic', () => {
		expect(isMeaningfulPreview({ topic: 'hard', topicSource: 'raw' })).toBe(false);
		expect(isMeaningfulPreview({ topic: '   ' })).toBe(false);
		expect(isMeaningfulPreview({})).toBe(false);
		expect(isMeaningfulPreview(null)).toBe(false);
	});

	it('accepts topics resolved from a span, an answer, or a previous plan', () => {
		expect(isMeaningfulPreview({ topic: 'x', topicSource: 'span' })).toBe(true);
		expect(isMeaningfulPreview({ topic: 'x', topicSource: 'previous' })).toBe(true);
	});
});

describe('needsJevPreview', () => {
	it('is false for a self-contained topic request', () => {
		expect(needsJevPreview(buildLocalPreview('photosynthesis quiz'))).toBe(false);
	});

	it('is true when a longer topic candidate exists', () => {
		expect(needsJevPreview(buildLocalPreview('class 10 physics quiz'))).toBe(true);
	});

	it('is true for an unmapped mention', () => {
		expect(needsJevPreview(buildLocalPreview('translate this photosynthesis'))).toBe(true);
	});

	it('is true for an exam hint without an exact exam', () => {
		const local = buildLocalPreview('photosynthesis exam paper');
		expect(local.examId).toBeNull();
		expect(needsJevPreview(local)).toBe(true);
	});

	it('is true for contradictory difficulty words', () => {
		expect(needsJevPreview(buildLocalPreview('hard easy photosynthesis'))).toBe(true);
	});
});

describe('buildLocalPlanPatch', () => {
	it('skips locked fields and keeps the rest', () => {
		const local = buildLocalPreview('hard photosynthesis quiz');
		const patch = buildLocalPlanPatch(local, { difficulty: true });
		expect(patch.topic).toBe('photosynthesis');
		expect(patch.difficulty).toBeUndefined();
	});

	it('returns null when there is nothing to apply', () => {
		expect(buildLocalPlanPatch(buildLocalPreview('ab'))).toBeNull();
	});
});

describe('shouldRunPreview', () => {
	const base = { text: 'photosynthesis quiz', status: 'idle', now: 10000 };

	it('allows a fresh text', () => {
		expect(shouldRunPreview(base)).toBe(true);
	});

	it('blocks short text, test ids and repeats', () => {
		expect(shouldRunPreview({ ...base, text: 'ab' })).toBe(false);
		expect(shouldRunPreview({ ...base, text: '1234' })).toBe(false);
		expect(shouldRunPreview({ ...base, lastText: 'photosynthesis quiz' })).toBe(false);
	});

	it('blocks while a turn runs, offline, or in data saver', () => {
		expect(shouldRunPreview({ ...base, status: 'parsing' })).toBe(false);
		expect(shouldRunPreview({ ...base, offline: true })).toBe(false);
		expect(shouldRunPreview({ ...base, dataSaver: true })).toBe(false);
	});

	it('honours the interval and the post-429 pause', () => {
		expect(shouldRunPreview({ ...base, lastAt: 9500, now: 10000 })).toBe(false);
		expect(shouldRunPreview({ ...base, lastAt: 8000, now: 10000 })).toBe(true);
		expect(shouldRunPreview({ ...base, pausedUntil: 12000 })).toBe(false);
	});
});
