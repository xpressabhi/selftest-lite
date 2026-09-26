import { describe, expect, it } from 'vitest';
import {
	buildDiscoveryPrompt,
	buildExtractionPrompt,
	classifyExtractedItem,
	normalizeExtractedItems,
	runExamSync,
	runSourceDiscovery,
	withRetries
} from './examSync';

// Orchestration failure modes, pinned before the implementation existed:
// one dead source must not sink the others; a total outage must be visible;
// junk model output must never crash the run; out-of-scope and duplicate
// items must not publish; foreign or dead links must quarantine, not show;
// dates gone bad degrade to null with a recorded problem; existing rows must
// update without a pointless reachability check; low confidence must wait.

const SOURCE = {
	id: 'ssc',
	org: 'Staff Selection Commission',
	category: 'ssc-central',
	state: null,
	listingUrls: ['https://ssc.gov.in/notices'],
	allowedHosts: ['ssc.gov.in'],
	examIds: ['ssc-cgl'],
	linkHint: '',
	enrichPdfs: false
};

const TODAY = '2026-09-26';

function fakeStore({ keys = [], titles = [], suggestions = [] } = {}) {
	const state = {
		upserts: [],
		quarantines: [],
		savedSuggestions: [],
		pending: suggestions,
		addedIds: []
	};
	return {
		state,
		async lookupSource() {
			return { keys, titles };
		},
		async upsertNotification(item) {
			state.upserts.push(item);
			return { inserted: !keys.includes(item.dedupeKey) };
		},
		async quarantineNotification(record) {
			state.quarantines.push(record);
		},
		async saveSuggestion(suggestion) {
			state.savedSuggestions.push(suggestion);
		},
		async readPendingSuggestions() {
			return state.pending;
		},
		async markSuggestionsAdded(ids) {
			state.addedIds.push(...ids);
		}
	};
}

function rawItem(overrides = {}) {
	return {
		title: 'Combined Graduate Level Examination 2026 – Notice',
		notificationUrl: 'https://ssc.gov.in/notice/1.pdf',
		applyUrl: null,
		publishedAt: '2026-09-20',
		applyStart: null,
		applyEnd: '2026-10-20',
		examDate: null,
		vacancies: 12256,
		qualification: 'Graduate',
		category: null,
		state: null,
		examId: 'ssc-cgl',
		confidence: 0.9,
		...overrides
	};
}

function baseRun(overrides = {}) {
	return {
		sources: [SOURCE],
		fetchSourceText: async () => 'listing page text',
		extractItems: async () => [rawItem()],
		checkLink: async () => true,
		store: fakeStore(),
		todayIso: TODAY,
		...overrides
	};
}

describe('buildExtractionPrompt', () => {
	it('carries source context, today, exam options and link hints', () => {
		const prompt = buildExtractionPrompt({
			source: { ...SOURCE, linkHint: 'Attachments are relative to /api/attachment/.' },
			pageText: 'PAGE BODY',
			todayIso: TODAY,
			examOptions: [{ id: 'ssc-cgl', name: 'SSC CGL' }]
		});
		expect(prompt).toContain('Staff Selection Commission');
		expect(prompt).toContain(TODAY);
		expect(prompt).toContain('ssc-cgl (SSC CGL)');
		expect(prompt).toContain('Attachments are relative to /api/attachment/.');
		expect(prompt).toContain('PAGE BODY');
		// The model must be told to prefer null over invention and to stay in scope.
		expect(prompt).toMatch(/never invent/i);
		expect(prompt).toMatch(/admit card|results/i);
	});
});

describe('buildDiscoveryPrompt', () => {
	it('asks only for official portals and lists already-known hosts', () => {
		const prompt = buildDiscoveryPrompt({
			knownHosts: ['ssc.gov.in', 'upsc.gov.in'],
			todayIso: TODAY
		});
		expect(prompt).toContain('ssc.gov.in');
		expect(prompt).toMatch(/official/i);
		expect(prompt).toMatch(/aggregator|third-party/i);
	});
});

describe('normalizeExtractedItems', () => {
	it('returns an empty list for junk shapes instead of throwing', () => {
		expect(normalizeExtractedItems(null, SOURCE, TODAY)).toEqual([]);
		expect(normalizeExtractedItems('nope', SOURCE, TODAY)).toEqual([]);
		expect(normalizeExtractedItems([null, 7, 'x'], SOURCE, TODAY)).toEqual([]);
	});

	it('sanitizes fields, applies source fallbacks and records date problems', () => {
		const [item] = normalizeExtractedItems(
			[
				rawItem({
					title: '<b>CGL</b> 2026 Notice',
					applyEnd: 'October 2026',
					notificationUrl: 'https://ssc.gov.in/n?id=1&utm_source=x',
					category: 'nonsense',
					state: '  Bihar ',
					examId: 'invented-exam',
					vacancies: '12256',
					confidence: 1.4
				})
			],
			SOURCE,
			TODAY
		);
		expect(item.title).toBe('CGL 2026 Notice');
		expect(item.applyEnd).toBe(null);
		expect(item.dateProblems).toContain('apply_end_format');
		expect(item.notificationUrl).toBe('https://ssc.gov.in/n?id=1');
		expect(item.category).toBe('ssc-central');
		expect(item.state).toBe('Bihar');
		expect(item.examId).toBe(null);
		expect(item.vacancies).toBe(12256);
		expect(item.confidence).toBe(1);
		expect(item.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
	});

	it('drops items without a usable title', () => {
		expect(normalizeExtractedItems([rawItem({ title: '   ' })], SOURCE, TODAY)).toEqual([]);
	});
});

describe('classifyExtractedItem', () => {
	const item = normalizeExtractedItems([rawItem()], SOURCE, TODAY)[0];
	const blank = { knownKeys: [], recentTitles: [], seenKeys: new Set(), allowedHosts: SOURCE.allowedHosts };

	it('publishes a validated new item', () => {
		expect(classifyExtractedItem(item, blank)).toEqual({
			action: 'publish',
			reason: null
		});
	});

	it('drops lifecycle and duplicate-in-batch items', () => {
		const result = normalizeExtractedItems([rawItem({ title: 'Final Result declared' })], SOURCE, TODAY)[0];
		expect(classifyExtractedItem(result, blank)).toEqual({
			action: 'drop',
			reason: 'out_of_scope'
		});
		expect(
			classifyExtractedItem(item, { ...blank, seenKeys: new Set([item.dedupeKey]) })
		).toEqual({ action: 'drop', reason: 'duplicate_in_batch' });
	});

	it('quarantines foreign, missing and low-confidence links', () => {
		const foreign = normalizeExtractedItems(
			[rawItem({ notificationUrl: 'https://ssc.gov.in.evil.com/x' })],
			SOURCE,
			TODAY
		)[0];
		expect(classifyExtractedItem(foreign, blank)).toEqual({
			action: 'quarantine',
			reason: 'link_not_allowed'
		});

		const missing = normalizeExtractedItems([rawItem({ notificationUrl: null })], SOURCE, TODAY)[0];
		expect(classifyExtractedItem(missing, blank)).toEqual({
			action: 'quarantine',
			reason: 'link_missing'
		});

		const unsure = normalizeExtractedItems([rawItem({ confidence: 0.2 })], SOURCE, TODAY)[0];
		expect(classifyExtractedItem(unsure, blank)).toEqual({
			action: 'quarantine',
			reason: 'low_confidence'
		});
	});

	it('quarantines near-duplicates of recent rows but updates exact keys', () => {
		const near = normalizeExtractedItems(
			[rawItem({ title: 'Combined Graduate Level Examination 2026 notice' })],
			SOURCE,
			TODAY
		)[0];
		expect(
			classifyExtractedItem(near, {
				...blank,
				recentTitles: ['Combined Graduate Level Examination 2026 – Notice']
			})
		).toEqual({ action: 'quarantine', reason: 'possible_duplicate' });

		expect(
			classifyExtractedItem(item, { ...blank, knownKeys: [item.dedupeKey] })
		).toEqual({ action: 'publish', reason: null });
	});
});

describe('runExamSync', () => {
	it('publishes validated items and counts inserts vs updates', async () => {
		const store = fakeStore();
		const report = await runExamSync(
			baseRun({
				store,
				extractItems: async () => [rawItem(), rawItem({ title: 'SSC CHSL 2026 Notice' })]
			})
		);
		expect(report.status).toBe('ok');
		expect(report.totals.itemsNew).toBe(2);
		expect(store.state.upserts).toHaveLength(2);
		expect(store.state.upserts[0].org).toBe(SOURCE.org);
		expect(store.state.quarantines).toHaveLength(0);
	});

	it('skips the reachability check for rows that already exist', async () => {
		const existing = normalizeExtractedItems([rawItem()], SOURCE, TODAY)[0];
		let checks = 0;
		const store = fakeStore({ keys: [existing.dedupeKey] });
		const report = await runExamSync(
			baseRun({
				store,
				checkLink: async () => {
					checks += 1;
					return false;
				}
			})
		);
		expect(checks).toBe(0);
		expect(report.totals.itemsUpdated).toBe(1);
		expect(store.state.quarantines).toHaveLength(0);
	});

	it('quarantines new items whose official link is unreachable', async () => {
		const store = fakeStore();
		const report = await runExamSync(baseRun({ store, checkLink: async () => false }));
		expect(report.totals.itemsNew).toBe(0);
		expect(report.totals.itemsQuarantined).toBe(1);
		expect(store.state.quarantines[0]).toMatchObject({ reason: 'link_unreachable' });
		expect(report.sources[0].quarantinedItems[0]).toMatchObject({
			reason: 'link_unreachable'
		});
	});

	it('keeps healthy sources running when one source fails', async () => {
		const failing = { ...SOURCE, id: 'upsc', org: 'UPSC' };
		const report = await runExamSync(
			baseRun({
				sources: [failing, SOURCE],
				fetchSourceText: async (source) => {
					if (source.id === 'upsc') {
						throw new Error('403 blocked');
					}
					return 'ok';
				}
			})
		);
		expect(report.status).toBe('partial');
		expect(report.sources[0]).toMatchObject({ id: 'upsc', status: 'failed' });
		expect(report.sources[0].error).toContain('403');
		expect(report.sources[1]).toMatchObject({ id: 'ssc', status: 'ok' });
		expect(report.totals.sourcesFailed).toBe(1);
		expect(report.totals.itemsNew).toBe(1);
	});

	it('reports a total outage as failed with zero published', async () => {
		const report = await runExamSync(
			baseRun({
				fetchSourceText: async () => {
					throw new Error('network down');
				}
			})
		);
		expect(report.status).toBe('failed');
		expect(report.totals.itemsNew).toBe(0);
	});

	it('degrades bad dates to null and records the problems', async () => {
		const store = fakeStore();
		const report = await runExamSync(
			baseRun({
				store,
				extractItems: async () => [rawItem({ applyEnd: '31/10/2026' })]
			})
		);
		expect(store.state.upserts[0].applyEnd).toBe(null);
		expect(report.sources[0].dateProblems).toContain('apply_end_format');
	});

	it('never exceeds the per-source link check cap', async () => {
		let checks = 0;
		const items = Array.from({ length: 10 }, (_, index) =>
			rawItem({ title: `Notice number ${index}`, notificationUrl: `https://ssc.gov.in/n/${index}` })
		);
		await runExamSync(
			baseRun({
				extractItems: async () => items,
				maxLinkChecksPerSource: 3,
				checkLink: async () => {
					checks += 1;
					return true;
				}
			})
		);
		expect(checks).toBe(3);
	});
});

describe('withRetries', () => {
	const noSleep = async () => {};

	it('retries transient failures and returns the eventual result', async () => {
		let calls = 0;
		const result = await withRetries(
			async () => {
				calls += 1;
				if (calls < 3) {
					throw new Error('503 UNAVAILABLE high demand');
				}
				return 'ok';
			},
			{ attempts: 3, sleep: noSleep }
		);
		expect(result).toBe('ok');
		expect(calls).toBe(3);
	});

	it('does not retry non-transient errors', async () => {
		let calls = 0;
		await expect(
			withRetries(
				async () => {
					calls += 1;
					throw new Error('extraction schema mismatch');
				},
				{ attempts: 3, sleep: noSleep }
			)
		).rejects.toThrow('schema mismatch');
		expect(calls).toBe(1);
	});

	it('gives up after the attempt budget', async () => {
		let calls = 0;
		await expect(
			withRetries(
				async () => {
					calls += 1;
					throw new Error('429 rate limit');
				},
				{ attempts: 2, sleep: noSleep }
			)
		).rejects.toThrow('rate limit');
		expect(calls).toBe(2);
	});

	it('hands the error to the sleep callback so callers can pace by failure kind', async () => {
		const waits = [];
		await expect(
			withRetries(
				async () => {
					throw new Error('429 rate limit');
				},
				{
					attempts: 2,
					baseDelayMs: 100,
					sleep: async (info) => {
						waits.push(info);
					}
				}
			)
		).rejects.toThrow('rate limit');
		expect(waits).toHaveLength(1);
		expect(waits[0].delayMs).toBe(100);
		expect(waits[0].error.message).toContain('429');
	});
});

describe('runSourceDiscovery', () => {
	it('keeps only new, reachable official portals and reconciles added ones', async () => {
		const store = fakeStore({ suggestions: [{ id: 9, candidate_url: 'https://ssc.gov.in/notices' }] });
		const report = await runSourceDiscovery({
			suggest: async () => [
				{ org: 'New PSC', url: 'https://newpsc.gov.in/notices', category: 'state-govt', reason: 'grounded' },
				{ org: 'Aggregator', url: 'https://freejobalert.com/xyz', category: null, reason: 'x' },
				{ org: 'Known', url: 'https://ssc.gov.in/notices', category: null, reason: 'x' },
				{ org: 'Duplicate host', url: 'https://newpsc.gov.in/other', category: null, reason: 'x' },
				{ org: 'Dead', url: 'https://mr.gov.in/dead', category: null, reason: 'x' }
			],
			checkLink: async (url) => url !== 'https://mr.gov.in/dead',
			store,
			knownHosts: ['ssc.gov.in']
		});
		expect(store.state.savedSuggestions.map((suggestion) => suggestion.url)).toEqual([
			'https://newpsc.gov.in/notices'
		]);
		expect(store.state.addedIds).toEqual([9]);
		expect(report).toMatchObject({ requested: 5, saved: 1, skipped: 4 });
	});
});
