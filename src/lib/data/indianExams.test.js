import { describe, expect, it } from 'vitest';
import {
	OBJECTIVE_ONLY_EXAMS,
	STREAM_HI,
	SYLLABUS_HI,
	localizedStream,
	localizedSyllabus,
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
