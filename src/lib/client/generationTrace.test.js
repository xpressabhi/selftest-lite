import { describe, expect, it } from 'vitest';
import { deriveGenerationTrace } from './generationTrace.js';

const statusOf = (trace, id) => trace.steps.find((step) => step.id === id)?.status;

describe('deriveGenerationTrace', () => {
	it('starts on the reading step before any progress arrives', () => {
		const trace = deriveGenerationTrace(null);
		expect(statusOf(trace, 'reading')).toBe('running');
		expect(statusOf(trace, 'drafting')).toBe('pending');
		expect(trace.currentId).toBe('reading');
		expect(trace.phase).toBe('working');
	});

	it('keeps reading in progress for the starting stage', () => {
		const trace = deriveGenerationTrace({ stage: 'starting', approved: 0, requested: 20 });
		expect(statusOf(trace, 'reading')).toBe('running');
		expect(trace.counts).toEqual({ approved: 0, requested: 20 });
	});

	it('moves to drafting and reports the live count', () => {
		const trace = deriveGenerationTrace({
			stage: 'generating',
			approved: 8,
			requested: 20,
			round: 1,
		});
		expect(statusOf(trace, 'reading')).toBe('done');
		expect(statusOf(trace, 'drafting')).toBe('running');
		expect(trace.currentId).toBe('drafting');
		expect(trace.counts).toEqual({ approved: 8, requested: 20 });
	});

	it('moves to refining when the server salvages a round', () => {
		const trace = deriveGenerationTrace({
			stage: 'salvaging',
			approved: 12,
			requested: 20,
			round: 2,
		});
		expect(statusOf(trace, 'drafting')).toBe('done');
		expect(statusOf(trace, 'refining')).toBe('running');
		expect(trace.currentId).toBe('refining');
	});

	it('assembles once every question is approved', () => {
		const trace = deriveGenerationTrace({
			stage: 'salvaging',
			approved: 20,
			requested: 20,
			round: 2,
		});
		expect(statusOf(trace, 'refining')).toBe('done');
		expect(statusOf(trace, 'assembling')).toBe('running');
		expect(trace.currentId).toBe('assembling');
	});

	it('marks every step done and switches to the ready phase when finished', () => {
		const trace = deriveGenerationTrace(
			{ stage: 'generating', approved: 20, requested: 20 },
			{ done: true }
		);
		expect(trace.steps.every((step) => step.status === 'done')).toBe(true);
		expect(trace.currentId).toBe('ready');
		expect(trace.phase).toBe('ready');
	});

	it('exposes batch progress only for multi-batch papers', () => {
		const single = deriveGenerationTrace({
			stage: 'generating',
			approved: 3,
			requested: 20,
			batchIndex: 1,
			batchTotal: 1,
		});
		expect(single.batch).toBeNull();
		const multi = deriveGenerationTrace({
			stage: 'generating',
			approved: 3,
			requested: 60,
			batchIndex: 2,
			batchTotal: 3,
		});
		expect(multi.batch).toEqual({ index: 2, total: 3 });
	});

	it('tolerates malformed progress payloads', () => {
		const trace = deriveGenerationTrace({ stage: 42, approved: 'nope', requested: -5 });
		expect(trace.counts).toEqual({ approved: 0, requested: 0 });
		expect(trace.currentId).toBe('reading');
	});
});
