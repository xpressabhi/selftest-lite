import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	deriveNotificationStatus,
	dedupeKeyFor,
	isExcludedScopeTitle,
	isOfficialHost,
	isUrlOnAllowedHosts,
	meetsConfidence,
	MIN_EXTRACTION_CONFIDENCE,
	NEAR_DUPLICATE_THRESHOLD,
	parseIsoDate,
	sanitizeCategory,
	sanitizeExamId,
	sanitizeExtractedTitle,
	sanitizeState,
	stripTrackingParams,
	titleKey,
	todayInIst,
	tokenSetSimilarity,
	validateNotificationDates
} from './examNotifications';

// Failure modes this module must refuse:
// - titles that are empty, HTML-laden, or absurdly long
// - dedupe keys that collide across sources or drift with casing/punctuation
// - lifecycle notices (results, admit cards, answer keys) sneaking into scope
// - tracking parameters, javascript:, credential-bearing and off-host URLs
// - impossible or fabricated dates (formats, ordering, ranges)
// - status flapping at the IST day boundary
// - exam ids or categories the practice registry does not know

describe('sanitizeExtractedTitle', () => {
	it('returns null for empty, whitespace and tag-only titles', () => {
		for (const value of [null, undefined, '', '   ', '<br>', '<span></span>']) {
			expect(sanitizeExtractedTitle(value)).toBe(null);
		}
	});

	it('strips tags, decodes entities and collapses whitespace', () => {
		expect(sanitizeExtractedTitle('<b>CGL</b>&nbsp;2026 &amp; CHSL</a>')).toBe('CGL 2026 & CHSL');
		expect(sanitizeExtractedTitle('  Recruitment\n\tof   Scientists  ')).toBe(
			'Recruitment of Scientists'
		);
	});

	it('caps runaway titles at 240 characters', () => {
		const title = sanitizeExtractedTitle('x'.repeat(500));
		expect(title).toHaveLength(240);
	});
});

describe('titleKey and dedupeKeyFor', () => {
	it('is stable across casing, punctuation and repeated whitespace', () => {
		expect(titleKey('CGL 2026 — Notice No. 05/2026')).toBe('cgl 2026 notice no 05 2026');
		expect(titleKey('cgl   2026 notice no 05/2026')).toBe(titleKey('CGL 2026 — Notice No. 05/2026'));
	});

	it('keeps distinct titles distinct', () => {
		expect(titleKey('CGL 2026')).not.toBe(titleKey('CGL 2025'));
	});

	it('builds a sha256 key scoped by source and returns null without a title', () => {
		const expected = createHash('sha256').update(`ssc|${titleKey('CGL 2026 Notice')}`).digest('hex');
		expect(dedupeKeyFor('ssc', 'CGL 2026 Notice')).toBe(expected);
		expect(dedupeKeyFor('upsc', 'CGL 2026 Notice')).not.toBe(dedupeKeyFor('ssc', 'CGL 2026 Notice'));
		expect(dedupeKeyFor('ssc', '   ')).toBe(null);
		expect(dedupeKeyFor('', 'CGL 2026')).toBe(null);
	});
});

describe('tokenSetSimilarity', () => {
	it('scores identical keys 1 and unrelated keys 0', () => {
		expect(tokenSetSimilarity('CGL 2026 notice', 'CGL 2026 notice')).toBe(1);
		expect(tokenSetSimilarity('CGL 2026 notice', 'RRB NTPC 2025')).toBe(0);
	});

	it('flags near-duplicates above the threshold', () => {
		const similarity = tokenSetSimilarity(
			'Combined Graduate Level Examination 2026 notice',
			'Combined Graduate Level Examination 2026 – notice'
		);
		expect(similarity).toBeGreaterThanOrEqual(NEAR_DUPLICATE_THRESHOLD);
	});

	it('returns 0 for empty input instead of NaN', () => {
		expect(tokenSetSimilarity('', 'CGL')).toBe(0);
		expect(tokenSetSimilarity('CGL', '')).toBe(0);
	});
});

describe('isExcludedScopeTitle', () => {
	it('drops lifecycle notices that are not recruitment notifications', () => {
		for (const title of [
			'Written Result of CGL 2025',
			'Final Result declared',
			'Admit Card for CHSL 2026',
			'Answer Key released',
			'Cut-off marks for MTS',
			'Merit List of selected candidates',
			'Score Card download'
		]) {
			expect(isExcludedScopeTitle(title)).toBe(true);
		}
	});

	it('keeps recruitment notices, corrigenda and extensions', () => {
		for (const title of [
			'Combined Graduate Level Examination 2026 – Notice',
			'Corrigendum to CGL 2026 notice',
			'Recruitment of Scientist-B',
			'Extension of last date for applications',
			'ADDENDUM: revised vacancies'
		]) {
			expect(isExcludedScopeTitle(title)).toBe(false);
		}
	});
});

describe('stripTrackingParams', () => {
	it('removes tracking params and keeps meaningful ones', () => {
		const stripped = stripTrackingParams(
			'https://ssc.gov.in/notice?id=42&utm_source=x&utm_campaign=y&fbclid=z'
		);
		expect(stripped).toBe('https://ssc.gov.in/notice?id=42');
	});

	it('returns null for junk, non-http(s) and credential URLs', () => {
		for (const value of [
			'not a url',
			'javascript:alert(1)',
			'ftp://ssc.gov.in/file',
			'https://user:pass@ssc.gov.in/x',
			null
		]) {
			expect(stripTrackingParams(value)).toBe(null);
		}
	});
});

describe('isUrlOnAllowedHosts', () => {
	it('accepts the host itself and its subdomains', () => {
		expect(isUrlOnAllowedHosts('https://ssc.gov.in/notice.pdf', ['ssc.gov.in'])).toBe(true);
		expect(isUrlOnAllowedHosts('https://www.ssc.gov.in/notice', ['ssc.gov.in'])).toBe(true);
	});

	it('rejects lookalike hosts, other schemes and empty lists', () => {
		expect(isUrlOnAllowedHosts('https://ssc.gov.in.evil.com/x', ['ssc.gov.in'])).toBe(false);
		expect(isUrlOnAllowedHosts('https://evilssc.gov.in/x', ['ssc.gov.in'])).toBe(false);
		expect(isUrlOnAllowedHosts('http://ssc.gov.in/x', [])).toBe(false);
		expect(isUrlOnAllowedHosts('javascript:alert(1)', ['ssc.gov.in'])).toBe(false);
	});
});

describe('isOfficialHost', () => {
	it('accepts government domains and their subdomains', () => {
		expect(isOfficialHost('upsc.gov.in')).toBe(true);
		expect(isOfficialHost('www.ncs.gov.in')).toBe(true);
		expect(isOfficialHost('ssc.nic.in')).toBe(true);
	});

	it('rejects aggregators, lookalikes and empty values', () => {
		expect(isOfficialHost('gov.in.evil.com')).toBe(false);
		expect(isOfficialHost('freejobalert.com')).toBe(false);
		expect(isOfficialHost('')).toBe(false);
	});
});

describe('parseIsoDate and todayInIst', () => {
	it('accepts exactly YYYY-MM-DD and rejects everything else', () => {
		expect(parseIsoDate('2026-09-26')).toBe('2026-09-26');
		for (const value of ['26-09-2026', '2026-9-6', '2026-13-01', '2026-02-30', '', null, 20260926]) {
			expect(parseIsoDate(value)).toBe(null);
		}
	});

	it('rolls the date over at IST midnight, not UTC midnight', () => {
		// 2026-09-26T19:00Z is already 2026-09-27 00:30 IST.
		expect(todayInIst(new Date('2026-09-26T19:00:00Z'))).toBe('2026-09-27');
		expect(todayInIst(new Date('2026-09-26T17:00:00Z'))).toBe('2026-09-26');
	});
});

describe('validateNotificationDates', () => {
	const today = '2026-09-26';

	it('nulls malformed dates with a problem per field', () => {
		const result = validateNotificationDates(
			{ publishedAt: 'June 2026', applyStart: null, applyEnd: null, examDate: null },
			today
		);
		expect(result.publishedAt).toBe(null);
		expect(result.problems).toContain('published_at_format');
	});

	it('rejects a published date far outside the plausible window', () => {
		const result = validateNotificationDates(
			{ publishedAt: '2019-01-01', applyStart: null, applyEnd: null, examDate: null },
			today
		);
		expect(result.publishedAt).toBe(null);
		expect(result.problems).toContain('published_at_range');
	});

	it('nulls an apply window that runs backwards', () => {
		const result = validateNotificationDates(
			{
				publishedAt: '2026-09-01',
				applyStart: '2026-10-01',
				applyEnd: '2026-09-20',
				examDate: null
			},
			today
		);
		expect(result.applyStart).toBe(null);
		expect(result.problems).toContain('apply_window_order');
	});

	it('nulls an exam date that predates the notification by more than a month', () => {
		const result = validateNotificationDates(
			{ publishedAt: '2026-09-01', applyStart: null, applyEnd: null, examDate: '2025-01-01' },
			today
		);
		expect(result.examDate).toBe(null);
		expect(result.problems).toContain('exam_date_order');
	});

	it('nulls dates absurdly far in the future', () => {
		const result = validateNotificationDates(
			{ publishedAt: null, applyStart: null, applyEnd: '2031-01-01', examDate: '2032-01-01' },
			today
		);
		expect(result.applyEnd).toBe(null);
		expect(result.examDate).toBe(null);
		expect(result.problems).toContain('apply_end_range');
		expect(result.problems).toContain('exam_date_range');
	});

	it('keeps a sane, fully-populated window intact', () => {
		const result = validateNotificationDates(
			{
				publishedAt: '2026-09-01',
				applyStart: '2026-09-05',
				applyEnd: '2026-10-05',
				examDate: '2026-12-01'
			},
			today
		);
		expect(result).toEqual({
			publishedAt: '2026-09-01',
			applyStart: '2026-09-05',
			applyEnd: '2026-10-05',
			examDate: '2026-12-01',
			problems: []
		});
	});
});

describe('deriveNotificationStatus', () => {
	const today = '2026-09-26';

	it('is open until the last date, closing soon within the window, closed after', () => {
		expect(deriveNotificationStatus({ applyEnd: '2026-10-30' }, today)).toBe('open');
		expect(deriveNotificationStatus({ applyEnd: '2026-09-26' }, today)).toBe('closing_soon');
		// Exactly CLOSING_SOON_DAYS ahead is still closing soon; one more day is open.
		expect(deriveNotificationStatus({ applyEnd: '2026-10-03' }, today)).toBe('closing_soon');
		expect(deriveNotificationStatus({ applyEnd: '2026-10-04' }, today)).toBe('open');
		expect(deriveNotificationStatus({ applyEnd: '2026-09-25' }, today)).toBe('closed');
	});

	it('flips to closed on the IST day after the last date', () => {
		expect(deriveNotificationStatus({ applyEnd: today }, today)).not.toBe('closed');
		expect(deriveNotificationStatus({ applyEnd: '2026-09-25' }, today)).toBe('closed');
	});

	it('uses the exam date when there is no application window', () => {
		expect(deriveNotificationStatus({ examDate: '2026-12-01' }, today)).toBe('upcoming');
		expect(deriveNotificationStatus({ examDate: '2026-08-01' }, today)).toBe('closed');
		expect(deriveNotificationStatus({}, today)).toBe('upcoming');
	});
});

describe('sanitizers', () => {
	it('only accepts exam ids and categories the practice registry knows', () => {
		const ids = new Set(['ssc-cgl']);
		expect(sanitizeExamId('ssc-cgl', ids)).toBe('ssc-cgl');
		expect(sanitizeExamId('made-up-exam', ids)).toBe(null);
		expect(sanitizeExamId(null, ids)).toBe(null);
		const categories = new Set(['ssc-central']);
		expect(sanitizeCategory('ssc-central', categories, 'ssc-central')).toBe('ssc-central');
		expect(sanitizeCategory('nonsense', categories, 'ssc-central')).toBe('ssc-central');
		expect(sanitizeCategory(null, categories, null)).toBe(null);
	});

	it('caps and cleans state names', () => {
		expect(sanitizeState('  Uttar   Pradesh ')).toBe('Uttar Pradesh');
		expect(sanitizeState('x'.repeat(100))).toHaveLength(60);
		expect(sanitizeState('   ')).toBe(null);
	});
});

describe('meetsConfidence', () => {
	it('passes absent confidence and values at or above the floor', () => {
		expect(meetsConfidence(null)).toBe(true);
		expect(meetsConfidence(undefined)).toBe(true);
		expect(meetsConfidence(MIN_EXTRACTION_CONFIDENCE)).toBe(true);
		expect(meetsConfidence(0.91)).toBe(true);
	});

	it('fails values below the floor and non-numbers', () => {
		expect(meetsConfidence(0.49)).toBe(false);
		expect(meetsConfidence('0.9')).toBe(false);
		expect(meetsConfidence(NaN)).toBe(false);
	});
});
