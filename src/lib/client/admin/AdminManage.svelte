<script>
	import { formatTime } from '#lib/client/formatting.js';

	let {
		premiumGrants = null,
		premiumBusy = false,
		premiumMessage = '',
		onGrant = () => {},
		onRevoke = () => {},
		examPatterns = null,
		patternBusyKey = '',
		patternMessage = '',
		onRefreshPatterns = () => {},
		onRefreshPattern = () => {},
	} = $props();

	let email = $state('');
	let expiry = $state('');
	let notes = $state('');

	function submit(event) {
		event.preventDefault();
		if (!email.trim() || premiumBusy) return;
		void onGrant({
			email: email.trim(),
			expiresAt: expiry ? new Date(expiry).toISOString() : null,
			notes: notes.trim() || null,
		}).then(() => {
			email = '';
			expiry = '';
			notes = '';
		});
	}
</script>

<section class="manage">
	<div class="panel">
		<header>
			<div>
				<h2>Premium access</h2>
				<p>Grant or revoke premium features for a user.</p>
			</div>
		</header>
		<form class="grant-form" onsubmit={submit}>
			<label>
				<span>User email</span>
				<input type="email" bind:value={email} required />
			</label>
			<label>
				<span>Expires (optional)</span>
				<input type="date" bind:value={expiry} />
			</label>
			<label>
				<span>Notes</span>
				<input type="text" maxlength="200" bind:value={notes} />
			</label>
			<button type="submit" disabled={premiumBusy || !email.trim()}>
				{premiumBusy ? 'Working…' : 'Grant'}
			</button>
		</form>
		{#if premiumMessage}<p class="message">{premiumMessage}</p>{/if}
		{#if premiumGrants}
			<div class="table-wrap">
				<table class="admin-table">
					<thead>
						<tr>
							<th>User</th>
							<th>Feature</th>
							<th>Status</th>
							<th>Granted</th>
							<th>Expires</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each premiumGrants as grant (grant.id)}
							<tr>
								<td>
									{grant.email || `user #${grant.user_id}`}
									{#if grant.name}<span class="muted">· {grant.name}</span>{/if}
								</td>
								<td>{grant.feature}</td>
								<td>{grant.status}</td>
								<td>{formatTime(grant.granted_at)}</td>
								<td>{grant.expires_at ? formatTime(grant.expires_at) : 'never'}</td>
								<td>
									{#if grant.status === 'active'}
										<button
											type="button"
											class="small"
											disabled={premiumBusy}
											onclick={() => onRevoke(grant.user_id)}
										>
											Revoke
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="muted">No grants yet.</p>
		{/if}
	</div>

	<div class="panel">
		<header>
			<div>
				<h2>Exam patterns</h2>
				<p>Cached official exam structures.</p>
			</div>
			<button type="button" class="small" onclick={() => onRefreshPatterns()}>
				Refresh list
			</button>
		</header>
		{#if patternMessage}<p class="message">{patternMessage}</p>{/if}
		{#if examPatterns}
			{#if examPatterns.length === 0}
				<p class="muted">No patterns cached yet.</p>
			{:else}
				<div class="table-wrap">
					<table class="admin-table">
						<thead>
							<tr>
								<th>Key</th>
								<th>Exam</th>
								<th>Year</th>
								<th>Sections</th>
								<th>Fetched</th>
								<th>Expires</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each examPatterns as pattern (pattern.patternKey)}
								<tr>
									<td class="mono muted">{pattern.patternKey}</td>
									<td>{pattern.examName || '-'}</td>
									<td>{pattern.patternYear || '-'}</td>
									<td>{pattern.sectionCount}</td>
									<td>{formatTime(pattern.fetchedAt)}</td>
									<td>{formatTime(pattern.expiresAt)}</td>
									<td>
										<button
											type="button"
											class="small"
											disabled={!pattern.refreshable ||
												patternBusyKey === pattern.patternKey}
											onclick={() => onRefreshPattern(pattern.patternKey)}
										>
											Refresh
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else}
			<p class="muted">Failed to load patterns.</p>
		{/if}
	</div>
</section>

<style>
	.manage {
		display: grid;
		gap: 12px;
	}

	.panel {
		display: grid;
		gap: 12px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}

	h2 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}

	header p {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.grant-form {
		display: grid;
		grid-template-columns: minmax(180px, 1.2fr) minmax(140px, 0.8fr) minmax(160px, 1fr) auto;
		align-items: end;
		gap: 10px;
	}

	.grant-form label {
		display: grid;
		gap: 3px;
	}

	.grant-form span {
		color: var(--text-muted);
		font-size: 0.65rem;
		font-weight: 600;
	}

	.grant-form input {
		min-height: 38px;
		padding: 6px 9px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.78rem;
	}

	.grant-form button,
	button.small {
		min-height: 36px;
		padding: 5px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.grant-form button {
		border-color: var(--brand-text);
		background: var(--brand-text);
		color: var(--surface);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.message {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	.muted {
		color: var(--text-muted);
	}

	.table-wrap {
		overflow-x: auto;
	}

	.admin-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.admin-table th {
		padding: 7px 9px;
		border-bottom: 1px solid var(--line);
		color: var(--text-muted);
		font-size: 0.66rem;
		text-align: left;
		white-space: nowrap;
	}

	.admin-table td {
		padding: 7px 9px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}

	.admin-table tr:last-child td {
		border-bottom: 0;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
	}

	@media (max-width: 767.98px) {
		.grant-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (pointer: coarse) {
		.grant-form input,
		.grant-form button,
		button.small {
			min-height: 44px;
		}
	}
</style>
