<script>
	import {
		ADMIN_TABS,
		DURATION_OPTIONS,
		HEALTH_WINDOWS,
		isInsightTab,
		supportsCompare,
	} from './adminState.js';

	let {
		activeTab = 'overview',
		days = 1,
		compare = true,
		healthWindow = 60,
		loading = false,
		refreshedAt = null,
		onTabChange = () => {},
		onDaysChange = () => {},
		onCompareChange = () => {},
		onHealthWindowChange = () => {},
		onRefresh = () => {},
	} = $props();

	let shareState = $state('');
	let shareTimer = 0;

	const groups = $derived([
		{ label: 'Insights', tabs: ADMIN_TABS.filter((tab) => tab.group === 'Insights') },
		{ label: 'Ops', tabs: ADMIN_TABS.filter((tab) => tab.group === 'Ops') },
	]);
	const updatedLabel = $derived(
		refreshedAt
			? new Date(refreshedAt).toLocaleTimeString(undefined, {
					hour: '2-digit',
					minute: '2-digit',
				})
			: ''
	);

	async function share() {
		clearTimeout(shareTimer);
		try {
			await navigator.clipboard.writeText(window.location.href);
			shareState = 'Link copied';
		} catch {
			shareState = 'Copy failed';
		}
		shareTimer = setTimeout(() => (shareState = ''), 2200);
	}
</script>

<div class="admin-toolbar">
	<nav class="desktop-tabs" aria-label="Admin sections">
		{#each groups as group (group.label)}
			{@const first = group.tabs[0]?.id}
			<span class="group-label" aria-hidden="true">{group.label}</span>
			{#each group.tabs as tab (tab.id)}
				<button
					type="button"
					class="tab-btn"
					class:active={activeTab === tab.id}
					aria-current={activeTab === tab.id ? 'page' : undefined}
					data-tab={tab.id}
					data-first={first === tab.id ? 'true' : undefined}
					onclick={() => onTabChange(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		{/each}
	</nav>

	<label class="mobile-picker">
		<span>View</span>
		<select
			aria-label="Admin section"
			value={activeTab}
			onchange={(event) => onTabChange(event.currentTarget.value)}
		>
			{#each groups as group (group.label)}
				<optgroup label={group.label}>
					{#each group.tabs as tab (tab.id)}
						<option value={tab.id}>{tab.label}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>

	<div class="filter-row">
		{#if isInsightTab(activeTab) || activeTab === 'logs'}
			<div class="segmented" role="group" aria-label="Duration">
				{#each DURATION_OPTIONS as option (option.value)}
					<button
						type="button"
						class:active={days === option.value}
						aria-pressed={days === option.value}
						onclick={() => onDaysChange(option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>
		{:else if activeTab === 'health'}
			<div class="segmented" role="group" aria-label="Health window">
				{#each HEALTH_WINDOWS as option (option.value)}
					<button
						type="button"
						class:active={healthWindow === option.value}
						aria-pressed={healthWindow === option.value}
						onclick={() => onHealthWindowChange(option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>
			<span class="scope-note">Auto-refreshes every 30s</span>
		{:else if activeTab === 'manage'}
			<span class="scope-note">Not time-scoped · admin actions</span>
		{/if}

		{#if supportsCompare(activeTab)}
			<button
				type="button"
				class="compare"
				class:active={compare}
				role="switch"
				aria-checked={compare}
				onclick={() => onCompareChange(!compare)}
			>
				<span class="switch-track" aria-hidden="true"><span></span></span>
				Compare
			</button>
		{/if}

		<div class="toolbar-end">
			{#if updatedLabel}<span class="updated">Updated {updatedLabel}</span>{/if}
			<button type="button" class="tool-button" onclick={share}>
				{shareState || 'Share'}
			</button>
			<button
				type="button"
				class="tool-button"
				onclick={onRefresh}
				disabled={loading}
				aria-label="Refresh dashboard"
			>
				{loading ? 'Refreshing…' : 'Refresh'}
			</button>
		</div>
	</div>
</div>

<style>
	.admin-toolbar {
		display: grid;
		gap: 10px;
		margin-bottom: 16px;
	}

	.desktop-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		border-bottom: 2px solid var(--line);
	}

	.group-label {
		margin: 0 6px 0 4px;
		color: var(--text-muted);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.group-label:not(:first-child) {
		margin-left: 14px;
	}

	.tab-btn {
		min-height: 40px;
		padding: 8px 12px;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tab-btn:hover {
		color: var(--text);
	}

	.tab-btn.active {
		border-bottom-color: var(--brand-text);
		color: var(--brand-text);
	}

	.mobile-picker {
		display: none;
		align-items: center;
		gap: 8px;
	}

	.mobile-picker span {
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
	}

	.mobile-picker select {
		width: 100%;
		min-height: 44px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.85rem;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.segmented {
		display: inline-flex;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.segmented button {
		min-height: 32px;
		padding: 4px 10px;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.segmented button:hover {
		color: var(--text);
	}

	.segmented button.active {
		background: var(--brand-text);
		color: var(--surface);
	}

	.compare {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 36px;
		padding: 4px 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.compare.active {
		color: var(--text);
	}

	.switch-track {
		position: relative;
		width: 26px;
		height: 15px;
		border-radius: 999px;
		background: var(--line);
		transition: background var(--motion-fast) ease;
	}

	.switch-track span {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 11px;
		height: 11px;
		border-radius: 999px;
		background: var(--surface);
		transition: transform var(--motion-fast) var(--ease-out);
	}

	.compare.active .switch-track {
		background: var(--brand-text);
	}

	.compare.active .switch-track span {
		transform: translateX(11px);
	}

	.scope-note,
	.updated {
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.toolbar-end {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}

	.tool-button {
		min-height: 36px;
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

	.tool-button:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	@media (max-width: 767.98px) {
		.desktop-tabs {
			display: none;
		}

		.mobile-picker {
			display: flex;
		}

		.toolbar-end {
			margin-left: 0;
		}

		.updated {
			display: none;
		}

		.segmented {
			max-width: 100%;
			overflow-x: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.switch-track,
		.switch-track span {
			transition: none;
		}
	}

	@media (pointer: coarse) {
		.segmented button,
		.compare,
		.tool-button,
		.mobile-picker select {
			min-height: 44px;
		}
	}
</style>
