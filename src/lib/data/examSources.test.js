import { describe, expect, it } from 'vitest';
import {
	EXAM_SOURCES,
	examSourceIds,
	getExamSource
} from './examSources';
import {
	isUrlOnAllowedHosts,
	KNOWN_CATEGORY_IDS,
	KNOWN_EXAM_IDS
} from '../shared/examNotifications';

// The registry is data the pipeline trusts. A typo here means either a source
// that never fetches, or extracted links for an exam that has no practice
// page. These checks pin every cross-reference.

describe('EXAM_SOURCES registry integrity', () => {
	it('has unique, kebab-case ids', () => {
		const ids = examSourceIds();
		expect(ids.length).toBeGreaterThanOrEqual(6);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(id).toMatch(/^[a-z0-9-]+$/);
		}
	});

	it('gives every source an org, at least one https listing URL and allowed hosts', () => {
		for (const source of EXAM_SOURCES) {
			expect(source.org.trim().length).toBeGreaterThan(0);
			expect(source.listingUrls.length).toBeGreaterThan(0);
			expect(source.allowedHosts.length).toBeGreaterThan(0);
			for (const url of source.listingUrls) {
				expect(url.startsWith('https://')).toBe(true);
			}
			for (const host of source.allowedHosts) {
				expect(host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
			}
		}
	});

	it('keeps every listing URL on one of the source’s own allowed hosts', () => {
		for (const source of EXAM_SOURCES) {
			for (const url of source.listingUrls) {
				expect(isUrlOnAllowedHosts(url, source.allowedHosts)).toBe(true);
			}
		}
	});

	it('only references exams and categories the practice registry knows', () => {
		for (const source of EXAM_SOURCES) {
			expect(new Set(source.examIds).size).toBe(source.examIds.length);
			for (const examId of source.examIds) {
				expect(KNOWN_EXAM_IDS.has(examId)).toBe(true);
			}
			expect(source.category === null || KNOWN_CATEGORY_IDS.has(source.category)).toBe(true);
			expect(source.state === null || typeof source.state === 'string').toBe(true);
			expect(typeof source.linkHint).toBe('string');
			expect(typeof source.enrichPdfs).toBe('boolean');
		}
	});

	it('looks sources up by id and returns null for strangers', () => {
		expect(getExamSource('ssc')?.org).toContain('Staff Selection');
		expect(getExamSource('made-up')).toBe(null);
	});
});
