<script>
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ADMIN_UNAUTHORIZED, adminFetch } from '#lib/client/adminApi.js';
	import {
		clampInputText,
		MAX_ADMIN_FIELD_CHARS,
		sanitizeInputText,
	} from '#lib/shared/inputLimits.js';
	import { t } from '#lib/client/i18n.js';
	import ConfirmDialog from '#lib/client/ConfirmDialog.svelte';
	import AdminToolbar from '#lib/client/admin/AdminToolbar.svelte';
	import AdminOverview from '#lib/client/admin/AdminOverview.svelte';
	import AdminTests from '#lib/client/admin/AdminTests.svelte';
	import AdminTraffic from '#lib/client/admin/AdminTraffic.svelte';
	import AdminEngagement from '#lib/client/admin/AdminEngagement.svelte';
	import AdminReliability from '#lib/client/admin/AdminReliability.svelte';
	import AdminLogs from '#lib/client/admin/AdminLogs.svelte';
	import AdminHealth from '#lib/client/admin/AdminHealth.svelte';
	import AdminManage from '#lib/client/admin/AdminManage.svelte';
	import {
		ADMIN_TAB_IDS,
		buildAdminSearch,
		parseAdminState,
	} from '#lib/client/admin/adminState.js';

	let authed = $state(false);
	let checking = $state(true);
	let loggingIn = $state(false);
	let username = $state('');
	let password = $state('');
	let error = $state('');

	let activeTab = $state('overview');
	let days = $state(1);
	let compare = $state(true);
	let healthWindow = $state(60);
	let logFilters = $state({ route: '', status: '', country: '', q: '' });

	let stats = $state(null);
	let featureUsage = $state(null);
	let deviceNetwork = $state(null);
	let logs = $state({ rows: [], nextBefore: null });
	let health = $state(null);
	let premiumGrants = $state(null);
	let examPatterns = $state(null);

	let premiumBusy = $state(false);
	let premiumMessage = $state('');
	let revokeTarget = $state(null);
	let patternBusyKey = $state('');
	let patternMessage = $state('');

	let loading = $state({
		stats: false,
		feature: false,
		device: false,
		logs: false,
		health: false,
	});
	let errors = $state({ stats: '', feature: '', device: '', logs: '', health: '' });
	let refreshedAt = $state(null);

	let loaded = $state({ statsDays: null, featureDays: null, deviceDays: null });
	const requestSeq = { stats: 0, feature: 0, device: 0, logs: 0, health: 0 };
	const controllers = { stats: null, feature: null, device: null, logs: null, health: null };
	let logSearchTimer = 0;

	function markUnauthorized() {
		authed = false;
	}

	function nextRequest(key) {
		requestSeq[key] += 1;
		controllers[key]?.abort();
		controllers[key] = new AbortController();
		return { token: requestSeq[key], signal: controllers[key].signal };
	}

	function current(key, token) {
		return requestSeq[key] === token;
	}

	async function loadStats({ force = false } = {}) {
		if (!force && stats && loaded.statsDays === days) return;
		const { token, signal } = nextRequest('stats');
		loading.stats = true;
		try {
			const data = await adminFetch(`/api/admin/stats?days=${days}`, {
				cache: 'no-store',
				signal,
				fallbackError: 'Failed to load stats',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED || !current('stats', token)) return;
			authed = true;
			stats = data;
			loaded.statsDays = days;
			errors.stats = '';
			error = '';
			refreshedAt = Date.now();
		} catch (caughtError) {
			if (caughtError?.name === 'AbortError' || !current('stats', token)) return;
			errors.stats = caughtError.message || 'Failed to load stats';
			if (!stats) error = errors.stats;
		} finally {
			if (current('stats', token)) loading.stats = false;
		}
	}

	async function loadFeature({ force = false } = {}) {
		if (!force && featureUsage && loaded.featureDays === days) return;
		const { token, signal } = nextRequest('feature');
		loading.feature = true;
		try {
			const data = await adminFetch(`/api/admin/feature-usage?days=${days}`, {
				cache: 'no-store',
				signal,
				fallbackError: 'Failed to load feature usage',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED || !current('feature', token)) return;
			featureUsage = data;
			loaded.featureDays = days;
			errors.feature = '';
			refreshedAt = Date.now();
		} catch (caughtError) {
			if (caughtError?.name === 'AbortError' || !current('feature', token)) return;
			errors.feature = caughtError.message || 'Failed to load feature usage';
		} finally {
			if (current('feature', token)) loading.feature = false;
		}
	}

	async function loadDevice({ force = false } = {}) {
		if (!force && deviceNetwork && loaded.deviceDays === days) return;
		const { token, signal } = nextRequest('device');
		loading.device = true;
		try {
			const data = await adminFetch(`/api/admin/device-network?days=${days}`, {
				cache: 'no-store',
				signal,
				fallbackError: 'Failed to load device stats',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED || !current('device', token)) return;
			deviceNetwork = data;
			loaded.deviceDays = days;
			errors.device = '';
			refreshedAt = Date.now();
		} catch (caughtError) {
			if (caughtError?.name === 'AbortError' || !current('device', token)) return;
			errors.device = caughtError.message || 'Failed to load device stats';
		} finally {
			if (current('device', token)) loading.device = false;
		}
	}

	async function loadLogs({ append = false } = {}) {
		const { token, signal } = nextRequest('logs');
		loading.logs = true;
		try {
			const params = new URLSearchParams({ days: String(days), limit: '50' });
			if (logFilters.route) params.set('route', logFilters.route);
			if (logFilters.status) params.set('status', logFilters.status);
			if (logFilters.country) params.set('country', logFilters.country);
			if (logFilters.q) params.set('q', logFilters.q);
			if (append && logs?.nextBefore) params.set('before', String(logs.nextBefore));
			const data = await adminFetch(`/api/admin/logs?${params.toString()}`, {
				cache: 'no-store',
				signal,
				fallbackError: 'Failed to load logs',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED || !current('logs', token)) return;
			logs = append
				? {
						rows: [...(logs?.rows || []), ...(data.rows || [])],
						nextBefore: data.nextBefore,
					}
				: { rows: data.rows || [], nextBefore: data.nextBefore };
			errors.logs = '';
			refreshedAt = Date.now();
		} catch (caughtError) {
			if (caughtError?.name === 'AbortError' || !current('logs', token)) return;
			errors.logs = caughtError.message || 'Failed to load logs';
		} finally {
			if (current('logs', token)) loading.logs = false;
		}
	}

	async function loadHealth() {
		const { token, signal } = nextRequest('health');
		loading.health = true;
		try {
			const data = await adminFetch(`/api/admin/health?window=${healthWindow}`, {
				cache: 'no-store',
				signal,
				fallbackError: 'Failed to load health',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED || !current('health', token)) return;
			health = data;
			errors.health = '';
			refreshedAt = Date.now();
		} catch (caughtError) {
			if (caughtError?.name === 'AbortError' || !current('health', token)) return;
			errors.health = caughtError.message || 'Failed to load health';
		} finally {
			if (current('health', token)) loading.health = false;
		}
	}

	async function loadPremium() {
		try {
			const data = await adminFetch('/api/admin/premium', {
				cache: 'no-store',
				fallbackError: 'Failed to load premium grants',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED) return;
			premiumGrants = data.grants || [];
		} catch (caughtError) {
			console.error(caughtError);
			premiumGrants = null;
		}
	}

	async function loadPatterns() {
		try {
			const data = await adminFetch('/api/admin/patterns', {
				cache: 'no-store',
				fallbackError: 'Failed to load patterns',
				onUnauthorized: markUnauthorized,
			});
			if (data === ADMIN_UNAUTHORIZED) return;
			examPatterns = data.patterns || [];
		} catch (caughtError) {
			console.error(caughtError);
			examPatterns = null;
		}
	}

	async function loadTab(tab, { force = false } = {}) {
		if (tab === 'health') {
			await loadHealth();
			return;
		}
		if (tab === 'manage') {
			await Promise.all([loadPremium(), loadPatterns()]);
			return;
		}
		await loadStats({ force });
		if (!authed) return;
		if (tab === 'overview') {
			await Promise.all([loadFeature({ force }), loadDevice({ force })]);
		} else if (tab === 'tests') {
			// stats carries the activity series and test breakdowns.
		} else if (tab === 'traffic') {
			// stats is the only dataset this tab needs.
		} else if (tab === 'engagement') {
			await loadFeature({ force });
		} else if (tab === 'reliability') {
			await loadDevice({ force });
		} else if (tab === 'logs') {
			await loadLogs();
		}
	}

	function syncUrl({ push = false } = {}) {
		if (typeof window === 'undefined') return;
		const search = buildAdminSearch({
			tab: activeTab,
			days,
			compare,
			window: healthWindow,
			...logFilters,
		});
		const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
		if (next === `${window.location.pathname}${window.location.search}`) return;
		void goto(next, {
			replace: !push,
			shallow: true,
			reset: false,
		}).catch((error) => {
			console.warn('admin goto failed', error?.message || error);
		});
	}

	function applyUrlState(state) {
		activeTab = state.tab;
		days = state.days;
		compare = state.compare;
		healthWindow = state.window;
		logFilters = {
			route: state.route,
			status: state.status,
			country: state.country,
			q: state.q,
		};
	}

	async function boot() {
		checking = true;
		try {
			await loadStats({ force: true });
			if (!authed) return;
			await loadTab(activeTab);
		} finally {
			checking = false;
		}
	}

	function setTab(tab) {
		if (!ADMIN_TAB_IDS.has(tab) || tab === activeTab) return;
		activeTab = tab;
		syncUrl({ push: true });
		void loadTab(tab);
	}

	function setDays(next) {
		if (next === days) return;
		days = next;
		loaded.statsDays = null;
		loaded.featureDays = null;
		loaded.deviceDays = null;
		if (activeTab === 'logs') logs = { rows: [], nextBefore: null };
		syncUrl();
		void loadTab(activeTab, { force: true });
	}

	function setCompare(next) {
		compare = next;
		syncUrl();
	}

	function setHealthWindow(next) {
		if (next === healthWindow) return;
		healthWindow = next;
		syncUrl();
		void loadHealth();
	}

	function setLogFilter(patch) {
		logFilters = { ...logFilters, ...patch };
		logs = { rows: [], nextBefore: null };
		syncUrl();
		clearTimeout(logSearchTimer);
		const delay = Object.keys(patch).includes('q') ? 300 : 0;
		logSearchTimer = setTimeout(() => void loadLogs(), delay);
	}

	function refresh() {
		if (activeTab === 'manage') {
			void Promise.all([loadPremium(), loadPatterns()]);
			return;
		}
		if (activeTab === 'health') {
			void loadHealth();
			return;
		}
		if (activeTab === 'logs') {
			void loadStats({ force: true });
			void loadLogs();
			return;
		}
		loaded.statsDays = null;
		loaded.featureDays = null;
		loaded.deviceDays = null;
		void loadTab(activeTab, { force: true });
	}

	function retry(source) {
		if (source === 'stats') void loadStats({ force: true });
		else if (source === 'feature') void loadFeature({ force: true });
		else if (source === 'device') void loadDevice({ force: true });
		else if (source === 'logs') void loadLogs();
		else if (source === 'health') void loadHealth();
	}

	async function login() {
		if (!username.trim() || !password || loggingIn) return;
		loggingIn = true;
		error = '';
		try {
			await adminFetch('/api/admin/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: username.trim(), password }),
				fallbackError: $t('adminInvalidCredentials'),
			});
			password = '';
			await boot();
		} catch (caughtError) {
			error = caughtError.message || $t('adminInvalidCredentials');
		} finally {
			loggingIn = false;
		}
	}

	async function logout() {
		await fetch('/api/admin/logout', { method: 'POST' });
		authed = false;
		stats = null;
		featureUsage = null;
		deviceNetwork = null;
		logs = { rows: [], nextBefore: null };
		health = null;
		premiumGrants = null;
		examPatterns = null;
		loaded = { statsDays: null, featureDays: null, deviceDays: null };
	}

	async function grantPremium(payload) {
		if (premiumBusy) return;
		premiumBusy = true;
		premiumMessage = '';
		try {
			await adminFetch('/api/admin/premium', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				fallbackError: 'Grant failed',
			});
			premiumMessage = `Granted access to ${payload.email}`;
			await loadPremium();
		} catch (caughtError) {
			premiumMessage = caughtError.message || 'Grant failed';
		} finally {
			premiumBusy = false;
		}
	}

	function revokePremium(userId) {
		revokeTarget = { userId };
	}

	async function confirmRevokePremium() {
		const target = revokeTarget;
		revokeTarget = null;
		if (!target) return;
		premiumBusy = true;
		premiumMessage = '';
		try {
			await adminFetch('/api/admin/premium', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'revoke', userId: target.userId }),
				fallbackError: 'Revoke failed',
			});
			await loadPremium();
		} catch (caughtError) {
			premiumMessage = caughtError.message || 'Revoke failed';
		} finally {
			premiumBusy = false;
		}
	}

	async function refreshPattern(patternKey) {
		if (patternBusyKey) return;
		patternBusyKey = patternKey;
		patternMessage = '';
		try {
			const data = await adminFetch('/api/admin/patterns', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ patternKey }),
				fallbackError: 'Refresh failed',
			});
			patternMessage = `Refreshed ${data.pattern?.examName || patternKey}`;
			await loadPatterns();
		} catch (caughtError) {
			patternMessage = caughtError.message || 'Refresh failed';
		} finally {
			patternBusyKey = '';
		}
	}

	function openLogs(status = '') {
		logFilters = { ...logFilters, status };
		activeTab = 'logs';
		syncUrl({ push: true });
		void loadStats();
		void loadLogs();
	}

	function onPopState() {
		applyUrlState(parseAdminState(window.location.search));
		void loadTab(activeTab);
	}

	$effect(() => {
		if (!authed || activeTab !== 'health') return;
		const interval = setInterval(() => void loadHealth(), 30000);
		return () => clearInterval(interval);
	});

	onMount(() => {
		applyUrlState(parseAdminState(window.location.search));
		window.addEventListener('popstate', onPopState);
		void boot();
		return () => {
			window.removeEventListener('popstate', onPopState);
			clearTimeout(logSearchTimer);
		};
	});

	onDestroy(() => {
		for (const controller of Object.values(controllers)) controller?.abort();
	});
</script>

<svelte:head>
	<title>Admin | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="app-container py-4">
	<div class="admin-wrap">
		<div class="d-flex align-items-center justify-content-between gap-2 mb-3">
			<h1 class="h3 fw-bold mb-0">{$t('adminStatsTitle')}</h1>
			{#if authed}
				<div class="d-flex gap-2">
					<button class="btn btn-sm btn-outline-danger" type="button" onclick={logout}>
						{$t('adminLogout')}
					</button>
				</div>
			{/if}
		</div>

		{#if checking && !stats}
			<div class="py-5 text-center">
				<div class="thinking-dots" role="status" aria-label={$t('loading')}>
					<span></span><span></span><span></span>
				</div>
			</div>
		{:else if !authed}
			<form
				class="admin-login bg-body border rounded-3 p-4 shadow-sm"
				onsubmit={(event) => {
					event.preventDefault();
					void login();
				}}
			>
				<h2 class="h5 fw-bold mb-3">{$t('adminLogin')}</h2>
				<label class="form-label"
					><span class="fw-semibold">{$t('adminUsername')}</span>
					<input
						class="form-control mt-1"
						bind:value={username}
						maxlength={MAX_ADMIN_FIELD_CHARS}
						oninput={(event) =>
							(username = sanitizeInputText(
								event.currentTarget.value,
								MAX_ADMIN_FIELD_CHARS
							))}
						autocomplete="username"
					/></label
				>
				<label class="form-label mt-3"
					><span class="fw-semibold">{$t('adminPassword')}</span>
					<input
						class="form-control mt-1"
						type="password"
						bind:value={password}
						maxlength={MAX_ADMIN_FIELD_CHARS}
						oninput={(event) =>
							(password = clampInputText(
								event.currentTarget.value,
								MAX_ADMIN_FIELD_CHARS
							))}
						autocomplete="current-password"
					/></label
				>
				{#if error}<div class="alert alert-danger mt-3 mb-0" role="alert">{error}</div>{/if}
				<button
					class="btn btn-primary w-full mt-3"
					type="submit"
					disabled={loggingIn || !username.trim() || !password}
				>
					{loggingIn ? $t('adminSigningIn') : $t('adminSignIn')}
				</button>
			</form>
		{:else}
			{#if error}<div class="alert alert-danger mb-3">{error}</div>{/if}

			<AdminToolbar
				{activeTab}
				{days}
				{compare}
				{healthWindow}
				{refreshedAt}
				loading={loading.stats ||
					loading.feature ||
					loading.device ||
					loading.logs ||
					loading.health}
				onTabChange={setTab}
				onDaysChange={setDays}
				onCompareChange={setCompare}
				onHealthWindowChange={setHealthWindow}
				onRefresh={refresh}
			/>

			{#if activeTab === 'overview'}
				<AdminOverview
					{stats}
					{featureUsage}
					{deviceNetwork}
					{days}
					{compare}
					{loading}
					{errors}
					onRetry={retry}
					onNavigate={setTab}
					onOpenLogs={openLogs}
				/>
			{:else if activeTab === 'tests'}
				<AdminTests {stats} {days} {loading} {errors} onRetry={retry} />
			{:else if activeTab === 'traffic'}
				<AdminTraffic {stats} {days} {compare} {loading} {errors} onRetry={retry} />
			{:else if activeTab === 'engagement'}
				<AdminEngagement
					{featureUsage}
					{days}
					{compare}
					{loading}
					{errors}
					onRetry={retry}
				/>
			{:else if activeTab === 'reliability'}
				<AdminReliability {deviceNetwork} {days} {loading} {errors} onRetry={retry} />
			{:else if activeTab === 'logs'}
				<AdminLogs
					{stats}
					{logs}
					filters={logFilters}
					{days}
					loading={loading.logs}
					error={errors.logs}
					onFilterChange={setLogFilter}
					onLoadMore={() => void loadLogs({ append: true })}
					onRetry={() => void loadLogs()}
				/>
			{:else if activeTab === 'health'}
				<AdminHealth
					{health}
					{healthWindow}
					loading={loading.health}
					error={errors.health}
					onRetry={() => void loadHealth()}
				/>
			{:else if activeTab === 'manage'}
				<AdminManage
					{premiumGrants}
					{premiumBusy}
					{premiumMessage}
					onGrant={grantPremium}
					onRevoke={revokePremium}
					{examPatterns}
					{patternBusyKey}
					{patternMessage}
					onRefreshPatterns={() => void loadPatterns()}
					onRefreshPattern={(key) => void refreshPattern(key)}
				/>
			{/if}
		{/if}
	</div>
</section>

{#if revokeTarget}
	<ConfirmDialog
		title="Revoke premium access?"
		body={`User ${revokeTarget.userId}`}
		confirmLabel="Revoke"
		cancelLabel="Cancel"
		onconfirm={confirmRevokePremium}
		oncancel={() => (revokeTarget = null)}
	/>
{/if}

<style>
	.admin-login {
		max-width: 420px;
	}
</style>
