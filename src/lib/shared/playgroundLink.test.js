import { describe, expect, it } from 'vitest';
import {
	PLAYGROUND_ANSWER_MAX_LENGTH,
	PLAYGROUND_QUESTION_MAX_LENGTH,
	buildPlaygroundHref,
} from './playgroundLink';

describe('buildPlaygroundHref', () => {
	it('builds the english path with the topic only', () => {
		expect(buildPlaygroundHref({ topic: 'Ohm law' })).toBe('/playground?topic=Ohm+law');
	});

	it('builds the hindi twin path', () => {
		expect(buildPlaygroundHref({ topic: 'ओम का नियम', language: 'hindi' })).toBe(
			'/hi/playground?topic=%E0%A4%93%E0%A4%AE+%E0%A4%95%E0%A4%BE+%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE'
		);
	});

	it('round-trips Devanagari, emoji and ampersands through decodeURIComponent', () => {
		const topic = 'न्यूटन का तीसरा नियम 🚀 & more';
		const href = buildPlaygroundHref({ topic, question: 'Q & A?', answer: 'a=b' });
		const params = new URLSearchParams(href.slice(href.indexOf('?')));
		expect(params.get('topic')).toBe(topic);
		expect(params.get('question')).toBe('Q & A?');
		expect(params.get('answer')).toBe('a=b');
	});

	it('omits empty and undefined context fields', () => {
		expect(buildPlaygroundHref({ topic: 'X', question: undefined, answer: '' })).toBe(
			'/playground?topic=X'
		);
		expect(buildPlaygroundHref({ topic: 'X', question: '', answer: null })).toBe(
			'/playground?topic=X'
		);
	});

	it('returns the bare path when nothing is provided', () => {
		expect(buildPlaygroundHref({})).toBe('/playground');
		expect(buildPlaygroundHref({ topic: '', question: '', answer: '' })).toBe('/playground');
	});

	it('truncates the question to 400 characters and the answer to 200', () => {
		const question = 'q'.repeat(500);
		const answer = 'a'.repeat(300);
		const href = buildPlaygroundHref({ topic: 'X', question, answer });
		const params = new URLSearchParams(href.slice(href.indexOf('?')));
		expect(params.get('question')).toHaveLength(PLAYGROUND_QUESTION_MAX_LENGTH);
		expect(params.get('answer')).toHaveLength(PLAYGROUND_ANSWER_MAX_LENGTH);
	});

	it('keeps a question at exactly the boundary intact', () => {
		const question = 'q'.repeat(PLAYGROUND_QUESTION_MAX_LENGTH);
		const href = buildPlaygroundHref({ topic: 'X', question });
		const params = new URLSearchParams(href.slice(href.indexOf('?')));
		expect(params.get('question')).toBe(question);
	});
});
