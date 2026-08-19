import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraftFlags, getDraftFlagsKey, readDraftFlags, writeDraftFlags } from './storage.js';

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
