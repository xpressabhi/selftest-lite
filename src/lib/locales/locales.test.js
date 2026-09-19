import { describe, expect, it } from 'vitest';
import english from '../locales/english.json';
import hindi from '../locales/hindi.json';
import { BLOG_CATEGORIES, BLOG_POSTS } from '../data/blogPosts.js';
import { FAQ_SECTIONS } from '../data/faqs.js';

describe('locales', () => {
	it('defines the same keys in English and Hindi', () => {
		const enKeys = Object.keys(english).sort();
		const hiKeys = Object.keys(hindi).sort();
		expect(hiKeys.filter((key) => !(key in english))).toEqual([]);
		expect(enKeys.filter((key) => !(key in hindi))).toEqual([]);
	});

	it('never ships an empty translation', () => {
		const empty = Object.entries(english)
			.filter(([, value]) => typeof value !== 'string' || value.trim() === '')
			.map(([key]) => key);
		expect(empty).toEqual([]);
		const emptyHindi = Object.entries(hindi)
			.filter(([, value]) => typeof value !== 'string' || value.trim() === '')
			.map(([key]) => key);
		expect(emptyHindi).toEqual([]);
	});

	it('has both translations for every blog key', () => {
		const keys = new Set(BLOG_CATEGORIES.map((category) => category.labelKey));
		for (const post of BLOG_POSTS) {
			keys.add(post.titleKey);
			keys.add(post.excerptKey);
			keys.add(post.readTimeKey);
			post.pointKeys.forEach((key) => keys.add(key));
		}
		const missing = [...keys].filter((key) => !(key in english) || !(key in hindi));
		expect(missing).toEqual([]);
	});

	it('has both translations for every FAQ key', () => {
		const keys = new Set();
		for (const section of FAQ_SECTIONS) {
			keys.add(section.titleKey);
			for (const item of section.items) {
				keys.add(item.questionKey);
				item.answerKeys.forEach((key) => keys.add(key));
			}
		}
		const missing = [...keys].filter((key) => !(key in english) || !(key in hindi));
		expect(missing).toEqual([]);
	});
});
