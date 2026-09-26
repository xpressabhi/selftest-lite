import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Exam notification hub contract: SSR-rendered published rows with derived
// statuses, hidden quarantine, client-side search/filters, official link
// attributes, the practice CTA only for mapped exams, the last-updated stamp
// and the Hindi twin. Seeded through the dev-only test database bridge.

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		if (/Rate limit exceeded|Failed to refresh auth session|Failed to fetch user state/i.test(message.text())) {
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
	const values = {
		dedupe_key: row.dedupeKey,
		source_id: row.sourceId,
		org: row.org,
		title: row.title,
		category: row.category ?? null,
		state: row.state ?? null,
		exam_id: row.examId ?? null,
		notification_url: row.notificationUrl,
		apply_url: row.applyUrl ?? null,
		published_at: row.publishedAt ?? null,
		apply_end: row.applyEnd ?? null,
		exam_date: row.examDate ?? null,
		review_status: row.reviewStatus ?? 'published',
		failure_reason: row.failureReason ?? null,
		first_seen_at: row.firstSeenDaysAgo
			? new Date(Date.now() - row.firstSeenDaysAgo * 24 * 60 * 60 * 1000)
			: new Date()
	};
	await sql`
		INSERT INTO exam_notification (
			dedupe_key, source_id, org, title, category, state, exam_id,
			notification_url, apply_url, published_at, apply_end, exam_date,
			review_status, failure_reason, first_seen_at
		) VALUES (
			${values.dedupe_key}, ${values.source_id}, ${values.org}, ${values.title},
			${values.category}, ${values.state}, ${values.exam_id}, ${values.notification_url},
			${values.apply_url}, ${values.published_at}, ${values.apply_end}, ${values.exam_date},
			${values.review_status}, ${values.failure_reason}, ${values.first_seen_at}
		)
		ON CONFLICT (dedupe_key) DO UPDATE SET
			title = EXCLUDED.title,
			notification_url = EXCLUDED.notification_url,
			apply_url = EXCLUDED.apply_url,
			published_at = EXCLUDED.published_at,
			apply_end = EXCLUDED.apply_end,
			exam_date = EXCLUDED.exam_date,
			review_status = EXCLUDED.review_status,
			failure_reason = EXCLUDED.failure_reason,
			first_seen_at = EXCLUDED.first_seen_at
	`;
}

async function seedHub(request) {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await seedNotification(sql, {
		dedupeKey: 'e2e-ssc-cgl',
		sourceId: 'ssc',
		org: 'Staff Selection Commission',
		title: 'Combined Graduate Level Examination 2026 – Notice',
		category: 'ssc-central',
		examId: 'ssc-cgl',
		notificationUrl: 'https://ssc.gov.in/notice/cgl-2026.pdf',
		applyUrl: 'https://ssc.gov.in/apply/cgl-2026',
		publishedAt: isoDaysFromToday(-1),
		applyEnd: isoDaysFromToday(5)
	});
	await seedNotification(sql, {
		dedupeKey: 'e2e-rrb-group-d',
		sourceId: 'rrb-chandigarh',
		org: 'Railway Recruitment Board (Chandigarh)',
		title: 'RRB Group D 2026 Notification',
		category: 'railways',
		notificationUrl: 'https://rrb.indianrailways.gov.in/getdata?cennum=05/2026',
		applyEnd: isoDaysFromToday(40),
		firstSeenDaysAgo: 10
	});
	await seedNotification(sql, {
		dedupeKey: 'e2e-uppsc-closed',
		sourceId: 'uppsc',
		org: 'Uttar Pradesh Public Service Commission',
		title: 'UPPSC PCS Prelims 2025 Notice',
		category: 'state-govt',
		state: 'Uttar Pradesh',
		examId: 'uppsc-pcs-prelims',
		notificationUrl: 'https://uppsc.up.nic.in/Open_PDF.aspx?abc',
		applyEnd: isoDaysFromToday(-2),
		firstSeenDaysAgo: 300
	});
	await seedNotification(sql, {
		dedupeKey: 'e2e-quarantined',
		sourceId: 'ssc',
		org: 'Staff Selection Commission',
		title: 'Quarantined suspect notice',
		notificationUrl: 'https://ssc.gov.in/notice/suspect.pdf',
		reviewStatus: 'quarantined',
		failureReason: 'link_unreachable'
	});
	await sql`
		INSERT INTO exam_sync_run (started_at, finished_at, status, sources_total, sources_ok)
		VALUES (NOW(), NOW(), 'ok', 7, 7)
	`;
	return sql;
}

test('hub renders seeded published notifications and hides quarantined rows', async ({
	page,
	request
}, testInfo) => {
	const errors = await collectErrors(page);
	// First visit creates the schema through the app's own path.
	await page.goto('/exams');
	await seedHub(request);
	await page.reload();

	const cards = page.locator('.exam-card');
	await expect(cards).toHaveCount(3);
	await expect(page.locator('.exam-card-title', { hasText: 'Quarantined suspect notice' })).toHaveCount(0);

	// Statuses and the new badge come from seeded dates vs today.
	const cgl = page.locator('.exam-card', { hasText: 'Combined Graduate Level Examination' });
	await expect(cgl.locator('.exam-status')).toHaveText(/Closing soon/i);
	await expect(cgl.locator('.exam-new')).toBeVisible();
	await expect(page.locator('.exam-status', { hasText: /Closed/ })).toBeVisible();
	await expect(page.locator('.exam-status', { hasText: /^Open$/ })).toBeVisible();

	// Official links open the official site in a new tab.
	const notice = cgl.locator('a.exam-action-primary');
	await expect(notice).toHaveAttribute('href', 'https://ssc.gov.in/notice/cgl-2026.pdf');
	await expect(notice).toHaveAttribute('target', '_blank');
	await expect(notice).toHaveAttribute('rel', /noopener/);

	// The practice CTA only exists for exam-mapped notifications.
	const practice = cgl.locator('a.exam-action-practice');
	await expect(practice).toHaveAttribute('href', '/practice/ssc-cgl');
	await expect(page.locator('.exam-card', { hasText: 'RRB Group D' }).locator('a.exam-action-practice')).toHaveCount(0);
	await expect(page.locator('.exam-card', { hasText: 'UPPSC PCS Prelims' }).locator('a.exam-action-practice')).toHaveAttribute(
		'href',
		'/practice/uppsc-pcs-prelims'
	);

	// The stamp comes from the seeded successful run.
	await expect(page.locator('.exams-updated-text')).toBeVisible();
	await expect(page.locator('.exams-count')).toContainText('3');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				cards: await cards.count(),
				statuses: await page.locator('.exam-status').allTextContents(),
				practiceHref: await practice.getAttribute('href')
			},
			null,
			2
		)
	});
	expect(errors).toEqual([]);
});

test('search and status filters narrow the list and can be cleared', async ({ page, request }) => {
	const errors = await collectErrors(page);
	await page.goto('/exams');
	await seedHub(request);
	await page.reload();

	const search = page.locator('#exams-search');
	await search.fill('RRB');
	await expect(page.locator('.exam-card')).toHaveCount(1);
	await expect(page.locator('.exam-card-title')).toContainText('RRB Group D');

	await search.fill('UPPSC');
	await expect(page.locator('.exam-card')).toHaveCount(1);

	await search.fill('no-such-notification');
	await expect(page.locator('.exams-empty-title')).toContainText(/No notifications match/i);
	await page.locator('.exams-empty button', { hasText: /Clear filters/i }).click();
	await expect(page.locator('.exam-card')).toHaveCount(3);

	await page.locator('.exams-chip', { hasText: /^Closing soon$/ }).click();
	await expect(page.locator('.exam-card')).toHaveCount(1);
	await expect(page.locator('.exam-card-title')).toContainText('Combined Graduate Level Examination');

	await page.locator('.exams-chip', { hasText: /^New$/ }).click();
	await expect(page.locator('.exam-card')).toHaveCount(1);

	expect(errors).toEqual([]);
});

test('Hindi tree renders translated chrome and localized practice links', async ({ page, request }) => {
	const errors = await collectErrors(page);
	await page.goto('/hi/exams');
	await seedHub(request);
	await page.reload();

	await expect(page.locator('h1')).toContainText('परीक्षा और भर्ती सूचनाएँ');
	await expect(page.locator('.exams-search-input')).toHaveAttribute(
		'placeholder',
		/सूचनाएँ खोजें/
	);
	const practice = page
		.locator('.exam-card', { hasText: 'Combined Graduate Level Examination' })
		.locator('a.exam-action-practice');
	await expect(practice).toHaveAttribute('href', '/hi/practice/ssc-cgl');
	expect(errors).toEqual([]);
});
