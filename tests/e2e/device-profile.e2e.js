import { expect, test } from '@playwright/test';

// Device & network telemetry suite: stub low-end hardware and a slow
// connection in real Chrome, import the collector from the dev server, and
// verify the buckets, the emission lifecycle, and the wired beacon path.
// Spec: docs/superpowers/specs/2026-09-24-device-network-telemetry-design.md

const COLLECTOR_PATH = '/src/lib/client/deviceProfile.js';

async function installStubs(page) {
	await page.addInitScript(() => {
		const connection = new EventTarget();
		Object.assign(connection, {
			effectiveType: '3g',
			downlink: 0.7,
			rtt: 350,
			saveData: false,
			type: 'cellular',
		});
		Object.defineProperty(navigator, 'connection', {
			get: () => connection,
			configurable: true,
		});
		Object.defineProperty(navigator, 'deviceMemory', { get: () => 1, configurable: true });
		Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4, configurable: true });
		Object.defineProperty(navigator, 'userAgentData', {
			get: () => ({
				platform: 'Android',
				getHighEntropyValues: async () => ({ model: 'Redmi 9A', platformVersion: '11.0.0' }),
			}),
			configurable: true,
		});
	});
}

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		errors.push(message.text());
	});
	page.on('pageerror', (error) => {
		errors.push(String(error?.message || error));
	});
	return errors;
}

test('collector maps stubbed low-end hardware and a slow network to buckets', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await installStubs(page);
	await page.goto('/');

	const result = await page.evaluate(async (modulePath) => {
		const module = await import(modulePath);
		return {
			profile: await module.collectDeviceProfile(),
			network: module.collectNetworkSnapshot(),
		};
	}, COLLECTOR_PATH);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(result, null, 2),
	});
	expect(result.profile).toMatchObject({
		tier: 'low',
		ramGb: 1,
		cores: '3-4',
		model: 'redmi 9a',
		android: '11',
		platform: 'android',
	});
	expect(result.network).toMatchObject({
		type: '3g',
		down: '05-1',
		rtt: '200-400',
		save: false,
		wifi: 'cellular',
	});
	expect(errors).toEqual([]);
});

test('tracker emits one profile and one net:change across a connection flip', async ({
	page,
}, testInfo) => {
	await installStubs(page);
	await page.goto('/');

	const emitted = await page.evaluate(async (modulePath) => {
		const module = await import(modulePath);
		const events = [];
		module.startDeviceProfileTracking((event, props) => events.push({ event, props }));
		// Wait out the 400 ms client-hints race before the first assertion.
		await new Promise((resolve) => setTimeout(resolve, 700));
		const connection = navigator.connection;
		connection.effectiveType = '2g';
		connection.downlink = 0.3;
		connection.rtt = 600;
		connection.dispatchEvent(new Event('change'));
		// Wait out the 1.5 s debounce.
		await new Promise((resolve) => setTimeout(resolve, 2000));
		return events;
	}, COLLECTOR_PATH);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(emitted, null, 2),
	});
	const profile = emitted.find((entry) => entry.event === 'device:profile');
	const changes = emitted.filter((entry) => entry.event === 'net:change');
	expect(profile?.props).toMatchObject({ tier: 'low', type: '3g', down: '05-1' });
	expect(changes).toHaveLength(1);
	expect(changes[0].props).toMatchObject({ type: '2g', down: '025-05', rtt: '400-800' });
});

test('the wired app beacons a device:profile on unload', async ({ page }, testInfo) => {
	await installStubs(page);
	const batches = [];
	await page.route('**/api/telemetry', async (route) => {
		try {
			batches.push(JSON.parse(route.request().postData() || '{}'));
		} catch {
			batches.push({});
		}
		await route.fulfill({ status: 204, body: '' });
	});
	await page.route(
		(url) => url.pathname === '/api/test' || url.pathname === '/api/user/history',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ tests: [], attempts: [], hasMore: false }),
			})
	);

	// app.localhost resolves to loopback but is not treated as localhost by the
	// telemetry client, so the real queue → beacon path runs while the route
	// above keeps the batch out of the database.
	await page.goto('http://app.localhost:5174/');
	await expect(page.locator('.planner-panel')).toBeVisible();
	// The panel is SSR-visible before Svelte hydrates, and the flush listener is
	// registered on mount; wait for hydration before firing pagehide.
	await page.waitForFunction(
		() => Boolean(document.querySelector('.intent-input')?.__svelte_meta),
		undefined,
		{ timeout: 15000 }
	);
	// Navigating away can tear the page down before the beacon is observable;
	// dispatching pagehide exercises the same flush path deterministically.
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	await expect.poll(() => batches.length, { timeout: 5000 }).toBeGreaterThan(0);

	const events = batches.flatMap((batch) => batch.events || []);
	const profile = events.find((entry) => entry.event === 'device:profile');
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ events: events.map((entry) => entry.event), profile }, null, 2),
	});
	expect(profile?.props).toMatchObject({ tier: 'low', type: '3g', down: '05-1' });
});
