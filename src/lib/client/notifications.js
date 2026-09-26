// In-app notification feed: interest tiers, badge classification and the Jev
// candidate payload for exam updates. Pure functions except the thin fetch
// wrapper; the ledger and its seen keys live in nudge.js.
//
// "New" keys on first_seen_at (falling back to the published date), never on
// last_seen_at: the daily sync refreshes last_seen_at and that would re-badge
// every morning. Closed rows never badge and never reach the model.

import { deriveNotificationStatus, todayInIst } from '$lib/shared/examNotificationStatus.js';
import { MAX_NOTIFICATION_CANDIDATES } from '$lib/shared/nudgePolicy.js';
import { emptyLedger, isNotificationSeen } from './nudge.js';

export { MAX_NOTIFICATION_CANDIDATES };

export const MAX_FEED_ITEMS = 30;
export const NOTIFICATION_NEW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_ORDER = { closing_soon: 0, open: 1, upcoming: 2, closed: 3 };
const TIER_ORDER = { bookmarked: 0, practiced: 1, category: 2, state: 3, none: 4 };

export function notificationEventKey(id, event) {
	return `${id}:${event}`;
}

/** Hard matches first; everything else is a soft candidate Jev may approve. */
export function notificationTier(item, { bookmarkedExamIds = [], practicedExamIds = [] } = {}) {
	const examId = item?.examId;
	if (typeof examId !== 'string' || examId.length === 0) {
		return 'none';
	}
	if (bookmarkedExamIds.includes(examId)) {
		return 'bookmarked';
	}
	if (practicedExamIds.includes(examId)) {
		return 'practiced';
	}
	return 'none';
}

/** Fresh window keyed on first_seen_at, with the published date as fallback. */
export function isNotificationFresh(item, now = Date.now(), todayIso = todayInIst(new Date(now))) {
	const firstSeenAt = item?.firstSeenAt ? Date.parse(item.firstSeenAt) : Number.NaN;
	if (Number.isFinite(firstSeenAt)) {
		return now - firstSeenAt <= NOTIFICATION_NEW_DAYS * DAY_MS;
	}
	const publishedAt = typeof item?.publishedAt === 'string' ? item.publishedAt.slice(0, 10) : '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
		return false;
	}
	const cutoff = new Date(Date.parse(`${todayIso}T00:00:00Z`) - NOTIFICATION_NEW_DAYS * DAY_MS)
		.toISOString()
		.slice(0, 10);
	return publishedAt >= cutoff;
}

function daysBetween(todayIso, isoDate) {
	const start = Date.parse(`${todayIso}T00:00:00Z`);
	const end = Date.parse(`${isoDate}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end)) {
		return null;
	}
	return Math.round((end - start) / DAY_MS);
}

function recencyStamp(item) {
	return item?.firstSeenAt ? Date.parse(item.firstSeenAt) || 0 : Date.parse(`${item?.publishedAt}T00:00:00Z`) || 0;
}

/**
 * One row's display and badge state. `key` is the unseen badge's ledger key,
 * or null when nothing should badge.
 */
export function classifyNotification(
	item,
	{ ledger = emptyLedger(), now = Date.now(), todayIso = todayInIst(new Date(now)), bookmarkedExamIds = [], practicedExamIds = [], relevantIds = [] } = {}
) {
	if (!item || !Number.isFinite(Number(item.id)) || typeof item.title !== 'string') {
		return null;
	}
	const status = item.status || deriveNotificationStatus(item, todayIso);
	const tier = notificationTier(item, { bookmarkedExamIds, practicedExamIds });
	const relevant = tier !== 'none' || relevantIds.map(String).includes(String(item.id));
	const seenNew = isNotificationSeen({ ledger, key: notificationEventKey(item.id, 'new') });
	const seenClosing = isNotificationSeen({ ledger, key: notificationEventKey(item.id, 'closing_soon') });
	let event = null;
	if (status !== 'closed' && relevant) {
		if (!seenNew && isNotificationFresh(item, now, todayIso)) {
			event = 'new';
		} else if (status === 'closing_soon' && !seenClosing) {
			event = 'closing_soon';
		}
	}
	return {
		item,
		status,
		tier,
		relevant,
		event,
		key: event ? notificationEventKey(item.id, event) : null
	};
}

export function selectBadges(items, options = {}) {
	return (Array.isArray(items) ? items : [])
		.map((item) => classifyNotification(item, options))
		.filter((row) => row?.key);
}

function compareFeedRows(left, right, relevantIds) {
	const status = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);
	if (status !== 0) {
		return status;
	}
	const leftRelevant = left.tier !== 'none' || relevantIds.map(String).includes(String(left.item.id));
	const rightRelevant = right.tier !== 'none' || relevantIds.map(String).includes(String(right.item.id));
	if (leftRelevant !== rightRelevant) {
		return leftRelevant ? -1 : 1;
	}
	const tier = (TIER_ORDER[left.tier] ?? 9) - (TIER_ORDER[right.tier] ?? 9);
	if (tier !== 0) {
		return tier;
	}
	return recencyStamp(right.item) - recencyStamp(left.item);
}

/** Panel order: deadlines first, then relevance, then the newest. */
export function buildFeedView(items, options = {}) {
	const relevantIds = options.relevantIds || [];
	return (Array.isArray(items) ? items : [])
		.map((item) => classifyNotification(item, options))
		.filter(Boolean)
		.filter((row) => row.relevant)
		.sort((left, right) => compareFeedRows(left, right, relevantIds));
}

/**
 * The bounded, PII-free payload for the ranking call: never closed, only
 * fresh or deadline-near rows, hard matches first.
 */
export function buildNotificationCandidates(items, options = {}) {
	const { now = Date.now(), todayIso = todayInIst(new Date(now)), bookmarkedExamIds = [], practicedExamIds = [] } =
		options;
	return (Array.isArray(items) ? items : [])
		.map((item) => classifyNotification(item, { ...options, ledger: options.ledger, now, todayIso, bookmarkedExamIds, practicedExamIds }))
		.filter((row) => row && row.status !== 'closed')
		.filter((row) => row.status === 'closing_soon' || isNotificationFresh(row.item, now, todayIso))
		.sort((left, right) => compareFeedRows(left, right, []))
		.slice(0, MAX_NOTIFICATION_CANDIDATES)
		.map((row) => ({
			id: String(row.item.id),
			org: String(row.item.org || '').slice(0, 120),
			title: String(row.item.title || '').slice(0, 240),
			category: row.item.category || null,
			state: row.item.state || null,
			status: row.status,
			daysLeft: row.item.applyEnd ? daysBetween(todayIso, row.item.applyEnd) : null,
			match: row.tier
		}));
}

/** Local interest signals: bookmarks, practiced exam ids and recent topics. */
export function interestsFrom({ bookmarkedExamIds = [], history = [] } = {}) {
	const practiced = [];
	const topics = [];
	const seenTopics = new Set();
	for (const entry of Array.isArray(history) ? history : []) {
		if (entry?.examId && !practiced.includes(entry.examId)) {
			practiced.push(entry.examId);
		}
		const topic = String(entry?.topic || '').trim().slice(0, 80);
		if (topic && !seenTopics.has(topic)) {
			seenTopics.add(topic);
			topics.push(topic);
		}
	}
	return {
		bookmarkedExamIds: (Array.isArray(bookmarkedExamIds) ? bookmarkedExamIds : []).slice(0, 20),
		practicedExamIds: practiced.slice(0, 20),
		topics: topics.slice(0, 5)
	};
}

const FEED_CACHE_KEY = 'selftest_notifications_feed';
const FEED_CACHE_TTL_MS = 15 * 60 * 1000;

function readFeedCache() {
	if (typeof window === 'undefined') {
		return null;
	}
	try {
		const raw = window.sessionStorage.getItem(FEED_CACHE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed?.items)) {
			return null;
		}
		if (Date.now() - Number(parsed.fetchedAt || 0) > FEED_CACHE_TTL_MS) {
			return null;
		}
		return parsed.items.slice(0, MAX_FEED_ITEMS);
	} catch {
		return null;
	}
}

function writeFeedCache(items) {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		window.sessionStorage.setItem(
			FEED_CACHE_KEY,
			JSON.stringify({ fetchedAt: Date.now(), items })
		);
	} catch {
		// Session storage is best-effort; a full quota just means refetching.
	}
}

/**
 * Fail-safe feed read: any failure is an empty feed, never an error sheet.
 * One fetch per tab session (the sync runs daily), cached in sessionStorage so
 * page-to-page navigation never re-requests or aborts it mid-flight.
 */
export async function fetchNotificationFeed({ signal, force = false } = {}) {
	if (!force) {
		const cached = readFeedCache();
		if (cached) {
			return { items: cached, unavailable: false, cached: true };
		}
	}
	try {
		const response = await fetch('/api/exam-notifications', { signal });
		const data = await response.json().catch(() => null);
		if (!response.ok || !Array.isArray(data?.notifications)) {
			return { items: [], unavailable: true };
		}
		const items = data.notifications.slice(0, MAX_FEED_ITEMS);
		writeFeedCache(items);
		return { items, unavailable: false, cached: false };
	} catch {
		return { items: [], unavailable: false };
	}
}
