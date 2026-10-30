import { test as base, expect } from '@playwright/test';
import { sqlClient } from './testDb.js';

// The admin dashboard is an internal surface, so this spec seeds its own
// telemetry (through the dev-only PGlite bridge) and then exercises the
// contract the charts rely on: bucket counts, filter retention, the log
// filters, and the mobile layout.
const adminCredentials = {
	username: process.env.ADMIN_USERNAME || '',
	password: process.env.ADMIN_PASSWORD || '',
};

// One worker-scoped browser context, one admin login. The login rate limit is
// 5/minute per client key, and other specs also sign in; four per-test logins
// here would starve them when the full suite runs in parallel.
const test = base.extend({
	adminContext: [
		async ({ browser }, use) => {
			const context = await browser.newContext({
				storageState: 'tests/e2e/welcome-tour-seen.storage.json',
			});
			const response = await context.request.post('http://localhost:5174/api/admin/login', {
				data: adminCredentials,
			});
			expect(response.status()).toBe(200);
			await use(context);
			await context.close();
		},
		{ scope: 'worker' },
	],
	page: [
		async ({ adminContext }, use) => {
			const page = await adminContext.newPage();
			await use(page);
			await page.close();
		},
		{ scope: 'test' },
	],
});

test.skip(
	!adminCredentials.username || !adminCredentials.password,
	'Admin credentials are not configured'
);

// Seed once per file. Serial mode keeps the four assertions from inserting
// duplicate rows into the same shared PGlite instance.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
	const sql = sqlClient(request);
	await seed(sql);
});

async function seed(sql) {
	await sql`
		INSERT INTO api_request_events
			(route, action, status_code, duration_ms, ip_country, ip_city, client_key, user_agent, error_message, created_at)
		SELECT
			'/api/e2e-admin-broken', 'e2e', 500, 1200, 'IN', 'E2E City',
			'e2e-admin-' || g, 'Mozilla/5.0 (Linux; Android 10) Chrome/109', 'e2e failure',
			NOW() - (g || ' minutes')::interval
		FROM generate_series(1, 60) AS g
	`;
	await sql`
		INSERT INTO api_request_events
			(route, action, status_code, duration_ms, ip_country, ip_city, client_key, user_agent, created_at)
		SELECT
			'/api/e2e-admin-ok', 'e2e', 200, 60, 'IN', 'E2E City',
			'e2e-admin-ok-' || g, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
			NOW() - (g || ' minutes')::interval
		FROM generate_series(1, 30) AS g
	`;
	await sql`
		INSERT INTO api_rate_limit_events (client_key, route, created_at)
		SELECT 'e2e-admin-' || g, '/api/e2e-admin-broken', NOW() - (g || ' minutes')::interval
		FROM generate_series(1, 4) AS g
	`;
	// Previous-window traffic so the KPI deltas and ghost line have a baseline.
	await sql`
		INSERT INTO api_request_events
			(route, action, status_code, duration_ms, ip_country, ip_city, client_key, user_agent, created_at)
		SELECT
			'/api/e2e-admin-previous', 'e2e', 200, 80, 'IN', 'E2E City',
			'e2e-admin-prev-' || g, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
			NOW() - INTERVAL '7 days' - ((g % 7) || ' days')::interval - (g || ' minutes')::interval
		FROM generate_series(1, 20) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'page:view', '/test', '{}'::jsonb, 'e2e-admin-prev-session-' || g,
			'e2e-admin-prev-client-' || g, NOW() - INTERVAL '8 days'
		FROM generate_series(1, 10) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'page:view', '/test', '{}'::jsonb, 'e2e-admin-session-' || g,
			'e2e-admin-client-' || g, NOW() - (g || ' hours')::interval
		FROM generate_series(1, 20) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'generate:start', '/test',
			'{"mode":"quiz","difficulty":"medium","language":"english"}'::jsonb,
			'e2e-admin-session-' || g, 'e2e-admin-client-' || g,
			NOW() - (g || ' hours')::interval
		FROM generate_series(1, 20) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'generate:success', '/test', '{}'::jsonb, 'e2e-admin-session-' || g,
			'e2e-admin-client-' || g, NOW() - (g || ' hours')::interval
		FROM generate_series(1, 16) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'generate:fail', '/test', '{"elapsedSeconds":"8"}'::jsonb,
			'e2e-admin-session-' || g, 'e2e-admin-client-' || g,
			NOW() - (g || ' hours')::interval
		FROM generate_series(17, 20) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'test:start', '/test', '{}'::jsonb, 'e2e-admin-session-' || g,
			'e2e-admin-client-' || g, NOW() - (g || ' hours')::interval
		FROM generate_series(1, 12) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'test:submit', '/test', '{}'::jsonb, 'e2e-admin-session-' || g,
			'e2e-admin-client-' || g, NOW() - (g || ' hours')::interval
		FROM generate_series(1, 10) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'device:profile', '/test',
			jsonb_build_object(
				'tier', CASE WHEN g <= 4 THEN 'low' ELSE 'high' END,
				'model', 'E2E Phone ' || g,
				'android', '13'
			),
			'e2e-admin-session-' || g, 'e2e-admin-client-' || g,
			NOW() - (g || ' hours')::interval - INTERVAL '2 seconds'
		FROM generate_series(1, 8) AS g
	`;
	await sql`
		INSERT INTO feature_events (event, page, props, session_id, client_id, created_at)
		SELECT
			'net:change', '/test',
			'{"type":"3g","down":"05-1","rtt":"400-800"}'::jsonb,
			'e2e-admin-session-' || g, 'e2e-admin-client-' || g,
			NOW() - (g || ' hours')::interval - INTERVAL '1 second'
		FROM generate_series(1, 8) AS g
	`;
}

test('admin charts expose deterministic buckets and keep the tab on filter change', async ({
	page,
}, testInfo) => {
	// Direct API contract: one point per day/hour, comparison aligned.
	await page.goto('/admin');
	await expect(page.getByRole('button', { name: '24h', exact: true })).toHaveClass(/active/);
	await page.goto('/admin?tab=overview&days=7');
	await expect(page.locator('.tab-btn.active')).toHaveText('Overview');
	await expect(page.locator('.trend[data-window="7"]').first()).toBeVisible();
	await page.screenshot({ path: 'test-results/admin-overview.png', fullPage: true });

	for (const [days, granularity, points] of [
		[1, 'hour', 24],
		[7, 'day', 7],
		[30, 'day', 30],
		[90, 'day', 90],
	]) {
		const response = await page.request.get(`/api/admin/stats?days=${days}`);
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.series.granularity).toBe(granularity);
		expect(body.series.points).toHaveLength(points);
		expect(body.series.points.every((point) => Number.isFinite(point.requests))).toBe(true);
		expect(body.series.previousRequests).toHaveLength(points);
		expect(body.comparison.previous).not.toBeNull();
		if (days === 7) {
			expect(body.comparison.previous.total).toBeGreaterThan(0);
		}
	}

	const allTime = await (await page.request.get('/api/admin/stats?days=0')).json();
	expect(allTime.series.granularity).toBe('week');
	expect(allTime.comparison.previous).toBeNull();
	expect(allTime.overview.durationDays).toBe(0);

	const featureWeek = await (await page.request.get('/api/admin/feature-usage?days=7')).json();
	expect(featureWeek.trendGranularity).toBe('day');
	expect(featureWeek.trend).toHaveLength(7);
	expect(featureWeek.comparison.previous).not.toBeNull();

	const featureAll = await (await page.request.get('/api/admin/feature-usage?days=0')).json();
	expect(featureAll.trendGranularity).toBe('week');
	expect(featureAll.trend.length).toBeGreaterThan(0);

	const feature90 = await (await page.request.get('/api/admin/feature-usage?days=90')).json();
	expect(feature90.trendGranularity).toBe('week');

	const deviceAll = await (await page.request.get('/api/admin/device-network?days=0')).json();
	expect(deviceAll.identities).toBeGreaterThanOrEqual(8);

	const logsAll = await (await page.request.get('/api/admin/logs?days=0&limit=5')).json();
	expect(Array.isArray(logsAll.rows)).toBe(true);
	expect(logsAll.rows.length).toBeGreaterThan(0);

	// The regression: changing duration used to reset to Overview and leave
	// Engagement stale. Now the tab stays and its chart refetches.
	await page.goto('/admin?tab=engagement&days=7');
	await expect(page.locator('.tab-btn.active')).toHaveText('Engagement');
	await expect(page.locator('.trend[data-points="7"]')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Generation funnel' })).toBeVisible();
	await expect(page.getByText('Test submitted')).toBeVisible();
	await page.screenshot({ path: 'test-results/admin-engagement.png', fullPage: true });
	const featureResponse = page.waitForResponse(
		(response) =>
			response.url().includes('/api/admin/feature-usage?days=30') && response.status() === 200
	);
	await page.getByRole('button', { name: '30d', exact: true }).click();
	await featureResponse;
	await expect(page.locator('.tab-btn.active')).toHaveText('Engagement');
	await expect(page).toHaveURL(/tab=engagement/);
	await expect(page).toHaveURL(/days=30/);
	await expect(page.locator('.trend[data-window="30"]')).toBeVisible();

	// URL state survives a reload, not just an in-page transition.
	await page.reload();
	await expect(page.locator('.tab-btn.active')).toHaveText('Engagement');
	await expect(page).toHaveURL(/days=30/);
	await expect(page.locator('.trend[data-window="30"]')).toBeVisible();

	// Overview can surface the seeded 100%-error route and deep-link to Traffic.
	await page.goto('/admin?tab=overview&days=7');
	await expect(page.locator('.attention')).toContainText('/api/e2e-admin-broken');
	await page.locator('.attention').getByRole('button', { name: 'Open traffic' }).first().click();
	await expect(page.locator('.tab-btn.active')).toHaveText('Traffic');
	await expect(page.getByRole('heading', { name: 'Countries' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Agent families' })).toBeVisible();
	await page.screenshot({ path: 'test-results/admin-traffic.png', fullPage: true });
	await page.goBack();
	await expect(page.locator('.tab-btn.active')).toHaveText('Overview');

	// Manage combines the two operational panels.
	await page.getByRole('button', { name: 'Manage', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Premium access' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Exam patterns' })).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				buckets: { hour: 24, day7: 7, day30: 30, day90: 90, allTime: 'week' },
				featureTrendPoints: 7,
				tabRetainedOnFilterChange: true,
				reloadPreservedUrlState: true,
				backButtonRestoredTab: true,
				attentionRoute: '/api/e2e-admin-broken',
				managePanels: ['Premium access', 'Exam patterns'],
			},
			null,
			2
		),
	});
});

test('logs filter by status and route, and paginate', async ({ page }, testInfo) => {
	await page.goto('/admin?tab=logs&days=7');
	await expect(page.locator('.log-table')).toBeVisible();
	await page.screenshot({ path: 'test-results/admin-logs.png', fullPage: true });
	await page.getByLabel('Status').selectOption('5xx');
	await expect(page.locator('.status.danger').first()).toBeVisible();
	const statuses = await page.locator('.log-table tbody .status').allTextContents();
	expect(statuses.length).toBeGreaterThan(0);
	expect(statuses.every((value) => value.startsWith('5'))).toBe(true);

	await page.getByLabel('Route').selectOption('/api/e2e-admin-broken');
	await expect(page.locator('.log-table tbody tr')).toHaveCount(50);
	await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible();
	await page.getByRole('button', { name: 'Load more' }).click();
	await expect(page.locator('.log-table tbody tr')).toHaveCount(60);

	// Search and clear round-trip.
	await page.getByLabel('Search').fill('e2e-admin-');
	await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page).toHaveURL(/tab=logs/);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				statusFilter: '5xx',
				statusesObserved: statuses.length,
				routeFilter: '/api/e2e-admin-broken',
				firstPageRows: 50,
				afterLoadMoreRows: 60,
			},
			null,
			2
		),
	});
});

test('mobile uses the picker and charts never overflow', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('/admin?tab=overview&days=7');
	await expect(page.getByLabel('Admin section', { exact: true })).toBeVisible();
	await expect(page.locator('.desktop-tabs')).toBeHidden();
	await expect(page.locator('.trend').first()).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);

	await page.getByLabel('Admin section', { exact: true }).selectOption('reliability');
	await expect(page.locator('select[aria-label="Admin section"]')).toHaveValue('reliability');
	await expect(page.getByRole('heading', { name: 'Network mix' })).toBeVisible();
	await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.screenshot({ path: 'test-results/admin-mobile-dark.png', fullPage: true });
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				viewport: '375x812',
				horizontalOverflowPx: overflow,
				pickedTab: 'reliability',
				darkModeChecked: true,
			},
			null,
			2
		),
	});
});

test('empty API payloads render empty states instead of crashing', async ({ page }) => {
	await page.route(
		(url) => url.pathname === '/api/admin/device-network',
		(route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	);
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
	await page.goto('/admin?tab=reliability&days=7');
	await expect(page.getByText('No data in this window').first()).toBeVisible();
	expect(pageErrors).toEqual([]);
});
