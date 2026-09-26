import { describe, expect, it } from 'vitest';
import { emptyLedger, markNotificationSeen } from './nudge.js';
import {
	MAX_NOTIFICATION_CANDIDATES,
	buildFeedView,
	buildNotificationCandidates,
	classifyNotification,
	interestsFrom,
	isNotificationFresh,
	notificationEventKey,
	notificationTier,
	selectBadges
} from './notifications.js';

// Failure list for the notification feed (written before the module):
// closed or quarantined items reaching badges or candidates, stale rows
// re-badging every morning, soft matches badging without a relevance verdict,
// closing-soon re-badging more than once, and unbounded candidate payloads.

const NOW = new Date('2026-09-26T12:00:00Z').getTime();
const TODAY = '2026-09-26';

function item(overrides = {}) {
	return {
		id: 7,
		org: 'UPSC',
		title: 'Civil Services Examination 2026',
		category: 'civil-services',
		state: null,
		examId: 'upsc-cse-prelims',
		notificationUrl: 'https://upsc.gov.in/notice',
		applyEnd: '2026-10-20',
		examDate: null,
		publishedAt: '2026-09-24',
		firstSeenAt: '2026-09-24T08:00:00.000Z',
		status: 'open',
		...overrides
	};
}

function daysFromNow(days) {
	return new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('notificationEventKey', () => {
	it('keys the same row differently per lifecycle event', () => {
		expect(notificationEventKey(7, 'new')).toBe('7:new');
		expect(notificationEventKey(7, 'closing_soon')).toBe('7:closing_soon');
	});
});

describe('notificationTier', () => {
	it('prefers a bookmarked exam over everything else', () => {
		expect(
			notificationTier(item(), { bookmarkedExamIds: ['upsc-cse-prelims'], practicedExamIds: [] })
		).toBe('bookmarked');
	});

	it('falls back to practiced, then none for soft matches', () => {
		expect(notificationTier(item(), { practicedExamIds: ['upsc-cse-prelims'] })).toBe('practiced');
		expect(notificationTier(item(), {})).toBe('none');
		expect(notificationTier(item({ examId: null }), { bookmarkedExamIds: ['other'] })).toBe('none');
	});
});

describe('isNotificationFresh', () => {
	it('uses first_seen_at when present and the published date otherwise', () => {
		expect(isNotificationFresh(item(), NOW, TODAY)).toBe(true);
		expect(isNotificationFresh(item({ firstSeenAt: daysFromNow(-20) }), NOW, TODAY)).toBe(false);
		expect(
			isNotificationFresh(item({ firstSeenAt: null, publishedAt: '2026-09-20' }), NOW, TODAY)
		).toBe(true);
		expect(
			isNotificationFresh(item({ firstSeenAt: null, publishedAt: '2026-08-01' }), NOW, TODAY)
		).toBe(false);
	});

	it('ignores a daily re-scan refreshing last_seen_at', () => {
		// last_seen_at is not even read: the fresh window keys on first_seen_at.
		expect(
			isNotificationFresh(item({ lastSeenAt: daysFromNow(0) }), NOW, TODAY)
		).toBe(true);
	});
});

describe('classifyNotification', () => {
	it('badges a fresh bookmarked notice once as new', () => {
		const classified = classifyNotification(item(), {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims']
		});
		expect(classified.event).toBe('new');
		expect(classified.key).toBe('7:new');
	});

	it('never badges closed or quarantined-shaped rows', () => {
		expect(
			classifyNotification(item({ status: 'closed' }), {
				ledger: emptyLedger(),
				now: NOW,
				todayIso: TODAY,
				bookmarkedExamIds: ['upsc-cse-prelims']
			}).key
		).toBeNull();
	});

	it('does not badge soft matches without a relevance verdict', () => {
		const classified = classifyNotification(item({ examId: null }), {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY
		});
		expect(classified.tier).toBe('none');
		expect(classified.key).toBeNull();
	});

	it('badges a soft match only when the verdict includes it', () => {
		const classified = classifyNotification(item({ examId: null }), {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY,
			relevantIds: ['7']
		});
		expect(classified.key).toBe('7:new');
	});

	it('re-badges a seen new row once when it turns closing soon', () => {
		let ledger = markNotificationSeen({ ledger: emptyLedger(), key: '7:new' });
		const fresh = classifyNotification(item({ status: 'closing_soon' }), {
			ledger,
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims']
		});
		expect(fresh.event).toBe('closing_soon');
		ledger = markNotificationSeen({ ledger, key: '7:closing_soon' });
		const again = classifyNotification(item({ status: 'closing_soon' }), {
			ledger,
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims']
		});
		expect(again.key).toBeNull();
	});

	it('still badges a stale closing-soon deadline once', () => {
		const classified = classifyNotification(item({ status: 'closing_soon', firstSeenAt: daysFromNow(-40) }), {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims']
		});
		expect(classified.event).toBe('closing_soon');
	});

	it('ignores malformed rows', () => {
		expect(classifyNotification(null, { ledger: emptyLedger(), now: NOW, todayIso: TODAY })).toBeNull();
		expect(
			classifyNotification({ title: 'No id' }, { ledger: emptyLedger(), now: NOW, todayIso: TODAY })
		).toBeNull();
	});
});

describe('selectBadges', () => {
	it('collects only badged rows and counts them', () => {
		const items = [
			item({ id: 1, examId: 'upsc-cse-prelims' }),
			item({ id: 2, examId: null, title: 'Other' }),
			item({ id: 3, examId: 'upsc-cse-prelims', status: 'closed', title: 'Closed' })
		];
		const badges = selectBadges(items, {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims']
		});
		expect(badges.map((badge) => badge.key)).toEqual(['1:new']);
	});
});

describe('buildFeedView', () => {
	it('orders closing-soon first, then relevance, then recency', () => {
		const items = [
			item({ id: 1, title: 'Open bookmarked', examId: 'upsc-cse-prelims' }),
			item({ id: 2, title: 'Closing soft', examId: null, status: 'closing_soon' }),
			item({ id: 3, title: 'Closed bookmarked', examId: 'upsc-cse-prelims', status: 'closed' })
		];
		const view = buildFeedView(items, {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims'],
			relevantIds: ['2']
		});
		expect(view.map((row) => row.item.id)).toEqual([2, 1, 3]);
	});

	it('drops rows the learner has no connection to', () => {
		const view = buildFeedView([item({ id: 1, examId: null })], {
			ledger: emptyLedger(),
			now: NOW,
			todayIso: TODAY
		});
		expect(view).toEqual([]);
	});
});

describe('buildNotificationCandidates', () => {
	it('caps the payload and never offers closed rows', () => {
		const items = Array.from({ length: 9 }, (_, index) =>
			item({ id: 100 + index, examId: null, title: `Notice ${index}` })
		);
		const candidates = buildNotificationCandidates(items, {
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: []
		});
		expect(candidates).toHaveLength(MAX_NOTIFICATION_CANDIDATES);
		expect(buildNotificationCandidates([item({ status: 'closed' })], { now: NOW, todayIso: TODAY })).toEqual(
			[]
		);
	});

	it('marks bookmarked matches and carries days left', () => {
		const candidates = buildNotificationCandidates([item()], {
			now: NOW,
			todayIso: TODAY,
			bookmarkedExamIds: ['upsc-cse-prelims']
		});
		expect(candidates[0]).toMatchObject({
			id: '7',
			match: 'bookmarked',
			status: 'open',
			daysLeft: 24
		});
	});
});

describe('interestsFrom', () => {
	it('dedupes practiced exam ids and caps topics', () => {
		const interests = interestsFrom({
			bookmarkedExamIds: ['a'],
			history: [
				{ examId: 'b', topic: 'Physics' },
				{ examId: 'b', topic: 'Physics' },
				{ examId: 'c', topic: 'Maths' },
				{ topic: 'Chemistry' },
				{ topic: 'Biology' },
				{ topic: 'History' },
				{ topic: 'Civics' }
			]
		});
		expect(interests.bookmarkedExamIds).toEqual(['a']);
		expect(interests.practicedExamIds).toEqual(['b', 'c']);
		expect(interests.topics).toHaveLength(5);
	});
});
