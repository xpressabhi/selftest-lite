import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	INTERRUPT_COOLDOWN_MS,
	MAX_SEEN_KEYS,
	MOMENT_GLOBAL_COOLDOWN_MS,
	PUSH_COOLDOWN_MS,
	SHARE_COOLDOWN_MS,
	buildNudgeState,
	createSessionBudget,
	emptyLedger,
	interruptSuppression,
	isNotificationSeen,
	markNotificationSeen,
	momentSuppression,
	normalizeLedger,
	readNudgeLedger,
	registerInterrupt,
	registerMomentDismissed,
	registerMomentShown,
	registerShareUsed,
	unseenNotificationCount,
	writeNudgeLedger
} from './nudge.js';

// Failure list for the client nudge ledger (written before the module):
// garbage storage breaking nudges forever, cooldowns that do not hold per
// ask group, dismissals that never escalate, quiet hours that leak, a session
// that allows a second interrupt, and a seen list that grows unbounded.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Fixed local reference: 26 Sep 2026, 12:00 local time.
const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime();

function installBrowserGlobals() {
	const store = new Map();
	vi.stubGlobal('window', {
		localStorage: {
			getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
			setItem: vi.fn((key, value) => store.set(key, String(value))),
			removeItem: vi.fn((key) => store.delete(key))
		}
	});
}

beforeEach(() => {
	installBrowserGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ledger normalization and persistence', () => {
	it('returns an empty ledger for malformed or missing storage', () => {
		expect(normalizeLedger(null)).toEqual(emptyLedger());
		expect(normalizeLedger('junk')).toEqual(emptyLedger());
		expect(normalizeLedger([1, 2])).toEqual(emptyLedger());
		expect(readNudgeLedger()).toEqual(emptyLedger());
	});

	it('round-trips a written ledger', () => {
		const ledger = registerMomentShown({ kind: 'share_result', ledger: emptyLedger(), now: NOW });
		writeNudgeLedger(ledger);
		expect(readNudgeLedger()).toEqual(ledger);
	});

	it('ignores unknown fields and repairs invalid values', () => {
		window.localStorage.setItem(
			'selftest_nudge_ledger',
			JSON.stringify({
				lastMomentAt: 'later',
				lastShownAt: { share: NOW, push: 'nope', evil: NOW },
				dismissals: { share: -2, push: 1 },
				seen: 'not-a-list'
			})
		);
		const ledger = readNudgeLedger();
		expect(ledger.lastMomentAt).toBeNull();
		expect(ledger.lastShownAt.share).toBe(NOW);
		expect(ledger.lastShownAt.push).toBeNull();
		expect(ledger.lastShownAt.evil).toBeUndefined();
		expect(ledger.dismissals.share).toBe(0);
		expect(ledger.dismissals.push).toBe(1);
		expect(ledger.seen).toEqual([]);
	});
});

describe('momentSuppression', () => {
	it('allows a share ask on a fresh ledger', () => {
		expect(
			momentSuppression({ kind: 'share_result', ledger: emptyLedger(), now: NOW, session: createSessionBudget() })
		).toBeNull();
	});

	it('blocks a second moment in the same session', () => {
		const session = createSessionBudget();
		session.momentShown = true;
		expect(
			momentSuppression({ kind: 'share_result', ledger: emptyLedger(), now: NOW, session })
		).toBe('session');
	});

	it('holds the global 24h cooldown across ask groups', () => {
		const ledger = registerMomentShown({ kind: 'enable_reminders', ledger: emptyLedger(), now: NOW - HOUR });
		expect(momentSuppression({ kind: 'share_result', ledger, now: NOW, session: createSessionBudget() })).toBe(
			'cooldown'
		);
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger,
				now: NOW + MOMENT_GLOBAL_COOLDOWN_MS,
				session: createSessionBudget()
			})
		).toBeNull();
	});

	it('holds the 3d share cooldown and the 7d push cooldown separately', () => {
		const shareShown = registerMomentShown({
			kind: 'challenge_friend',
			ledger: emptyLedger(),
			now: NOW - 2 * DAY
		});
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger: shareShown,
				now: NOW,
				session: createSessionBudget()
			})
		).toBe('cooldown');
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger: shareShown,
				now: NOW + 2 * SHARE_COOLDOWN_MS,
				session: createSessionBudget()
			})
		).toBeNull();

		const pushShown = registerMomentShown({
			kind: 'enable_reminders',
			ledger: emptyLedger(),
			now: NOW - 6 * DAY
		});
		expect(
			momentSuppression({
				kind: 'enable_reminders',
				ledger: pushShown,
				now: NOW,
				session: createSessionBudget()
			})
		).toBe('cooldown');
		expect(
			momentSuppression({
				kind: 'enable_reminders',
				ledger: pushShown,
				now: NOW + 2 * PUSH_COOLDOWN_MS,
				session: createSessionBudget()
			})
		).toBeNull();
	});

	it('escalates the dismissal backoff from 14 to 30 to 90 days', () => {
		let ledger = registerMomentDismissed({ kind: 'share_result', ledger: emptyLedger(), now: NOW - 7 * DAY });
		expect(
			momentSuppression({ kind: 'share_result', ledger, now: NOW, session: createSessionBudget() })
		).toBe('backoff');
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger,
				now: NOW + 8 * DAY,
				session: createSessionBudget()
			})
		).toBeNull();

		ledger = registerMomentDismissed({ kind: 'share_result', ledger, now: NOW - 20 * DAY });
		expect(
			momentSuppression({ kind: 'share_result', ledger, now: NOW, session: createSessionBudget() })
		).toBe('backoff');
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger,
				now: NOW + 11 * DAY,
				session: createSessionBudget()
			})
		).toBeNull();

		ledger = registerMomentDismissed({ kind: 'share_result', ledger, now: NOW - 40 * DAY });
		expect(ledger.dismissals.share).toBe(3);
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger,
				now: NOW,
				session: createSessionBudget()
			})
		).toBe('backoff');
		expect(
			momentSuppression({
				kind: 'share_result',
				ledger,
				now: NOW + 51 * DAY,
				session: createSessionBudget()
			})
		).toBeNull();
	});
});

describe('interruptSuppression', () => {
	it('keeps quiet hours from 21:00 to 07:00', () => {
		for (const hourLocal of [21, 22, 23, 0, 3, 6]) {
			expect(
				interruptSuppression({ ledger: emptyLedger(), now: NOW, hourLocal, session: createSessionBudget() })
			).toBe('quiet-hours');
		}
		for (const hourLocal of [7, 12, 20]) {
			expect(
				interruptSuppression({ ledger: emptyLedger(), now: NOW, hourLocal, session: createSessionBudget() })
			).toBeNull();
		}
	});

	it('allows one interrupt per session and one per 24h', () => {
		const session = createSessionBudget();
		session.interruptShown = true;
		expect(
			interruptSuppression({ ledger: emptyLedger(), now: NOW, hourLocal: 12, session })
		).toBe('session');

		const ledger = registerInterrupt({ ledger: emptyLedger(), now: NOW - HOUR });
		expect(
			interruptSuppression({ ledger, now: NOW, hourLocal: 12, session: createSessionBudget() })
		).toBe('recent');
		expect(
			interruptSuppression({
				ledger,
				now: NOW + INTERRUPT_COOLDOWN_MS,
				hourLocal: 12,
				session: createSessionBudget()
			})
		).toBeNull();
	});
});

describe('buildNudgeState', () => {
	const ledger = emptyLedger();

	it('counts distinct practice days and the week window from history', () => {
		const history = [
			{ timestamp: NOW - HOUR },
			{ timestamp: new Date(2026, 8, 24, 10, 0, 0).getTime() },
			{ timestamp: new Date(2026, 8, 24, 16, 0, 0).getTime() },
			{ timestamp: new Date(2026, 8, 10, 16, 0, 0).getTime() }
		];
		const state = buildNudgeState({
			page: 'results',
			history,
			streak: { currentStreak: 4 },
			ledger,
			now: NOW,
			lastResult: { score: 8, totalQuestions: 10 },
			bestBeaten: true,
			reminderState: 'off',
			shareSheetOpenedThisResult: false,
			secondsOnPage: 9,
			interactionCount: 2,
			hourLocal: 19,
			isDataSaver: false,
			locale: 'en'
		});
		expect(state).toMatchObject({
			page: 'results',
			testsTotal: 4,
			distinctTestDays: 3,
			testsThisWeek: 3,
			currentStreak: 4,
			daysSinceLastTest: 0,
			lastScore: { pct: 80, total: 10 },
			bestBeaten: true,
			reminderState: 'off',
			shareSheetOpenedThisResult: false,
			locale: 'en'
		});
		expect(state.session).toEqual({
			secondsOnPage: 9,
			interactionCount: 2,
			hourLocal: 19,
			isDataSaver: false
		});
	});

	it('derives nudge history from the ledger', () => {
		let seenLedger = registerMomentShown({
			kind: 'share_result',
			ledger: emptyLedger(),
			now: NOW - 2 * DAY
		});
		seenLedger = registerMomentDismissed({ kind: 'share_result', ledger: seenLedger, now: NOW - DAY });
		seenLedger = registerShareUsed({ ledger: seenLedger, now: NOW - 3 * DAY });
		const state = buildNudgeState({
			page: 'home',
			history: [],
			streak: null,
			ledger: seenLedger,
			now: NOW,
			hourLocal: 12
		});
		expect(state.nudgeHistory).toEqual({ lastShareDaysAgo: 2, lastPushDaysAgo: null, dismissals: 1 });
		expect(state.shareUsed).toBe(true);
		expect(state.testsTotal).toBe(0);
		expect(state.distinctTestDays).toBe(0);
		expect(state.daysSinceLastTest).toBeNull();
		expect(state.lastScore).toBeNull();
	});

	it('ignores malformed history timestamps for day math but still counts tests', () => {
		const state = buildNudgeState({
			page: 'results',
			history: [{ timestamp: NOW }, { timestamp: 'nope' }, {}],
			ledger,
			now: NOW,
			hourLocal: 12
		});
		expect(state.testsTotal).toBe(3);
		expect(state.distinctTestDays).toBe(1);
		expect(state.testsThisWeek).toBe(1);
	});
});

describe('notification seen state', () => {
	it('tracks seen keys without duplicates', () => {
		let ledger = markNotificationSeen({ ledger: emptyLedger(), key: 'a:new' });
		ledger = markNotificationSeen({ ledger, key: 'a:new' });
		ledger = markNotificationSeen({ ledger, key: 'b:closing_soon' });
		expect(ledger.seen).toEqual(['a:new', 'b:closing_soon']);
		expect(isNotificationSeen({ ledger, key: 'a:new' })).toBe(true);
		expect(isNotificationSeen({ ledger, key: 'c:new' })).toBe(false);
	});

	it('caps the seen list by dropping the oldest keys', () => {
		let ledger = emptyLedger();
		for (let index = 0; index < MAX_SEEN_KEYS + 5; index += 1) {
			ledger = markNotificationSeen({ ledger, key: `item-${index}` });
		}
		expect(ledger.seen).toHaveLength(MAX_SEEN_KEYS);
		expect(isNotificationSeen({ ledger, key: 'item-0' })).toBe(false);
		expect(isNotificationSeen({ ledger, key: `item-${MAX_SEEN_KEYS + 4}` })).toBe(true);
	});

	it('counts only unseen keys among candidates', () => {
		const ledger = markNotificationSeen({ ledger: emptyLedger(), key: 'a:new' });
		expect(unseenNotificationCount({ ledger, keys: ['a:new', 'b:new', 'c:closing_soon'] })).toBe(2);
		expect(unseenNotificationCount({ ledger, keys: [] })).toBe(0);
	});
});
