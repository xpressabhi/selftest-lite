import { describe, expect, it } from 'vitest';
import { detectTestType } from './intentLexicon.js';

describe('detectTestType statement-based phrasing', () => {
	it('recognizes the true/false wording in both languages', () => {
		for (const intent of [
			'true false questions on national symbols',
			'binary questions on national symbols',
			'statement based questions on polity',
			'राष्ट्रीय प्रतीक पर सही/गलत प्रश्न बनाओ',
			'राष्ट्रीय प्रतीक पर कथनों पर विचार कीजिए वाले प्रश्न',
			'कथन आधारित प्रश्न चाहिए',
		]) {
			expect(detectTestType(intent)).toBe('true-false');
		}
	});

	it('does not claim unrelated "statement" wording', () => {
		expect(detectTestType('statement of purpose for my exam')).not.toBe('true-false');
	});
});

import { cleanTopic, topicFromIntent } from './intentLexicon.js';

describe('cleanTopic', () => {
	it('removes question counts and setting clauses', () => {
		expect(cleanTopic('10 questions on photosynthesis')).toBe('photosynthesis');
		expect(cleanTopic('questions: 20 about the French Revolution')).toBe(
			'the French Revolution'
		);
		expect(cleanTopic('photosynthesis questions')).toBe('photosynthesis');
		expect(cleanTopic('photosynthesis in Hindi')).toBe('photosynthesis');
		expect(cleanTopic('multiple choice test on photosynthesis')).toBe('photosynthesis');
		expect(cleanTopic('true/false quiz about the French Revolution')).toBe(
			'the French Revolution'
		);
		expect(cleanTopic('10 hard questions in Hindi')).toBe('');
	});

	it('keeps a language or difficulty word that is part of the subject', () => {
		expect(cleanTopic('Hindi literature')).toBe('Hindi literature');
		expect(cleanTopic('advanced physics')).toBe('advanced physics');
		expect(cleanTopic('English grammar')).toBe('English grammar');
	});

	it('strips imperative wrappers and trailing filler', () => {
		expect(cleanTopic('please make me a quiz about python data structures')).toBe(
			'python data structures'
		);
		expect(cleanTopic('create a test on photosynthesis for me')).toBe('photosynthesis');
	});

	it('returns an empty string when only settings remain', () => {
		expect(cleanTopic('20 multiple choice questions')).toBe('');
		expect(cleanTopic('   ')).toBe('');
	});
});

describe('topicFromIntent', () => {
	it('extracts the subject from config-heavy requests', () => {
		expect(topicFromIntent('10 hard photosynthesis questions in Hindi')).toBe(
			'photosynthesis'
		);
		expect(
			topicFromIntent(
				'create a 20 question multiple choice test on the French Revolution for class 10'
			)
		).toBe('French Revolution');
		expect(topicFromIntent('make me a quiz about python data structures, 15 questions, easy')).toBe(
			'python data structures'
		);
		expect(topicFromIntent('I want a full mock test for SSC CGL general awareness in English')).toBe(
			'SSC CGL general awareness'
		);
		expect(topicFromIntent('hard physics numericals on kinematics')).toBe(
			'physics numericals on kinematics'
		);
		expect(topicFromIntent('NEET biology human physiology 30 MCQs')).toBe(
			'NEET biology human physiology'
		);
		expect(topicFromIntent('Hindi literature practice test with 10 questions')).toBe(
			'Hindi literature'
		);
		expect(topicFromIntent('English grammar quiz, 20 questions')).toBe('English grammar');
	});

	it('keeps a plain topic', () => {
		expect(topicFromIntent('photosynthesis in plants')).toBe('photosynthesis in plants');
	});

	it('returns an empty string when the request names no subject', () => {
		expect(topicFromIntent('10 hard questions in Hindi')).toBe('');
		expect(topicFromIntent('')).toBe('');
	});
});
