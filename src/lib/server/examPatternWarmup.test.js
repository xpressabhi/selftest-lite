import { describe, expect, it } from 'vitest';
import { patternKeyFor } from './examPattern';
import {
	buildWarmupTargets,
	patternKeyForExamId,
	planPatternWarmup,
	summarizeWarmup,
	warmupDelayMs
} from './examPatternWarmup';

/**
 * Failure modes this warm-up has to survive, written before the implementation:
 *
 *  1. A target whose exam id is not in the registry must be dropped — discovery
 *     needs a real exam name, or the model invents an exam ("You can't discover
 *     a pattern for a bare id").
 *  2. The pattern key must match `patternKeyFor` exactly, or every run thinks a
 *     cached pattern is missing and burns a model call per exam, per run.
 *  3. A fresh pattern must cost nothing. A cap that silently means "unlimited"
 *     would let one run fire a model call per registered exam.
 *  4. `expires_at` being null, unparseable or in the past all mean "needs a
 *     refresh"; only a future expiry is fresh.
 *  5. One exam failing must not abort the rest of the run.
 *  6. Duplicate ids must not double-charge the model.
 */
const registry = [
	{ id: 'ssc-cgl', name: 'SSC CGL' },
	{ id: 'neet-ug', name: 'NEET UG' },
	{ id: 'up-tgt-pgt', name: 'UP TGT/PGT' }
];

describe('patternKeyForExamId', () => {
	it('produces exactly the key the pattern store uses', () => {
		const ids = [
			'ssc-cgl',
			'neet-ug',
			'up-tgt-pgt',
			'SSC CGL',
			'UP TGT/PGT',
			'  spaced-id  ',
			'Mixed_Case.Id',
			'a'.repeat(80),
			'upsc-cse-prelims'
		];
		for (const examId of ids) {
			expect(patternKeyForExamId(examId), `key drift for "${examId}"`).toBe(
				patternKeyFor({ examId })
			);
		}
	});

	it('returns null for an unusable id rather than a bogus key', () => {
		expect(patternKeyForExamId('')).toBeNull();
		expect(patternKeyForExamId(null)).toBeNull();
		expect(patternKeyForExamId(undefined)).toBeNull();
	});
});

describe('buildWarmupTargets', () => {
	it('keeps only registered exams, because discovery needs a real name', () => {
		const targets = buildWarmupTargets({
			examIds: ['ssc-cgl', 'not-a-real-exam', 'neet-ug'],
			registry
		});
		expect(targets).toEqual([
			{ examId: 'ssc-cgl', examName: 'SSC CGL', patternKey: 'exam:ssc-cgl' },
			{ examId: 'neet-ug', examName: 'NEET UG', patternKey: 'exam:neet-ug' }
		]);
	});

	it('deduplicates so one exam cannot be paid for twice', () => {
		const targets = buildWarmupTargets({ examIds: ['ssc-cgl', 'ssc-cgl'], registry });
		expect(targets).toHaveLength(1);
	});

	it('caps the run and treats an explicit zero as none, not unlimited', () => {
		expect(buildWarmupTargets({ examIds: ['ssc-cgl', 'neet-ug'], registry, limit: 1 })).toHaveLength(1);
		expect(buildWarmupTargets({ examIds: ['ssc-cgl', 'neet-ug'], registry, limit: 0 })).toEqual([]);
		expect(buildWarmupTargets({ examIds: ['ssc-cgl', 'neet-ug'], registry, limit: -3 })).toEqual([]);
	});

	it('ignores empty and non-string ids', () => {
		expect(buildWarmupTargets({ examIds: ['', null, undefined, 7, '  '], registry })).toEqual([]);
	});

	it('returns nothing when there is no demand', () => {
		expect(buildWarmupTargets({ examIds: [], registry })).toEqual([]);
		expect(buildWarmupTargets()).toEqual([]);
	});
});

describe('planPatternWarmup', () => {
	const targets = buildWarmupTargets({ examIds: ['ssc-cgl', 'neet-ug', 'up-tgt-pgt'], registry });
	const now = new Date('2026-10-09T12:00:00Z');

	it('marks a live pattern fresh so it costs no model call', () => {
		const plan = planPatternWarmup({
			targets,
			rows: [{ pattern_key: 'exam:ssc-cgl', expires_at: '2026-11-16T12:40:09Z' }],
			now
		});
		expect(plan.find((entry) => entry.examId === 'ssc-cgl').status).toBe('fresh');
	});

	it('treats a past expiry as expired', () => {
		const plan = planPatternWarmup({
			targets,
			rows: [{ pattern_key: 'exam:ssc-cgl', expires_at: '2026-10-08T12:00:00Z' }],
			now
		});
		expect(plan.find((entry) => entry.examId === 'ssc-cgl').status).toBe('expired');
	});

	it('treats a null or unparseable expiry as expired, never as fresh', () => {
		const plan = planPatternWarmup({
			targets,
			rows: [
				{ pattern_key: 'exam:ssc-cgl', expires_at: null },
				{ pattern_key: 'exam:neet-ug', expires_at: 'not-a-date' }
			],
			now
		});
		expect(plan.find((entry) => entry.examId === 'ssc-cgl').status).toBe('expired');
		expect(plan.find((entry) => entry.examId === 'neet-ug').status).toBe('expired');
	});

	it('reports a missing pattern as missing', () => {
		const plan = planPatternWarmup({ targets, rows: [], now });
		expect(plan.map((entry) => entry.status)).toEqual(['missing', 'missing', 'missing']);
	});

	it('ignores cached rows that no target asked for', () => {
		const plan = planPatternWarmup({
			targets,
			rows: [{ pattern_key: 'exam:ibps-po', expires_at: '2026-11-16T12:40:09Z' }],
			now
		});
		expect(plan.every((entry) => entry.status === 'missing')).toBe(true);
	});

	it('carries the registry name and key through for the HTTP call', () => {
		const plan = planPatternWarmup({ targets, rows: [], now });
		expect(plan[2]).toEqual({
			examId: 'up-tgt-pgt',
			examName: 'UP TGT/PGT',
			patternKey: 'exam:up-tgt-pgt',
			status: 'missing'
		});
	});
});

describe('summarizeWarmup', () => {
	it('counts what was skipped, warmed and failed', () => {
		const summary = summarizeWarmup([
			{ examId: 'a', status: 'fresh' },
			{ examId: 'b', status: 'missing', outcome: 'warmed' },
			{ examId: 'c', status: 'expired', outcome: 'warmed' },
			{ examId: 'd', status: 'missing', outcome: 'failed', detail: '404' }
		]);
		expect(summary).toEqual({
			total: 4,
			skippedFresh: 1,
			warmed: 2,
			failed: [{ examId: 'd', detail: '404' }]
		});
	});

	it('does not count a failed call as warmed', () => {
		const summary = summarizeWarmup([{ examId: 'x', status: 'missing', outcome: 'failed' }]);
		expect(summary.warmed).toBe(0);
		expect(summary.failed).toHaveLength(1);
	});
});

describe('warmupDelayMs', () => {
	it('paces calls under the public 10/min limit instead of generating 429s', () => {
		expect(warmupDelayMs({ limit: 10, windowMs: 60_000 })).toBe(6_000);
	});

	it('falls back to a full window when the limit is unusable', () => {
		expect(warmupDelayMs({ limit: 0, windowMs: 60_000 })).toBe(60_000);
		expect(warmupDelayMs({ limit: Number.NaN, windowMs: 30_000 })).toBe(30_000);
	});
});
