import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// In-app notification inbox contract: a bookmarked exam's fresh notice badges
// the header bell, opening the inbox marks it read, closing-soon shows once,
// quarantined rows never appear, and Hindi chrome renders. Rows are seeded
// through the dev-only test database bridge; no keys or backend needed.

const BOOKMARKS_KEY = 'selftest_bookmarked_exams';
const LANGUAGE_KEY = 'selftest_language';

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		if (
			/Rate limit exceeded|Failed to refresh auth session|Failed to fetch user state|Failed to hydrate/i.test(
				message.text()
			)
		) {
			return;
		}
		errors.push(message.text());
	});
	page.on('pageerror', (error) => {
		errors.push(String(error?.message || error));
	});
	return errors;
}

function isoDaysFromToday(days) {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString().slice(0, 10);
}

async function seedNotification(sql, row) {
	await sql`
		INSERT INTO exam_notification (
			dedupe_key, source_id, org, title, category, state, exam_id,
			notification_url, apply_url, published_at, apply_end, exam_date,
			review_status, failure_reason, first_seen_at
		) VALUES (
			${row.dedupeKey}, ${row.sourceId || 'e2e'}, ${row.org}, ${row.title},
			${row.category ?? null}, ${row.state ?? null}, ${row.examId ?? null},
			${row.notificationUrl}, ${row.applyUrl ?? null}, ${row.publishedAt ?? null},
			${row.applyEnd ?? null}, ${row.examDate ?? null},
			${row.reviewStatus ?? 'published'}, ${row.failureReason ?? null},
			${row.firstSeenDaysAgo
				? new Date(Date.now() - row.firstSeenDaysAgo * 24 * 60 * 60 * 1000)
				: new Date()}
		)
		ON CONFLICT (dedupe_key) DO UPDATE SET
			title = EXCLUDED.title,
			notification_url = EXCLUDED.notification_url,
			apply_url = EXCLUDED.apply_url,
			published_at = EXCLUDED.published_at,
			apply_end = EXCLUDED.apply_end,
			exam_date = EXCLUDED.exam_date,
			exam_id = EXCLUDED.exam_id,
			review_status = EXCLUDED.review_status,
			failure_reason = EXCLUDED.failure_reason,
			first_seen_at = EXCLUDED.first_seen_at
	`;
}

async function seedFeed(request) {
	// The feed endpoint owns ensureStorageSchema; touching it first makes this
	// spec self-sufficient regardless of worker execution order.
	await request.get('/api/exam-notifications');
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await seedNotification(sql, {
		dedupeKey: 'nudge-e2e-rbi-grade-b',
		sourceId: 'rbi',
		org: 'Reserve Bank of India',
		title: 'RBI Grade B Officer 2026 Notification',
		category: 'banking',
		examId: 'rbi-grade-b',
		notificationUrl: 'https://www.rbi.org.in/notice/grade-b-2026',
		applyUrl: 'https://www.rbi.org.in/apply/grade-b-2026',
		publishedAt: isoDaysFromToday(-1),
		applyEnd: isoDaysFromToday(5)
	});
	await seedNotification(sql, {
		dedupeKey: 'nudge-e2e-closed',
		sourceId: 'e2e',
		org: 'Closed Commission',
		title: 'Closed recruitment notice',
		notificationUrl: 'https://example.gov.in/closed',
		applyEnd: isoDaysFromToday(-3),
		firstSeenDaysAgo: 200
	});
	await seedNotification(sql, {
		dedupeKey: 'nudge-e2e-quarantined',
		sourceId: 'e2e',
		org: 'Suspicious Commission',
		title: 'Quarantined inbox notice',
		notificationUrl: 'https://example.gov.in/quarantined',
		reviewStatus: 'quarantined',
		failureReason: 'link_unreachable'
	});
	return sql;
}

async function seedBookmarks(page, examIds, language = null) {
	await page.addInitScript(
		({ bookmarkKey, languageKey, examIdValue, languageValue }) => {
			window.localStorage.setItem(bookmarkKey, JSON.stringify(examIdValue));
			if (languageValue) {
				window.localStorage.setItem(languageKey, languageValue);
			}
		},
		{
			bookmarkKey: BOOKMARKS_KEY,
			languageKey: LANGUAGE_KEY,
			examIdValue: examIds,
			languageValue: language
		}
	);
}

async function openInbox(page) {
	// Retry the click: before hydration the SSR button has no handler, and a
	// stray pre-hydration click would otherwise leave the panel closed.
	await expect(async () => {
		if (await page.locator('.notifications-panel').count()) {
			return;
		}
		await page.locator('.notifications-trigger').click();
		await expect(page.locator('.notifications-panel')).toBeVisible({ timeout: 1500 });
	}).toPass({ timeout: 12000 });
}

test('a bookmarked fresh notice badges the bell and the inbox lists it', async ({
	page,
	request
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await seedFeed(request);
	await seedBookmarks(page, ['rbi-grade-b']);

	await page.goto('/');
	await expect(page.locator('.notifications-badge')).toHaveText('1', { timeout: 10000 });

	await openInbox(page);
	const item = page.locator('.notifications-item', { hasText: 'RBI Grade B Officer 2026' });
	await expect(item).toBeVisible();
	await expect(item.locator('.notifications-status')).toHaveText('Closing soon');
	await expect(item).toContainText('Reserve Bank of India');
	await expect(item).toContainText('Apply by');

	const noticeLink = item.getByRole('link', { name: 'Official notice' });
	await expect(noticeLink).toHaveAttribute('href', 'https://www.rbi.org.in/notice/grade-b-2026');
	await expect(noticeLink).toHaveAttribute('target', '_blank');
	await expect(item.getByRole('link', { name: 'Practice for this exam' })).toHaveAttribute(
		'href',
		'/practice/rbi-grade-b'
	);
	await expect(item).not.toContainText('Closed recruitment notice');

	// Opening the inbox is reading it.
	await expect(page.locator('.notifications-badge')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ badge: 1, status: 'Closing soon', practice: '/practice/rbi-grade-b' }, null, 2)
	});
	expect(errors).toEqual([]);
});

test('seen state survives a reload but the item stays in the inbox', async ({
	page,
	request
}) => {
	const errors = await collectErrors(page);
	await seedFeed(request);
	await seedBookmarks(page, ['rbi-grade-b']);

	await page.goto('/');
	await expect(page.locator('.notifications-badge')).toHaveText('1', { timeout: 10000 });
	await openInbox(page);
	await expect(page.locator('.notifications-item', { hasText: 'RBI Grade B' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.notifications-panel')).toHaveCount(0);

	await page.reload();
	await openInbox(page);
	await expect(page.locator('.notifications-item', { hasText: 'RBI Grade B' })).toBeVisible();
	await expect(page.locator('.notifications-badge')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('quarantined rows never reach the feed and unknown exams show the empty state', async ({
	page,
	request
}) => {
	const errors = await collectErrors(page);
	await seedFeed(request);
	await seedBookmarks(page, []);

	const feed = await request.get('/api/exam-notifications');
	expect(feed.ok()).toBe(true);
	const body = await feed.json();
	const titles = body.notifications.map((item) => item.title);
	expect(titles).toContain('RBI Grade B Officer 2026 Notification');
	expect(titles).not.toContain('Quarantined inbox notice');
	expect(titles.every((title) => !/quarantined/i.test(title))).toBe(true);

	await page.goto('/');
	await openInbox(page);
	await expect(page.locator('.notifications-empty-title')).toContainText('No updates for your exams');
	await expect(page.locator('.notifications-badge')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('hindi chrome renders in the inbox', async ({ page, request }) => {
	const errors = await collectErrors(page);
	await seedFeed(request);
	await seedBookmarks(page, ['rbi-grade-b'], 'hindi');

	await page.goto('/hi');
	await expect(page.locator('.notifications-badge')).toHaveText('1', { timeout: 10000 });
	await openInbox(page);
	await expect(page.locator('.notifications-title')).toHaveText('परीक्षा अपडेट');
	await expect(page.locator('.notifications-item', { hasText: 'RBI Grade B' })).toContainText(
		'इस परीक्षा की तैयारी करें'
	);

	expect(errors).toEqual([]);
});
