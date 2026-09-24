<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import { clampInputText, MAX_ADMIN_FIELD_CHARS, sanitizeInputText } from '$lib/shared/inputLimits';

	let authed = $state(false);
	let checking = $state(true);
	let loggingIn = $state(false);
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let stats = $state(null);
	let featureUsage = $state(null);
	let deviceNetwork = $state(null);
	let health = $state(null);
	let healthWindow = $state(60);
	let healthLoading = $state(false);
	let days = $state(1);
	let activeTab = $state('overview');

	const TABS = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'traffic', label: 'Traffic' },
		{ id: 'geo', label: 'Geo & Agents' },
		{ id: 'recent', label: 'Recent Events' },
		{ id: 'features', label: 'Feature Usage' },
		{ id: 'device', label: 'Device & Network' },
		{ id: 'health', label: 'Health' },
	];

	const HEALTH_WINDOWS = [
		{ value: 60, label: '1m' },
		{ value: 300, label: '5m' },
		{ value: 900, label: '15m' },
		{ value: 3600, label: '1h' },
	];

	const DURATION_OPTIONS = [
		{ value: 1, label: '24h' },
		{ value: 7, label: `7 ${$t('adminDaysShort')}` },
		{ value: 30, label: `30 ${$t('adminDaysShort')}` },
		{ value: 90, label: `90 ${$t('adminDaysShort')}` },
		{ value: 0, label: 'All time' },
	];

	onMount(() => {
		void loadAll();
	});

	$effect(() => {
		if (!authed || activeTab !== 'health') return;
		const interval = setInterval(() => void loadHealth(), 30000);
		return () => clearInterval(interval);
	});

	async function loadHealth() {
		healthLoading = true;
		try {
			const response = await fetch(`/api/admin/health?window=${healthWindow}`, {
				cache: 'no-store',
			});
			if (response.status === 401) {
				authed = false;
				return;
			}
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || 'Failed to load health');
			health = data;
		} catch (caughtError) {
			console.error(caughtError);
		} finally {
			healthLoading = false;
		}
	}

	async function loadAll() {
		await Promise.all([loadStats(), loadFeatureUsage(), loadDeviceNetwork()]);
	}

	async function loadDeviceNetwork() {
		if (activeTab !== 'device' && deviceNetwork) return;
		try {
			const durationDays = days > 0 ? days : 90;
			const response = await fetch(`/api/admin/device-network?days=${durationDays}`, {
				cache: 'no-store',
			});
			if (response.status === 401) {
				authed = false;
				return;
			}
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || 'Failed');
			deviceNetwork = data;
		} catch (caughtError) {
			console.error(caughtError);
			deviceNetwork = null;
		}
	}

	async function loadFeatureUsage() {
		if (activeTab !== 'features' && featureUsage) return;
		try {
			const durationDays = days > 0 ? days : 90;
			const response = await fetch(`/api/admin/feature-usage?days=${durationDays}`, {
				cache: 'no-store',
			});
			if (response.status === 401) {
				authed = false;
				return;
			}
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || 'Failed');
			featureUsage = data;
		} catch (caughtError) {
			console.error(caughtError);
			featureUsage = null;
		}
	}

	async function loadStats() {
		checking = true;
		error = '';
		try {
			const response = await fetch(`/api/admin/stats?days=${days}`, { cache: 'no-store' });
			if (response.status === 401) {
				authed = false;
				return;
			}
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || 'Failed to load stats');
			authed = true;
			stats = data;
		} catch (caughtError) {
			error = caughtError.message || 'Failed to load stats';
		} finally {
			checking = false;
		}
	}

	function switchTab(tabId) {
		activeTab = tabId;
		if (tabId === 'features' && !featureUsage) void loadFeatureUsage();
		if (tabId === 'device' && !deviceNetwork) void loadDeviceNetwork();
		if (tabId === 'health') void loadHealth();
	}

	async function login() {
		if (!username.trim() || !password || loggingIn) return;
		loggingIn = true;
		error = '';
		try {
			const response = await fetch('/api/admin/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: username.trim(), password }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || $t('adminInvalidCredentials'));
			password = '';
			await loadAll();
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
		health = null;
	}

	function onDurationChange() {
		activeTab = 'overview';
		void loadAll();
	}

	function formatTime(value) {
		if (!value) return '-';
		return new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function formatNumber(n) {
		if (n == null) return '0';
		return Number(n).toLocaleString();
	}

	function formatBytes(bytes) {
		if (bytes == null) return '-';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let value = Number(bytes);
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit += 1;
		}
		return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
	}

	function formatValue(value, suffix = '') {
		if (value == null) return '-';
		return `${value}${suffix}`;
	}

	function agentFamily(userAgent) {
		const ua = userAgent || '';
		if (/bot|crawler|spider|curl|wget|python-requests/i.test(ua)) return 'Bot';
		if (/mobi|android|iphone|ipad/i.test(ua)) return 'Mobile';
		return 'Desktop';
	}

	function hourLabel(bucket) {
		return new Date(bucket).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function dayLabel(value) {
		return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Admin | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="container py-4">
	<div class="mx-auto admin-wrap">
		<div class="d-flex align-items-center justify-content-between gap-2 mb-3">
			<h1 class="h3 fw-bold mb-0">{$t('adminStatsTitle')}</h1>
			{#if authed}
				<div class="d-flex gap-2">
					<button
						class="btn btn-sm btn-outline-secondary"
						type="button"
						onclick={() => void loadAll()}
						disabled={checking}
					>
						{$t('adminRefresh')}
					</button>
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
				{#if error}<div class="alert alert-danger mt-3 mb-0">{error}</div>{/if}
				<button
					class="btn btn-primary w-full mt-3"
					type="submit"
					disabled={loggingIn || !username.trim() || !password}
				>
					{loggingIn ? $t('adminSigningIn') : $t('adminSignIn')}
				</button>
			</form>
		{:else if stats}
			{#if error}<div class="alert alert-danger mb-3">{error}</div>{/if}

			<div class="d-flex flex-wrap align-items-center gap-2 mb-3">
				<span class="text-muted small">Duration:</span>
				{#each DURATION_OPTIONS as opt (opt.value)}
					<button
						class="btn btn-sm"
						class:btn-primary={days === opt.value}
						class:btn-outline-secondary={days !== opt.value}
						type="button"
						disabled={checking}
						onclick={() => {
							days = opt.value;
							onDurationChange();
						}}>{opt.label}</button
					>
				{/each}
			</div>

			<div class="tab-bar mb-4" role="tablist" aria-label={$t('adminFeatureUsage')}>
				{#each TABS as tab (tab.id)}
					<button
						class="tab-btn"
						class:active={activeTab === tab.id}
						role="tab"
						aria-selected={activeTab === tab.id}
						onclick={() => switchTab(tab.id)}>{tab.label}</button
					>
				{/each}
			</div>

			<!-- OVERVIEW TAB -->
			{#if activeTab === 'overview' && stats.overview}
				{@const o = stats.overview}
				<div class="stat-cards mb-4">
					<div class="bg-body border rounded-3 p-3">
						<strong>{formatNumber(stats.totals?.total)}</strong>
						<span>{$t('adminTotalRequests')}</span>
					</div>
					<div class="bg-body border rounded-3 p-3">
						<strong>{formatNumber(stats.totals?.errors)}</strong>
						<span>{$t('adminErrors')}</span>
					</div>
					<div class="bg-body border rounded-3 p-3">
						<strong>{stats.totals?.avg_duration_ms || 0} ms</strong>
						<span>{$t('adminAvgDuration')}</span>
					</div>
					<div class="bg-body border rounded-3 p-3">
						<strong
							>{formatNumber(
								stats.rateLimited?.reduce((sum, item) => sum + item.events, 0)
							)}</strong
						>
						<span>{$t('adminRateLimited')}</span>
					</div>
				</div>

				<h2 class="h6 fw-bold mb-2">Database Overview ({o.durationDays}d window)</h2>
				<div class="overview-grid mb-4">
					<div class="overview-card">
						<div class="overview-label">ai_test</div>
						<div class="overview-total">{formatNumber(o.tables.ai_test.total)}</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.ai_test.recent)} in period
						</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">attempts</div>
						<div class="overview-total">
							{formatNumber(o.tables.ai_test_attempts.total)}
						</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.ai_test_attempts.recent)} · avg {o.tables
								.ai_test_attempts.avg_score}%
						</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">users</div>
						<div class="overview-total">{formatNumber(o.tables.app_user.total)}</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.app_user.recent)} active
						</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">sessions</div>
						<div class="overview-total">
							{formatNumber(o.tables.app_user_session.active)}
						</div>
						<div class="overview-recent">active now</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">state users</div>
						<div class="overview-total">
							{formatNumber(o.tables.app_user_state.distinct_users)}
						</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.app_user_state.recent)} in period
						</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">rate limits</div>
						<div class="overview-total">
							{formatNumber(o.tables.api_rate_limit_events.total)}
						</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.api_rate_limit_events.recent)} in period
						</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">api events</div>
						<div class="overview-total">
							{formatNumber(o.tables.api_request_events.total)}
						</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.api_request_events.recent)} · {formatNumber(
								o.tables.api_request_events.errors
							)} errors
						</div>
					</div>
					<div class="overview-card">
						<div class="overview-label">feature events</div>
						<div class="overview-total">
							{formatNumber(o.tables.feature_events.total)}
						</div>
						<div class="overview-recent">
							+{formatNumber(o.tables.feature_events.recent)} · {formatNumber(
								o.tables.feature_events.sessions
							)} sessions
						</div>
					</div>
				</div>

				{#if o.testBreakdown?.byMode?.length || o.testBreakdown?.byDifficulty?.length || o.testBreakdown?.byLanguage?.length}
					<div class="row g-3 mb-4">
						{#if o.testBreakdown?.byMode?.length}
							<section class="col-md-4">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Tests by Mode</h3>
									{#each o.testBreakdown.byMode as item (item.test_mode)}
										<div
											class="d-flex justify-content-between align-items-center border-bottom py-2"
										>
											<span>{item.test_mode || '-'}</span><strong
												>{item.count}</strong
											>
										</div>
									{/each}
								</div>
							</section>
						{/if}
						{#if o.testBreakdown?.byDifficulty?.length}
							<section class="col-md-4">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Tests by Difficulty</h3>
									{#each o.testBreakdown.byDifficulty as item (item.difficulty)}
										<div
											class="d-flex justify-content-between align-items-center border-bottom py-2"
										>
											<span>{item.difficulty || '-'}</span><strong
												>{item.count}</strong
											>
										</div>
									{/each}
								</div>
							</section>
						{/if}
						{#if o.testBreakdown?.byLanguage?.length}
							<section class="col-md-4">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Tests by Language</h3>
									{#each o.testBreakdown.byLanguage as item (item.language)}
										<div
											class="d-flex justify-content-between align-items-center border-bottom py-2"
										>
											<span>{item.language || '-'}</span><strong
												>{item.count}</strong
											>
										</div>
									{/each}
								</div>
							</section>
						{/if}
					</div>
				{/if}

				{#if o.attemptStats}
					<div class="bg-body border rounded-3 p-3 mb-4">
						<h3 class="h6 fw-bold mb-2">Attempt Quality (period)</h3>
						<div class="d-flex flex-wrap gap-3">
							<span
								>Avg Score: <strong>{o.attemptStats.avg_score ?? '-'}%</strong
								></span
							>
							<span
								>Median Score: <strong>{o.attemptStats.median_score ?? '-'}%</strong
								></span
							>
							<span
								>Perfect Scores: <strong
									>{formatNumber(o.attemptStats.perfect_scores)}</strong
								></span
							>
						</div>
					</div>
				{/if}
			{/if}

			<!-- TRAFFIC TAB -->
			{#if activeTab === 'traffic'}
				<div class="bg-body border rounded-3 p-3 mb-4">
					<h2 class="h6 fw-bold mb-3">Requests ({days > 0 ? `${days}d` : 'all time'})</h2>
					{#if stats.hourly?.length}
						{@const maxRequests = Math.max(
							...stats.hourly.map((item) => item.requests),
							1
						)}
						<div class="hour-chart">
							{#each stats.hourly as item (item.bucket)}
								<div
									class="hour-bar"
									title={`${hourLabel(item.bucket)} — ${item.requests}`}
								>
									<div
										class="hour-bar-fill"
										style={`height: ${Math.max((item.requests / maxRequests) * 100, 3)}%`}
									></div>
									<span class="hour-bar-label">{item.requests}</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted small mb-0">{$t('adminEmpty')}</p>
					{/if}
				</div>

				<div class="row g-3">
					<section class="col-lg-6">
						<div class="bg-body border rounded-3 p-3">
							<h2 class="h6 fw-bold mb-2">{$t('adminByRoute')}</h2>
							<div class="table-responsive">
								<table class="admin-table">
									<thead
										><tr
											><th>{$t('adminColumnRoute')}</th><th
												>{$t('adminColumnRequests')}</th
											><th>{$t('adminErrors')}</th><th
												>{$t('adminAvgDuration')}</th
											></tr
										></thead
									>
									<tbody>
										{#each stats.byRoute || [] as item (item.route)}
											<tr
												><td class="mono">{item.route}</td><td
													>{formatNumber(item.requests)}</td
												><td>{formatNumber(item.errors)}</td><td
													>{item.avg_duration_ms} ms</td
												></tr
											>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					</section>
					<section class="col-lg-6">
						<div class="bg-body border rounded-3 p-3">
							<h2 class="h6 fw-bold mb-2">{$t('adminByStatus')}</h2>
							{#each stats.byStatus || [] as item (item.status_code)}
								<div
									class="d-flex justify-content-between align-items-center border-bottom py-2"
								>
									<span>{item.status_code ?? '-'}</span><strong
										>{formatNumber(item.requests)}</strong
									>
								</div>
							{/each}
							{#if !stats.byStatus?.length}<p class="text-muted small mb-0">
									{$t('adminEmpty')}
								</p>{/if}
						</div>
					</section>
				</div>
			{/if}

			<!-- GEO & AGENTS TAB -->
			{#if activeTab === 'geo'}
				<div class="row g-3">
					<section class="col-lg-6">
						<div class="bg-body border rounded-3 p-3">
							<h2 class="h6 fw-bold mb-2">{$t('adminByCountry')}</h2>
							{#each stats.byCountry || [] as item (item.country)}
								<div
									class="d-flex justify-content-between align-items-center border-bottom py-2"
								>
									<span>{item.country}</span><strong
										>{formatNumber(item.requests)}</strong
									>
								</div>
							{/each}
							{#if !stats.byCountry?.length}<p class="text-muted small mb-0">
									{$t('adminEmpty')}
								</p>{/if}
						</div>
					</section>
					<section class="col-lg-6">
						<div class="bg-body border rounded-3 p-3">
							<h2 class="h6 fw-bold mb-2">{$t('adminTopAgents')}</h2>
							{#each stats.topAgents || [] as item (item.user_agent)}
								<div
									class="d-flex justify-content-between align-items-start gap-2 border-bottom py-2"
								>
									<div class="min-w-0">
										<div class="small text-truncate mono">
											{item.user_agent}
										</div>
										<span class="badge text-bg-secondary"
											>{agentFamily(item.user_agent)}</span
										>
									</div>
									<strong>{formatNumber(item.requests)}</strong>
								</div>
							{/each}
							{#if !stats.topAgents?.length}<p class="text-muted small mb-0">
									{$t('adminEmpty')}
								</p>{/if}
						</div>
					</section>
				</div>
			{/if}

			<!-- RECENT EVENTS TAB -->
			{#if activeTab === 'recent'}
				<div class="bg-body border rounded-3 p-3 mb-4">
					<h2 class="h6 fw-bold mb-2">{$t('adminRecentEvents')}</h2>
					<div class="table-responsive">
						<table class="admin-table">
							<thead
								><tr
									><th>{$t('adminColumnTime')}</th><th
										>{$t('adminColumnRoute')}</th
									><th>{$t('adminColumnAction')}</th><th
										>{$t('adminColumnStatus')}</th
									><th>{$t('adminColumnDuration')}</th><th
										>{$t('adminColumnCountry')}</th
									><th>{$t('adminColumnCity')}</th><th
										>{$t('adminColumnClient')}</th
									></tr
								></thead
							>
							<tbody>
								{#each stats.recent || [] as item (item.id)}
									<tr>
										<td>{formatTime(item.created_at)}</td>
										<td class="mono">{item.route}</td>
										<td class="mono">{item.action || '-'}</td>
										<td>{item.status_code ?? '-'}</td>
										<td>{item.duration_ms ?? '-'}</td>
										<td>{item.ip_country || '-'}</td>
										<td>{item.ip_city || '-'}</td>
										<td class="mono"
											>{item.client_key
												? `${item.client_key.slice(0, 8)}…`
												: '-'}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if !stats.recent?.length}<p class="text-muted small mb-0">
							{$t('adminEmpty')}
						</p>{/if}
				</div>
			{/if}

			<!-- FEATURE USAGE TAB -->
			{#if activeTab === 'features'}
				<div class="bg-body border rounded-3 p-3 mb-4">
					<div
						class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"
					>
						<h2 class="h6 fw-bold mb-0">{$t('adminFeatureUsage')}</h2>
						<button
							class="btn btn-sm btn-outline-secondary"
							type="button"
							onclick={() => void loadFeatureUsage()}>{$t('adminRefresh')}</button
						>
					</div>
					{#if featureUsage}
						<div class="stat-cards mb-4">
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatNumber(featureUsage.totals?.total)}</strong><span
									>{$t('adminFeatureEvents')}</span
								>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatNumber(featureUsage.totals?.sessions)}</strong><span
									>{$t('adminFeatureSessions')}</span
								>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{featureUsage.totals?.events_per_session || 0}</strong><span
									>{$t('adminFeaturePerSession')}</span
								>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatNumber(featureUsage.byEvent?.length)}</strong><span
									>{$t('adminFeatureDistinct')}</span
								>
							</div>
						</div>
						<div class="row g-3 mb-4">
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">{$t('adminFeatureRanking')}</h3>
									{#each featureUsage.byEvent || [] as item (item.event)}
										{@const maxCount = featureUsage.byEvent?.[0]?.count || 1}
										<div class="mb-2">
											<div
												class="d-flex justify-content-between gap-2 small mb-1"
											>
												<span class="mono text-truncate">{item.event}</span>
												<span class="text-nowrap"
													><strong>{formatNumber(item.count)}</strong>
													<span class="text-muted"
														>({item.pct ?? 0}%)</span
													></span
												>
											</div>
											<div class="feature-bar">
												<div
													class="feature-bar-fill"
													style={`width: ${Math.max((item.count / maxCount) * 100, 2)}%`}
												></div>
											</div>
										</div>
									{/each}
									{#if !featureUsage.byEvent?.length}<p
											class="text-muted small mb-0"
										>
											{$t('adminEmpty')}
										</p>{/if}
								</div>
							</section>
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">{$t('adminFeatureTrend')}</h3>
									{#if featureUsage.trend?.length}
										{@const maxTrend = Math.max(
											...featureUsage.trend.map((item) => item.events),
											1
										)}
										<div class="hour-chart">
											{#each featureUsage.trend as item (item.day)}
												<div
													class="hour-bar"
													title={`${dayLabel(item.day)} — ${item.events} (${item.sessions} sessions)`}
												>
													<div
														class="hour-bar-fill"
														style={`height: ${Math.max((item.events / maxTrend) * 100, 3)}%`}
													></div>
													<span class="hour-bar-label"
														>{item.sessions}</span
													>
												</div>
											{/each}
										</div>
									{:else}<p class="text-muted small mb-0">
											{$t('adminEmpty')}
										</p>{/if}
								</div>
							</section>
						</div>
						<div class="row g-3">
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">{$t('adminFeatureByPage')}</h3>
									{#each featureUsage.byPage || [] as item (item.page)}
										<div
											class="d-flex justify-content-between align-items-center border-bottom py-2"
										>
											<span class="mono text-truncate pe-2">{item.page}</span
											><strong>{formatNumber(item.events)}</strong>
										</div>
									{/each}
									{#if !featureUsage.byPage?.length}<p
											class="text-muted small mb-0"
										>
											{$t('adminEmpty')}
										</p>{/if}
								</div>
							</section>
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">
										{$t('adminFeatureGenerateBreakdown')}
									</h3>
									<div class="table-responsive">
										<table class="admin-table">
											<thead
												><tr
													><th>{$t('adminFeatureMode')}</th><th
														>{$t('adminFeatureDifficulty')}</th
													><th>{$t('adminFeatureLanguage')}</th><th
														>{$t('adminFeatureCount')}</th
													></tr
												></thead
											>
											<tbody>
												{#each featureUsage.generateBreakdown || [] as item (`${item.mode}-${item.difficulty}-${item.language}`)}
													<tr
														><td class="mono">{item.mode}</td><td
															class="mono">{item.difficulty}</td
														><td class="mono">{item.language}</td><td
															>{formatNumber(item.count)}</td
														></tr
													>
												{/each}
											</tbody>
										</table>
									</div>
									{#if !featureUsage.generateBreakdown?.length}<p
											class="text-muted small mb-0"
										>
											{$t('adminEmpty')}
										</p>{/if}
								</div>
							</section>
						</div>
					{:else}
						<div class="py-4 text-center">
							<div class="thinking-dots" role="status">
								<span></span><span></span><span></span>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- DEVICE & NETWORK TAB -->
			{#if activeTab === 'device'}
				<div class="bg-body border rounded-3 p-3 mb-4">
					<div
						class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"
					>
						<h2 class="h6 fw-bold mb-0">Device &amp; network</h2>
						<button
							class="btn btn-sm btn-outline-secondary"
							type="button"
							onclick={() => void loadDeviceNetwork()}>Refresh</button
						>
					</div>
					{#if deviceNetwork}
						<div class="stat-cards mb-4">
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatNumber(deviceNetwork.identities)}</strong><span
									>profiled identities</span
								>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{deviceNetwork.coverage?.sharePct ?? '-'}%</strong><span
									>profile coverage</span
								>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{deviceNetwork.floor?.bucket ?? '-'}</strong><span
									>supported floor (Mbps)</span
								>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{deviceNetwork.floor?.failPct ?? '-'}%</strong><span
									>generate failure at floor</span
								>
							</div>
						</div>
						<div class="row g-3">
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Device tier (per identity)</h3>
									<div class="table-responsive">
										<table class="admin-table">
											<thead
												><tr
													><th>Tier</th><th>Identities</th><th
														>Share</th
													></tr
												></thead
											>
											<tbody>
												{#each deviceNetwork.tiers || [] as row (row.tier)}
													<tr
														><td class="mono">{row.tier}</td><td
															>{formatNumber(row.identities)}</td
														><td>{row.pct}%</td></tr
													>
												{/each}
											</tbody>
										</table>
									</div>
									{#if !deviceNetwork.tiers?.length}<p
											class="text-muted small mb-0"
										>
											{$t('adminEmpty')}
										</p>{/if}
								</div>
							</section>
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Top low-tier models</h3>
									<div class="table-responsive">
										<table class="admin-table">
											<thead
												><tr
													><th>Model</th><th>Android</th><th
														>Identities</th
													></tr
												></thead
											>
											<tbody>
												{#each deviceNetwork.topLowModels || [] as row (`${row.model}-${row.android}`)}
													<tr
														><td class="mono">{row.model}</td><td
															class="mono">{row.android}</td
														><td>{formatNumber(row.identities)}</td></tr
													>
												{/each}
											</tbody>
										</table>
									</div>
									{#if !deviceNetwork.topLowModels?.length}<p
											class="text-muted small mb-0"
										>
											{$t('adminEmpty')}
										</p>{/if}
								</div>
							</section>
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Network mix (worst per session)</h3>
									{#each [['type', 'Effective type'], ['downlink', 'Downlink (Mbps)'], ['rtt', 'RTT (ms)']] as [key, label] (key)}
										<h4 class="small fw-semibold mt-3 mb-1">{label}</h4>
										<div class="table-responsive">
											<table class="admin-table">
												<thead
													><tr
														><th>Bucket</th><th>Sessions</th><th
															>%</th
														></tr
													></thead
												>
												<tbody>
													{#each deviceNetwork.network?.[key] || [] as row (row.bucket)}
														<tr
															><td class="mono">{row.bucket}</td
															><td>{formatNumber(row.sessions)}</td
															><td>{row.pct}%</td></tr
														>
													{/each}
												</tbody>
											</table>
										</div>
									{/each}
								</div>
							</section>
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3 h-100">
									<h3 class="h6 fw-bold mb-2">Generate outcomes by downlink</h3>
									<div class="table-responsive">
										<table class="admin-table">
											<thead
												><tr
													><th>Downlink</th><th>Started</th><th
														>Failed</th
													><th>Fail %</th><th>Avg fail s</th></tr
												></thead
											>
											<tbody>
												{#each deviceNetwork.generateByDownlink || [] as row (row.bucket)}
													<tr
														><td class="mono">{row.bucket}</td
														><td>{formatNumber(row.started)}</td
														><td>{formatNumber(row.failed)}</td
														><td>{row.failRate ?? '-'}</td
														><td>{row.avgFailSeconds ?? '-'}</td></tr
													>
												{/each}
											</tbody>
										</table>
									</div>
								</div>
							</section>
						</div>
						{#if deviceNetwork.floor}
							<p class="text-muted small mt-3 mb-0">
								Supported floor: downlink {deviceNetwork.floor.bucket} Mbps (p10,
								covers {deviceNetwork.floor.coveragePct}% of sessions with a known
								downlink) · RTT p90 {deviceNetwork.floor.rttBucket ?? 'unknown'} ms ·
								generate failure at or below: {deviceNetwork.floor.failPct ?? '-'}%
								({deviceNetwork.floor.failedBelow}/{deviceNetwork.floor.startedBelow})
							</p>
						{/if}
					{:else}
						<div class="py-4 text-center">
							<div class="thinking-dots" role="status">
								<span></span><span></span><span></span>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- HEALTH TAB -->
			{#if activeTab === 'health'}
				<div class="bg-body border rounded-3 p-3 mb-4">
					<div
						class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"
					>
						<div class="d-flex align-items-center gap-2">
							<h2 class="h6 fw-bold mb-0">Live health</h2>
							{#if health}
								<span
									class="badge"
									class:text-bg-success={health.status === 'ok'}
									class:text-bg-warning={health.status !== 'ok'}
								>
									{health.status === 'ok' ? 'OK' : 'Degraded'}
								</span>
							{/if}
						</div>
						<div class="d-flex align-items-center gap-2">
							<div class="btn-group btn-group-sm" role="group" aria-label="Window">
								{#each HEALTH_WINDOWS as opt (opt.value)}
									<button
										class="btn"
										class:btn-primary={healthWindow === opt.value}
										class:btn-outline-secondary={healthWindow !== opt.value}
										type="button"
										onclick={() => {
											healthWindow = opt.value;
											void loadHealth();
										}}>{opt.label}</button
									>
								{/each}
							</div>
							<button
								class="btn btn-sm btn-outline-secondary"
								type="button"
								disabled={healthLoading}
								onclick={() => void loadHealth()}>Refresh</button
							>
						</div>
					</div>

					{#if health}
						<p class="text-muted small mb-3">
							Deployment:
							<span class="mono">
								{health.deployment?.provider || '-'} · {health.deployment?.environment ||
									'-'}
								{#if health.deployment?.region}· {health.deployment.region}{/if}
								{#if health.deployment?.commit}· {health.deployment.commit}{/if}
								{#if health.deployment?.branch}· {health.deployment.branch}{/if}
								{#if health.deployment?.runtime}· {health.deployment.runtime}{/if}
							</span>
						</p>

						{#if health.status !== 'ok'}
							<div class="alert alert-warning py-2 small mb-3">
								Some metrics could not be loaded. Check the database connection and
								server logs.
							</div>
						{/if}

						<div class="stat-cards mb-4">
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.requests?.requestsPerSecond)}</strong>
								<span>Requests/sec</span>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.requests?.avgLatencyMs, ' ms')}</strong>
								<span>Avg latency</span>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.requests?.p90LatencyMs, ' ms')}</strong>
								<span>p90 latency</span>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.requests?.p99LatencyMs, ' ms')}</strong>
								<span>p99 latency</span>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.requests?.errorRate, '%')}</strong>
								<span>Error rate</span>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.system?.cpu?.usagePercent, '%')}</strong>
								<span>CPU usage (per core)</span>
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatBytes(health.system?.memory?.rssBytes)}</strong>
								<span>Memory usage</span>
								{#if health.system?.memory?.rssPercentOfLimit != null}
									<span class="text-muted small">
										{health.system.memory.rssPercentOfLimit}% of {formatBytes(
											health.system.memory.limitBytes
										)}
									</span>
								{/if}
							</div>
							<div class="bg-body border rounded-3 p-3">
								<strong>{formatValue(health.database?.latencyMs, ' ms')}</strong>
								<span>DB latency</span>
							</div>
						</div>

						<div class="row g-3">
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3">
									<h3 class="h6 fw-bold mb-2">DB connections</h3>
									<div class="d-flex flex-wrap gap-3">
										<span
											>Total:
											<strong
												>{health.database?.connections?.total ?? '-'}</strong
											></span
										>
										<span
											>Active:
											<strong
												>{health.database?.connections?.active ?? '-'}</strong
											></span
										>
										<span
											>Idle:
											<strong
												>{health.database?.connections?.idle ?? '-'}</strong
											></span
										>
									</div>
									<p class="text-muted small mb-0 mt-2">
										Instance pool:
										{health.database?.connections?.instancePool?.total ?? '-'} total ·
										{health.database?.connections?.instancePool?.idle ?? '-'} idle ·
										{health.database?.connections?.instancePool?.waiting ?? '-'} waiting
									</p>
								</div>
							</section>
							<section class="col-lg-6">
								<div class="bg-body border rounded-3 p-3">
									<h3 class="h6 fw-bold mb-2">Health</h3>
									<p class="text-muted small mb-0">
										CPU and memory are for the serverless instance that served this
										request. Requests and database metrics span all instances.
									</p>
									<p class="text-muted small mb-0 mt-2">
										Deployment: {health.deployment?.environment || '-'}
										{#if health.deployment?.region}· {health.deployment.region}{/if}
									</p>
								</div>
							</section>
						</div>
					{:else}
						<div class="py-4 text-center">
							<div class="thinking-dots" role="status">
								<span></span><span></span><span></span>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.admin-wrap {
		max-width: 1120px;
	}
	.admin-login {
		max-width: 420px;
	}

	.tab-bar {
		display: flex;
		gap: 0;
		border-bottom: 2px solid var(--line);
	}
	.tab-btn {
		padding: 10px 18px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}
	.tab-btn:hover {
		color: var(--text);
	}
	.tab-btn.active {
		color: var(--brand-text);
		border-bottom-color: var(--brand-text);
	}

	.stat-cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	.stat-cards > div,
	.overview-card {
		display: flex;
		min-height: 72px;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		text-align: center;
	}
	.stat-cards strong,
	.overview-total {
		font-size: 1.25rem;
		font-weight: 700;
	}
	.stat-cards span {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.overview-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}
	.overview-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 0.75rem;
		padding: 12px 8px;
		min-height: 76px;
	}
	.overview-label {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-muted);
	}
	.overview-recent {
		color: var(--text-muted);
		font-size: 0.65rem;
		margin-top: 2px;
	}

	.hour-chart {
		display: flex;
		height: 140px;
		align-items: flex-end;
		gap: 3px;
	}
	.hour-bar {
		display: flex;
		flex: 1;
		min-width: 0;
		height: 100%;
		align-items: center;
		flex-direction: column;
		justify-content: flex-end;
		gap: 2px;
	}
	.hour-bar-fill {
		width: 100%;
		min-height: 3px;
		border-radius: 4px 4px 0 0;
		background: var(--color-brand-600);
	}
	.hour-bar-label {
		color: var(--text-muted);
		font-size: 0.65rem;
	}

	.feature-bar {
		height: 8px;
		overflow: hidden;
		border-radius: 4px;
		background: color-mix(in srgb, var(--line) 60%, transparent);
	}
	.feature-bar-fill {
		height: 100%;
		border-radius: 4px;
		background: var(--color-brand-600);
	}

	.admin-table {
		width: 100%;
		font-size: 0.85rem;
		border-collapse: collapse;
	}
	.admin-table th {
		padding: 8px 10px;
		text-align: left;
		border-bottom: 1px solid var(--line);
		color: var(--text-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}
	.admin-table td {
		padding: 7px 10px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
		white-space: nowrap;
	}
	.admin-table tr:last-child td {
		border-bottom: 0;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.78rem;
	}
	.min-w-0 {
		min-width: 0;
	}

	@media (max-width: 767.98px) {
		.stat-cards,
		.overview-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.tab-btn {
			padding: 10px 12px;
			font-size: 0.78rem;
		}
	}
</style>
