import { describe, expect, it } from 'vitest';
import {
	BATCH_SIZE,
	buildTopUpInstruction,
	partitionRound,
	salvageSummary,
	shouldReturnTrimmed,
	topUpBatchSize,
	trimFloor,
} from './generationSalvage.js';

const question = (text) => ({
	question: text,
	options: ['A', 'B', 'C', 'D'],
	answer: 'A',
});

describe('trimFloor', () => {
	it('keeps at least five quiz questions and enforces 60%', () => {
		expect(trimFloor(10, 'quiz-practice')).toBe(6);
		expect(trimFloor(5, 'quiz-practice')).toBe(5);
		expect(trimFloor(20, 'quiz-practice')).toBe(12);
	});

	it('keeps exams at 15+ and 75%', () => {
		expect(trimFloor(20, 'full-exam')).toBe(15);
		expect(trimFloor(40, 'full-exam')).toBe(30);
		expect(trimFloor(10, 'full-exam')).toBe(10);
	});
});

describe('shouldReturnTrimmed', () => {
	it('accepts a paper at or above the floor', () => {
		expect(shouldReturnTrimmed({ approved: 6, requested: 10 })).toBe(true);
		expect(shouldReturnTrimmed({ approved: 5, requested: 10 })).toBe(false);
	});
});

describe('topUpBatchSize', () => {
	it('adds a buffer and caps at the batch size', () => {
		expect(topUpBatchSize(2)).toBe(3);
		expect(topUpBatchSize(5)).toBe(7);
		expect(topUpBatchSize(30)).toBe(BATCH_SIZE);
	});
});

describe('partitionRound', () => {
	it('keeps unblemished questions and annotates rejected drafts', () => {
		const questions = [question('q1'), question('q2'), question('q3')];
		const { approved, rejected } = partitionRound({
			questions,
			qualityIssues: [{ index: 1, issue: 'near-duplicate' }],
			mismatchIndexes: [2],
		});
		expect(approved).toHaveLength(1);
		expect(approved[0].question).toBe('q1');
		expect(rejected.map((entry) => entry.issues)).toEqual([
			['near-duplicate'],
			['verification-disagreement'],
		]);
	});

	it('merges structural and quality issues on the same question', () => {
		const { rejected } = partitionRound({
			questions: [question('q1')],
			structuralIssues: [{ index: 0, issue: 'bad-option-count' }],
			qualityIssues: [{ index: 0, issue: 'longest-answer-tell' }],
		});
		expect(rejected[0].issues).toEqual(['bad-option-count', 'longest-answer-tell']);
	});

	it('ignores out-of-range indexes', () => {
		const { approved, rejected } = partitionRound({
			questions: [question('q1')],
			qualityIssues: [{ index: 9, issue: 'near-duplicate' }],
		});
		expect(approved).toHaveLength(1);
		expect(rejected).toHaveLength(0);
	});
});

describe('buildTopUpInstruction', () => {
	it('names the rejected drafts and their reasons', () => {
		const instruction = buildTopUpInstruction({
			rejected: [{ question: question('Old draft?'), issues: ['near-duplicate'] }],
			approvedTexts: ['Kept question?'],
			round: 2,
			ask: 3,
		});
		expect(instruction).toContain('Replacement round 2');
		expect(instruction).toContain('exactly 3 NEW questions');
		expect(instruction).toContain('Old draft?');
		expect(instruction).toContain('near-duplicate');
		expect(instruction).toContain('Kept question?');
	});

	it('stays bounded when many drafts were rejected', () => {
		const rejected = Array.from({ length: 30 }, (_, index) => ({
			question: question(`Draft ${index}`),
			issues: ['near-duplicate'],
		}));
		const instruction = buildTopUpInstruction({ rejected, round: 1, ask: 5 });
		expect(instruction.split('Rejected drafts')[1].split('\n').length).toBeLessThanOrEqual(10);
	});
});

describe('salvageSummary', () => {
	it('reports counts without question text', () => {
		expect(
			salvageSummary({ requested: 10, approved: 8, rounds: 3, rejectedCount: 4, trimmed: true })
		).toEqual({
			requested: 10,
			approved: 8,
			rounds: 3,
			rejected: 4,
			trimmed: true,
			issueCounts: {},
		});
	});
});
