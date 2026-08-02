<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';

	let authed = $state(false);
	let checking = $state(true);
	let loggingIn = $state(false);
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let stats = $state(null);

	onMount(() => {
		void loadStats();
	});

	async function loadStats() {
		checking = true;
		error = '';
		try {
			const response = await fetch('/api/admin/stats', { cache: 'no-store' });
			if (response.status === 401) {
				authed = false;
				return;
			}
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to load stats');
			}
			authed = true;
			stats = data;
		} catch (caughtError) {
			error = caughtError.message || 'Failed to load stats';
		} finally {
			checking = false;
		}
	}

	async function login() {
		if (!username.trim() || !password || loggingIn) {
			return;
		}
		loggingIn = true;
		error = '';
		try {
			const response = await fetch('/api/admin/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					username: username.trim(),
					password,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || $t('adminInvalidCredentials'));
			}
			password = '';
			await loadStats();
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
	}

	function formatTime(value) {
		if (!value) {
			return '-';
		}
		const date = new Date(value);
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function agentFamily(userAgent) {
		const ua = userAgent || '';
		if (/bot|crawler|spider|curl|wget|python-requests/i.test(ua)) {
			return 'Bot';
		}
		if (/mobi|android|iphone|ipad/i.test(ua)) {
			return 'Mobile';
		}
		return 'Desktop';
	}

	function hourLabel(bucket) {
		const date = new Date(bucket);
		return date.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
		});
	}
</script>

<svelte:head>
	<title>Admin | selftest.in</title>
</svelte:head>

<section class="container py-4">
	<div class="mx-auto admin-wrap">
		<div class="d-flex align-items-center justify-content-between gap-2 mb-4">
			<h1 class="h3 fw-bold mb-0">{$t('adminStatsTitle')}</h1>
			{#if authed}
				<div class="d-flex gap-2">
					<button class="btn btn-sm btn-outline-secondary" type="button" onclick={() => void loadStats()} disabled={checking}>
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
				<div class="spinner-border text-primary" role="status"></div>
			</div>
		{:else if !authed}
			<form class="admin-login bg-body border rounded-3 p-4 shadow-sm" onsubmit={(event) => { event.preventDefault(); void login(); }}>
				<h2 class="h5 fw-bold mb-3">{$t('adminLogin')}</h2>
				<label class="form-label">
					<span class="fw-semibold">{$t('adminUsername')}</span>
					<input class="form-control mt-1" bind:value={username} autocomplete="username" />
				</label>
				<label class="form-label mt-3">
					<span class="fw-semibold">{$t('adminPassword')}</span>
					<input class="form-control mt-1" type="password" bind:value={password} autocomplete="current-password" />
				</label>
				{#if error}
					<div class="alert alert-danger mt-3 mb-0">{error}</div>
				{/if}
				<button class="btn btn-primary w-full mt-3" type="submit" disabled={loggingIn || !username.trim() || !password}>
					{loggingIn ? $t('adminSigningIn') : $t('adminSignIn')}
				</button>
			</form>
		{:else if stats}
			{#if error}
				<div class="alert alert-danger mb-3">{error}</div>
			{/if}

			<div class="stat-cards mb-4">
				<div class="bg-body border rounded-3 p-3">
					<strong>{stats.totals?.total || 0}</strong>
					<span>{$t('adminTotalRequests')}</span>
				</div>
				<div class="bg-body border rounded-3 p-3">
					<strong>{stats.totals?.errors || 0}</strong>
					<span>{$t('adminErrors')}</span>
				</div>
				<div class="bg-body border rounded-3 p-3">
					<strong>{stats.totals?.avg_duration_ms || 0} ms</strong>
					<span>{$t('adminAvgDuration')}</span>
				</div>
				<div class="bg-body border rounded-3 p-3">
					<strong>{stats.rateLimited?.reduce((sum, item) => sum + item.events, 0) || 0}</strong>
					<span>{$t('adminRateLimited')}</span>
				</div>
			</div>

			<div class="bg-body border rounded-3 p-3 mb-4">
				<h2 class="h6 fw-bold mb-3">{$t('adminLast24h')}</h2>
				{#if stats.hourly?.length}
					{@const maxRequests = Math.max(...stats.hourly.map((item) => item.requests), 1)}
					<div class="hour-chart">
						{#each stats.hourly as item (item.bucket)}
							<div class="hour-bar" title={`${hourLabel(item.bucket)} — ${item.requests}`}>
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

			<div class="row g-3 mb-4">
				<section class="col-lg-6">
					<div class="bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold mb-2">{$t('adminByRoute')}</h2>
						<div class="table-responsive">
							<table class="admin-table">
								<thead>
									<tr>
										<th>{$t('adminColumnRoute')}</th>
										<th>{$t('adminColumnRequests')}</th>
										<th>{$t('adminErrors')}</th>
										<th>{$t('adminAvgDuration')}</th>
									</tr>
								</thead>
								<tbody>
									{#each stats.byRoute || [] as item (item.route)}
										<tr>
											<td class="mono">{item.route}</td>
											<td>{item.requests}</td>
											<td>{item.errors}</td>
											<td>{item.avg_duration_ms} ms</td>
										</tr>
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
							<div class="d-flex justify-content-between align-items-center border-bottom py-2">
								<span>{item.status_code ?? '-'}</span>
								<strong>{item.requests}</strong>
							</div>
						{/each}
						{#if !(stats.byStatus?.length)}
							<p class="text-muted small mb-0">{$t('adminEmpty')}</p>
						{/if}
					</div>
				</section>
			</div>

			<div class="row g-3 mb-4">
				<section class="col-lg-6">
					<div class="bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold mb-2">{$t('adminByCountry')}</h2>
						{#each stats.byCountry || [] as item (item.country)}
							<div class="d-flex justify-content-between align-items-center border-bottom py-2">
								<span>{item.country}</span>
								<strong>{item.requests}</strong>
							</div>
						{/each}
						{#if !(stats.byCountry?.length)}
							<p class="text-muted small mb-0">{$t('adminEmpty')}</p>
						{/if}
					</div>
				</section>
				<section class="col-lg-6">
					<div class="bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold mb-2">{$t('adminTopAgents')}</h2>
						{#each stats.topAgents || [] as item (item.user_agent)}
							<div class="d-flex justify-content-between align-items-start gap-2 border-bottom py-2">
								<div class="min-w-0">
									<div class="small text-truncate mono">{item.user_agent}</div>
									<span class="badge text-bg-secondary">{agentFamily(item.user_agent)}</span>
								</div>
								<strong>{item.requests}</strong>
							</div>
						{/each}
						{#if !(stats.topAgents?.length)}
							<p class="text-muted small mb-0">{$t('adminEmpty')}</p>
						{/if}
					</div>
				</section>
			</div>

			<div class="bg-body border rounded-3 p-3 mb-4">
				<h2 class="h6 fw-bold mb-2">{$t('adminRecentEvents')}</h2>
				<div class="table-responsive">
					<table class="admin-table">
						<thead>
							<tr>
								<th>{$t('adminColumnTime')}</th>
								<th>{$t('adminColumnRoute')}</th>
								<th>{$t('adminColumnAction')}</th>
								<th>{$t('adminColumnStatus')}</th>
								<th>{$t('adminColumnDuration')}</th>
								<th>{$t('adminColumnCountry')}</th>
								<th>{$t('adminColumnCity')}</th>
								<th>{$t('adminColumnClient')}</th>
							</tr>
						</thead>
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
									<td class="mono">{item.client_key ? `${item.client_key.slice(0, 8)}…` : '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if !(stats.recent?.length)}
					<p class="text-muted small mb-0">{$t('adminEmpty')}</p>
				{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.admin-wrap {
		max-width: 960px;
	}

	.admin-login {
		max-width: 420px;
	}

	.stat-cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.stat-cards div {
		display: flex;
		min-height: 72px;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		text-align: center;
	}

	.stat-cards strong {
		font-size: 1.25rem;
	}

	.stat-cards span {
		color: var(--text-muted);
		font-size: 0.75rem;
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
		.stat-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
