// Browser-side nudge policy: the local ledger, cooldowns, dismissal backoff,
// session/interrupt budgets and the state slice sent to /api/personalize.
//
// The ledger mirrors to localStorage so caps survive reloads; eligibility
// comes from the shared policy module so the pre-filter can never disagree
// with the server's question builder. Everything is fail-safe: bad storage or
// bad input degrades to "no nudge", never to a broken prompt.

import { STORAGE_KEYS } from './constants.js';
import { requestPersonalize } from './personalize.js';
import { nudgeKindGroup } from '$lib/shared/nudgePolicy.js';

export const NUDGE_LEDGER_VERSION = 1;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const MOMENT_GLOBAL_COOLDOWN_MS = 24 * HOUR_MS;
export const SHARE_COOLDOWN_MS = 3 * DAY_MS;
export const PUSH_COOLDOWN_MS = 7 * DAY_MS;
export const DISMISS_BACKOFF_MS = [14 * DAY_MS, 30 * DAY_MS, 90 * DAY_MS];
export const INTERRUPT_COOLDOWN_MS = 24 * HOUR_MS;
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 7;
export const MAX_SEEN_KEYS = 200;

export function emptyLedger() {
	return {
		version: NUDGE_LEDGER_VERSION,
		lastMomentAt: null,
		lastShownAt: { share: null, push: null },
		lastDismissedAt: { share: null, push: null },
		dismissals: { share: 0, push: 0 },
		lastInterruptAt: null,
		shareUsedAt: null,
		seen: []
	};
}

function finiteTimestamp(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveCount(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** Never throws: anything unusable becomes the empty ledger. */
export function normalizeLedger(raw) {
	const base = emptyLedger();
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return base;
	}
	const shown = raw.lastShownAt && typeof raw.lastShownAt === 'object' ? raw.lastShownAt : {};
	const dismissed = raw.lastDismissedAt && typeof raw.lastDismissedAt === 'object' ? raw.lastDismissedAt : {};
	const dismissals = raw.dismissals && typeof raw.dismissals === 'object' ? raw.dismissals : {};
	return {
		version: NUDGE_LEDGER_VERSION,
		lastMomentAt: finiteTimestamp(raw.lastMomentAt),
		lastShownAt: { share: finiteTimestamp(shown.share), push: finiteTimestamp(shown.push) },
		lastDismissedAt: {
			share: finiteTimestamp(dismissed.share),
			push: finiteTimestamp(dismissed.push)
		},
		dismissals: { share: positiveCount(dismissals.share), push: positiveCount(dismissals.push) },
		lastInterruptAt: finiteTimestamp(raw.lastInterruptAt),
		shareUsedAt: finiteTimestamp(raw.shareUsedAt),
		seen: Array.isArray(raw.seen)
			? raw.seen.filter((key) => typeof key === 'string').slice(-MAX_SEEN_KEYS)
			: []
	};
}

export function readNudgeLedger() {
	if (typeof window === 'undefined') {
		return emptyLedger();
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.NUDGE_LEDGER);
		if (!raw) {
			return emptyLedger();
		}
		return normalizeLedger(JSON.parse(raw));
	} catch (error) {
		console.error('Failed to read the nudge ledger:', error);
		return emptyLedger();
	}
}

export function writeNudgeLedger(ledger) {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		window.localStorage.setItem(STORAGE_KEYS.NUDGE_LEDGER, JSON.stringify(normalizeLedger(ledger)));
	} catch (error) {
		console.error('Failed to write the nudge ledger:', error);
	}
}

export function dismissBackoffMs(dismissals) {
	const index = Math.min(Math.max(Number(dismissals) || 1, 1), DISMISS_BACKOFF_MS.length) - 1;
	return DISMISS_BACKOFF_MS[index];
}

/** The session allowance: one moment nudge and one interrupt per page load. */
export function createSessionBudget() {
	return { momentShown: false, interruptShown: false };
}

function daysAgo(now, timestamp) {
	if (!timestamp) {
		return null;
	}
	return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

/**
 * `null` when the ask may be shown; otherwise the machine reason recorded on
 * `nudge:suppressed`.
 */
export function momentSuppression({ kind, ledger, now, session }) {
	if (session?.momentShown) {
		return 'session';
	}
	const group = nudgeKindGroup(kind);
	const dismissals = ledger.dismissals[group] || 0;
	const dismissedAt = ledger.lastDismissedAt[group];
	if (dismissals > 0 && dismissedAt && now - dismissedAt < dismissBackoffMs(dismissals)) {
		return 'backoff';
	}
	const shownAt = ledger.lastShownAt[group];
	const cooldown = group === 'push' ? PUSH_COOLDOWN_MS : SHARE_COOLDOWN_MS;
	if (shownAt && now - shownAt < cooldown) {
		return 'cooldown';
	}
	if (ledger.lastMomentAt && now - ledger.lastMomentAt < MOMENT_GLOBAL_COOLDOWN_MS) {
		return 'cooldown';
	}
	return null;
}

/** `null` when an interrupt (toast) may be shown; otherwise the reason. */
export function interruptSuppression({ ledger, now, hourLocal, session }) {
	if (!Number.isFinite(hourLocal) || hourLocal >= QUIET_START_HOUR || hourLocal < QUIET_END_HOUR) {
		return 'quiet-hours';
	}
	if (session?.interruptShown) {
		return 'session';
	}
	if (ledger.lastInterruptAt && now - ledger.lastInterruptAt < INTERRUPT_COOLDOWN_MS) {
		return 'recent';
	}
	return null;
}

// ---- Ledger updates (pure; callers persist) ---------------------------------

export function registerMomentShown({ kind, ledger, now }) {
	const group = nudgeKindGroup(kind);
	return {
		...ledger,
		lastMomentAt: now,
		lastShownAt: { ...ledger.lastShownAt, [group]: now }
	};
}

export function registerMomentDismissed({ kind, ledger, now }) {
	const group = nudgeKindGroup(kind);
	return {
		...ledger,
		lastDismissedAt: { ...ledger.lastDismissedAt, [group]: now },
		dismissals: { ...ledger.dismissals, [group]: (ledger.dismissals[group] || 0) + 1 }
	};
}

export function registerInterrupt({ ledger, now }) {
	return { ...ledger, lastInterruptAt: now };
}

export function registerShareUsed({ ledger, now }) {
	return { ...ledger, shareUsedAt: now };
}

export function isNotificationSeen({ ledger, key }) {
	return ledger.seen.includes(key);
}

export function markNotificationSeen({ ledger, key }) {
	if (typeof key !== 'string' || key.length === 0 || ledger.seen.includes(key)) {
		return ledger;
	}
	return { ...ledger, seen: [...ledger.seen, key].slice(-MAX_SEEN_KEYS) };
}

export function unseenNotificationCount({ ledger, keys }) {
	const seen = new Set(ledger.seen);
	return (Array.isArray(keys) ? keys : []).filter((key) => !seen.has(key)).length;
}

// ---- State slice ------------------------------------------------------------

function localDayKey(timestamp) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Builds the PII-free nudge slice for /api/personalize. Only counts, day
 * buckets and ledger ages: no free text, no ids beyond what the caller
 * already has on the page.
 */
export function buildNudgeState({
	page,
	history = [],
	streak = null,
	ledger = emptyLedger(),
	now = Date.now(),
	lastResult = null,
	bestBeaten = false,
	reminderState = 'off',
	shareSheetOpenedThisResult = false,
	secondsOnPage = 0,
	interactionCount = 0,
	hourLocal = new Date(now).getHours(),
	isDataSaver = false,
	locale = 'en'
} = {}) {
	const entries = Array.isArray(history) ? history : [];
	const timestamps = entries
		.map((entry) => Number(entry?.timestamp))
		.filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
	const days = new Set(timestamps.map(localDayKey));
	const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
	const weekStart = now - 7 * DAY_MS;
	const total = Number(lastResult?.totalQuestions);
	const pct =
		lastResult && Number.isFinite(total) && total > 0
			? Math.round(((Number(lastResult.score) || 0) / total) * 100)
			: null;
	return {
		page,
		testsTotal: entries.length,
		distinctTestDays: days.size,
		testsThisWeek: timestamps.filter((timestamp) => timestamp >= weekStart && timestamp <= now + DAY_MS)
			.length,
		currentStreak: Number(streak?.currentStreak) || 0,
		daysSinceLastTest: lastTimestamp === null ? null : daysAgo(now, lastTimestamp),
		lastScore: pct === null ? null : { pct, total },
		bestBeaten: bestBeaten === true,
		shareUsed: Boolean(ledger.shareUsedAt),
		shareSheetOpenedThisResult: shareSheetOpenedThisResult === true,
		reminderState,
		nudgeHistory: {
			lastShareDaysAgo: daysAgo(now, ledger.lastShownAt.share),
			lastPushDaysAgo: daysAgo(now, ledger.lastShownAt.push),
			dismissals: (ledger.dismissals.share || 0) + (ledger.dismissals.push || 0)
		},
		session: {
			secondsOnPage: Number(secondsOnPage) || 0,
			interactionCount: Number(interactionCount) || 0,
			hourLocal,
			isDataSaver: isDataSaver === true
		},
		locale
	};
}

// ---- Browser conveniences ---------------------------------------------------
// The session budget is in-memory on purpose: a reload starts a fresh session,
// and the 24h ledger cooldown still governs what may show.

const sessionBudget = createSessionBudget();

export function getSessionBudget() {
	return sessionBudget;
}

/** One personalize call carrying the nudge slice; null means no decision. */
export async function requestNudgeDecision(state) {
	if (!state?.page) {
		return null;
	}
	const data = await requestPersonalize(state.page, { nudge: state });
	return data?.nudge ?? null;
}

export function markMomentShown(kind, now = Date.now()) {
	const ledger = registerMomentShown({ kind, ledger: readNudgeLedger(), now });
	writeNudgeLedger(ledger);
	sessionBudget.momentShown = true;
	return ledger;
}

export function markMomentDismissed(kind, now = Date.now()) {
	const ledger = registerMomentDismissed({ kind, ledger: readNudgeLedger(), now });
	writeNudgeLedger(ledger);
	return ledger;
}

export function markInterruptShown(now = Date.now()) {
	const ledger = registerInterrupt({ ledger: readNudgeLedger(), now });
	writeNudgeLedger(ledger);
	sessionBudget.interruptShown = true;
	return ledger;
}

export function markShareUsed(now = Date.now()) {
	const ledger = registerShareUsed({ ledger: readNudgeLedger(), now });
	writeNudgeLedger(ledger);
	return ledger;
}
