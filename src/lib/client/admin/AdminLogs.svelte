<script>
	import { formatNumber, formatTime } from '#lib/client/formatting.js';
	import { windowLabel } from './adminState.js';

	let {
		stats = null,
		logs = { rows: [], nextBefore: null },
		filters = { route: '', status: '', country: '', q: '' },
		days = 1,
		loading = false,
		error = '',
		onFilterChange = () => {},
		onLoadMore = () => {},
		onRetry = () => {},
	} = $props();

	const rows = $derived(logs?.rows || []);
	const routes = $derived((stats?.byRoute || []).map((row) => row.route));
	const countries = $derived((stats?.byCountry || []).map((row) => row.country));
	const hasFilters = $derived(
		Boolean(filters.route || filters.status || filters.country || filters.q)
	);

	function statusClass(code) {
		const value = Number(code);
		if (value >= 500) return 'danger';
		if (value >= 400) return 'warn';
		if (value >= 300) return 'neutral';
		if (value >= 200) return 'ok';
		return 'neutral';
	}
</script>

<section class="logs">
	<div class="log-filters">
		<label>
			<span>Route</span>
			<select
				value={filters.route}
				onchange={(event) => onFilterChange({ route: event.currentTarget.value })}
			>
				<option value="">All routes</option>
				{#each routes as route (route)}
					<option value={route}>{route}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Status</span>
			<select
				value={filters.status}
				onchange={(event) => onFilterChange({ status: event.currentTarget.value })}
			>
				<option value="">Any status</option>
				<option value="2xx">2xx success</option>
				<option value="3xx">3xx redirect</option>
				<option value="4xx">4xx client error</option>
				<option value="429">429 rate limited</option>
				<option value="5xx">5xx server error</option>
				<option value="other">Other</option>
			</select>
		</label>
		<label>
			<span>Country</span>
			<select
				value={filters.country}
				onchange={(event) => onFilterChange({ country: event.currentTarget.value })}
			>
				<option value="">All countries</option>
				{#each countries as country (country)}
					<option value={country}>{country}</option>
				{/each}
			</select>
		</label>
		<label class="search">
			<span>Search</span>
			<input
				type="search"
				placeholder="route, client or error"
				maxlength="80"
				value={filters.q}
				oninput={(event) => onFilterChange({ q: event.currentTarget.value })}
			/>
		</label>
		{#if hasFilters}
			<button
				type="button"
				class="clear"
				onclick={() => onFilterChange({ route: '', status: '', country: '', q: '' })}
			>
				Clear
			</button>
		{/if}
	</div>

	<div class="log-head">
		<div>
			<h2>Request logs</h2>
			<p>
				{windowLabel(days)} · showing {formatNumber(rows.length)} rows
				{#if logs?.nextBefore}· more available{/if}
			</p>
		</div>
		<button type="button" class="retry" onclick={() => onRetry()} disabled={loading}>
			{loading ? 'Loading…' : 'Refresh'}
		</button>
	</div>

	{#if error}
		<div class="log-error" role="status">
			<span>{error}</span>
			<button type="button" onclick={() => onRetry()}>Retry</button>
		</div>
	{/if}

	<div class="table-wrap">
		<table class="log-table" data-window={String(days)}>
			<thead>
				<tr>
					<th>Time</th>
					<th>Route</th>
					<th>Action</th>
					<th>Status</th>
					<th>Duration</th>
					<th>Country</th>
					<th>City</th>
					<th>Client</th>
					<th>Payload</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr>
						<td>{formatTime(row.created_at)}</td>
						<td class="mono">{row.route}</td>
						<td class="mono">{row.action || '-'}</td>
						<td>
							<span class="status {statusClass(row.status_code)}"
								>{row.status_code ?? '-'}</span
							>
						</td>
						<td>{row.duration_ms ?? '-'} ms</td>
						<td>{row.ip_country || '-'}</td>
						<td>{row.ip_city || '-'}</td>
						<td class="mono"
							>{row.client_key ? `${row.client_key.slice(0, 8)}…` : '-'}</td
						>
						<td>
							{#if row.has_payload}
								<a
									class="payload-link"
									href={`/api/admin/jev-audit?id=${row.id}`}
									target="_blank"
									rel="noopener">View</a
								>
							{:else}
								-
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="9" class="empty">
							{loading ? 'Loading request logs…' : 'No requests match these filters.'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if logs?.nextBefore}
		<div class="more">
			<button type="button" onclick={() => onLoadMore()} disabled={loading}>
				{loading ? 'Loading…' : 'Load more'}
			</button>
		</div>
	{/if}
</section>

<style>
	.logs {
		display: grid;
		gap: 12px;
	}

	.log-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 8px 10px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.log-filters label {
		display: grid;
		gap: 3px;
		min-width: 140px;
	}

	.log-filters label.search {
		flex: 1 1 200px;
	}

	.log-filters span {
		color: var(--text-muted);
		font-size: 0.65rem;
		font-weight: 600;
	}

	.log-filters select,
	.log-filters input {
		min-height: 36px;
		padding: 5px 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.75rem;
	}

	.clear {
		min-height: 36px;
		padding: 5px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.log-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.log-head h2 {
		margin: 0;
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.log-head p {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.retry {
		min-height: 34px;
		padding: 4px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.retry:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	.log-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		background: rgba(var(--danger-rgb), 0.08);
		color: var(--danger);
		font-size: 0.72rem;
	}

	.log-error button {
		border: 1px solid currentColor;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.log-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}

	.log-table th {
		padding: 8px 10px;
		border-bottom: 1px solid var(--line);
		color: var(--text-muted);
		font-size: 0.66rem;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}

	.log-table td {
		padding: 7px 10px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}

	.log-table tr:last-child td {
		border-bottom: 0;
	}

	.log-table td.empty {
		padding: 24px;
		color: var(--text-muted);
		text-align: center;
	}

	.payload-link {
		color: var(--brand-text);
		font-weight: 600;
		text-decoration: underline;
	}

	.status {
		padding: 1px 6px;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
	}

	.status.ok {
		color: var(--ok);
		background: rgba(var(--ok-rgb), 0.1);
	}

	.status.warn {
		color: var(--warn);
		background: rgba(var(--warn-rgb), 0.1);
	}

	.status.danger {
		color: var(--danger);
		background: rgba(var(--danger-rgb), 0.1);
	}

	.status.neutral {
		color: var(--text-muted);
		background: rgba(var(--text-rgb), 0.06);
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
	}

	.more {
		display: flex;
		justify-content: center;
	}

	.more button {
		min-height: 38px;
		padding: 6px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.more button:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	@media (max-width: 639px) {
		.log-filters label {
			width: 100%;
		}

		.log-filters label.search {
			flex-basis: 100%;
		}
	}

	@media (pointer: coarse) {
		.log-filters select,
		.log-filters input,
		.clear,
		.retry,
		.more button {
			min-height: 44px;
		}
	}
</style>
