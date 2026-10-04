import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearAllHistory,
	clearDraftFlags,
	getCurrentPaper,
	getDraftFlagsKey,
	getHiddenHistoryIds,
	getHistory,
	readDraftFlags,
	removeFromHistory,
	saveCurrentPaper,
	saveHistory,
	writeDraftFlags,
} from './storage.js';

const FLAG_KEY_PREFIX = 'selftest_unsubmitted_test_flags_';

function installBrowserGlobals() {
	const store = new Map();
	vi.stubGlobal('window', {
		localStorage: {
			getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
			setItem: vi.fn((key, value) => store.set(key, String(value))),
			removeItem: vi.fn((key) => store.delete(key)),
		},
		addEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	});
}

function removeBrowserGlobals() {
	vi.unstubAllGlobals();
}

beforeEach(() => {
	installBrowserGlobals();
});

afterEach(() => {
	removeBrowserGlobals();
});

describe('storage (draft flags)', () => {
	it('builds a per-test flag key', () => {
		expect(getDraftFlagsKey(42)).toBe(`${FLAG_KEY_PREFIX}42`);
	});

	it('returns an empty list when nothing is stored', () => {
		expect(readDraftFlags(42)).toEqual([]);
	});

	it('round-trips flagged indices', () => {
		writeDraftFlags(42, [0, 3, 7]);
		expect(readDraftFlags(42)).toEqual([0, 3, 7]);
	});

	it('keeps flag keys independent per test id', () => {
		writeDraftFlags(42, [0]);
		expect(readDraftFlags(7)).toEqual([]);
	});

	it('falls back to an empty list for malformed stored data', () => {
		window.localStorage.setItem(getDraftFlagsKey(42), '{"not":"an array"}');
		expect(readDraftFlags(42)).toEqual([]);
	});

	it('clears stored flags', () => {
		writeDraftFlags(42, [1, 2]);
		clearDraftFlags(42);
		expect(readDraftFlags(42)).toEqual([]);
	});
});

// "Clear all test history" used to call saveHistory([]) and nothing else. The
// server still holds those attempts, and hydrateHistoryFromServer re-imports every
// attempt that is not in HIDDEN_HISTORY — so the cleared rows came straight back
// on the next load, and the user had been told a deletion had happened. Clearing
// must therefore tombstone every id it drops, exactly as removeFromHistory does
// for one row.
describe('clearAllHistory', () => {
	const paper = (id) => ({ id, topic: 'Physics', score: 3, totalQuestions: 5 });

	beforeEach(() => {
		installBrowserGlobals();
	});

	afterEach(() => {
		removeBrowserGlobals();
	});

	it('empties the visible history', () => {
		saveHistory([paper(1), paper(2)]);
		clearAllHistory();
		expect(getHistory()).toEqual([]);
	});

	it('tombstones every cleared id so the server rows stay hidden', () => {
		saveHistory([paper(1), paper(2), paper(3)]);
		clearAllHistory();
		expect(getHiddenHistoryIds().sort()).toEqual(['1', '2', '3']);
	});

	it('coerces non-string and missing ids to a stable key', () => {
		saveHistory([{ id: 7 }, { topic: 'no id' }, { id: 7 }]);
		clearAllHistory();
		// Without a key an entry cannot be tombstoned by id, so it falls back to
		// its index and is still hidden rather than silently reappearing.
		expect(getHiddenHistoryIds().length).toBeGreaterThan(0);
	});

	it('keeps prior tombstones and does not duplicate keys', () => {
		saveHistory([paper(1)]);
		removeFromHistory(1);
		saveHistory([paper(2)]);
		clearAllHistory();
		const hidden = getHiddenHistoryIds();
		expect(hidden.sort()).toEqual(['1', '2']);
	});

	it('is safe on an already-empty history', () => {
		clearAllHistory();
		expect(getHistory()).toEqual([]);
		expect(getHiddenHistoryIds()).toEqual([]);
	});

	it('also drops the stored current paper', () => {
		saveHistory([paper(1)]);
		saveCurrentPaper({ id: 1, topic: 'Physics', questions: [] });
		clearAllHistory();
		expect(getCurrentPaper()).toBeNull();
	});
});
