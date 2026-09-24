import { describe, expect, it } from 'vitest';
import {
	HUB_CATEGORIES,
	OBJECTIVE_ONLY_EXAMS,
	STREAM_HI,
	SYLLABUS_HI,
	buildExamHaystack,
	getHubCategory,
	groupExamsByCategory,
	localizedStream,
	localizedSyllabus,
	searchExams,
} from './indianExams.js';

const uniqueStreams = [...new Set(OBJECTIVE_ONLY_EXAMS.map((exam) => exam.stream))];
const uniqueUnits = [...new Set(OBJECTIVE_ONLY_EXAMS.flatMap((exam) => exam.syllabus || []))];

describe('Hindi exam overlay coverage', () => {
	it('translates every stream used by the registry', () => {
		for (const stream of uniqueStreams) {
			expect(STREAM_HI[stream], `missing Hindi stream for "${stream}"`).toBeTruthy();
		}
	});

	it('translates every syllabus unit used by the registry', () => {
		for (const unit of uniqueUnits) {
			expect(SYLLABUS_HI[unit], `missing Hindi unit for "${unit}"`).toBeTruthy();
		}
	});

	it('keeps Hindi strings actually different from English', () => {
		for (const [english, hindi] of Object.entries(SYLLABUS_HI)) {
			expect(hindi, `"${english}" was left untranslated`).not.toBe(english);
		}
	});
});

describe('localizedSyllabus', () => {
	it('returns the same array in English', () => {
		const syllabus = ['Physics', 'Chemistry'];
		expect(localizedSyllabus(syllabus, 'english')).toBe(syllabus);
	});

	it('maps units to Hindi', () => {
		expect(localizedSyllabus(['Physics', 'Chemistry'], 'hindi')).toEqual([
			'भौतिक विज्ञान',
			'रसायन विज्ञान',
		]);
	});

	it('falls back to the English unit for unknown strings', () => {
		expect(localizedSyllabus(['Astrophysics'], 'hindi')).toEqual(['Astrophysics']);
	});

	it('tolerates missing syllabus', () => {
		expect(localizedSyllabus(undefined, 'hindi')).toEqual([]);
	});
});

describe('localizedStream', () => {
	it('maps known streams and falls back otherwise', () => {
		expect(localizedStream('Banking', 'hindi')).toBe('बैंकिंग');
		expect(localizedStream('Unknown', 'hindi')).toBe('Unknown');
		expect(localizedStream('Banking', 'english')).toBe('Banking');
	});
});

describe('hub categories', () => {
	it('maps every registry stream to exactly one category', () => {
		for (const exam of OBJECTIVE_ONLY_EXAMS) {
			const matches = HUB_CATEGORIES.filter((category) => category.streams.includes(exam.stream));
			expect(matches, `stream "${exam.stream}" (${exam.id})`).toHaveLength(1);
		}
	});

	it('only names streams some exam actually uses', () => {
		const used = new Set(OBJECTIVE_ONLY_EXAMS.map((exam) => exam.stream));
		for (const category of HUB_CATEGORIES) {
			for (const stream of category.streams) {
				expect(used.has(stream), `unused stream "${stream}" in ${category.id}`).toBe(true);
			}
		}
	});

	it('gives every category a label key and Hindi-capable search terms', () => {
		for (const category of HUB_CATEGORIES) {
			expect(category.labelKey).toMatch(/^practiceCategory/);
			expect(category.searchTerms.length).toBeGreaterThan(0);
			expect(category.searchTerms.some((term) => /[\u0900-\u097F]/u.test(term))).toBe(true);
		}
	});

	it('partitions the registry: every exam once, none lost', () => {
		const grouped = groupExamsByCategory();
		const ids = grouped.flatMap((category) => category.exams.map((exam) => exam.id));
		expect(ids).toHaveLength(OBJECTIVE_ONLY_EXAMS.length);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('keeps registry order inside a category', () => {
		const ssc = groupExamsByCategory().find((category) => category.id === 'ssc-central');
		const expected = OBJECTIVE_ONLY_EXAMS.filter((exam) => ssc.exams.includes(exam)).map(
			(exam) => exam.id
		);
		expect(ssc.exams.map((exam) => exam.id)).toEqual(expected);
	});

	it('omits categories with no exams', () => {
		const grouped = groupExamsByCategory([OBJECTIVE_ONLY_EXAMS[0]]);
		expect(grouped).toHaveLength(1);
		expect(grouped[0].exams).toHaveLength(1);
	});

	it('finds the category for an exam by its stream, null otherwise', () => {
		expect(getHubCategory(OBJECTIVE_ONLY_EXAMS.find((exam) => exam.id === 'ssc-cgl'))?.id).toBe(
			'ssc-central'
		);
		expect(getHubCategory({ id: 'x', stream: 'Unknown stream' })).toBeNull();
		expect(getHubCategory(null)).toBeNull();
	});
});

describe('searchExams', () => {
	it('returns no results for an empty or whitespace query', () => {
		expect(searchExams('')).toEqual([]);
		expect(searchExams('   ')).toEqual([]);
		expect(searchExams(null)).toEqual([]);
	});

	it('matches names case-insensitively', () => {
		expect(searchExams('SSC CGL').map((exam) => exam.id)).toContain('ssc-cgl');
	});

	it('requires every token to match (AND)', () => {
		expect(searchExams('ssc cgl').map((exam) => exam.id)).toContain('ssc-cgl');
		expect(searchExams('ssc cgl zzz')).toEqual([]);
	});

	it('matches hyphenated ids through punctuation normalization', () => {
		expect(searchExams('rrb ntpc').map((exam) => exam.id)).toContain('rrb-ntpc-graduate');
		expect(searchExams('rrb-ntpc').map((exam) => exam.id)).toContain('rrb-ntpc-graduate');
	});

	it('matches English streams and Hindi stream names', () => {
		expect(searchExams('banking').map((exam) => exam.id)).toContain('ibps-po');
		expect(searchExams('बैंकिंग').map((exam) => exam.id)).toContain('ibps-po');
	});

	it('matches English and Hindi syllabus units', () => {
		expect(searchExams('gynecology').map((exam) => exam.id)).toContain('upsc-cms');
		expect(searchExams('स्त्री रोग').map((exam) => exam.id)).toContain('upsc-cms');
	});

	it('builds a lowercase haystack with English and Hindi keys', () => {
		const exam = OBJECTIVE_ONLY_EXAMS.find((item) => item.id === 'upsc-cms');
		const haystack = buildExamHaystack(exam);
		expect(haystack).toContain('gynecology');
		expect(haystack).toContain('स्त्री रोग');
		expect(haystack).toBe(haystack.toLowerCase());
	});
});
