<script>
	let { items = [], onNavigate = () => {} } = $props();
</script>

<section class="attention" aria-label="Needs attention">
	<div class="attention-head">
		<h2>Needs attention</h2>
		{#if items.length === 0}
			<span class="all-clear">No anomalies in this window</span>
		{/if}
	</div>
	{#if items.length > 0}
		<ul>
			{#each items as item (item.title + item.detail)}
				<li class="attention-item {item.tone || 'warn'}">
					<div>
						<strong>{item.title}</strong>
						<span>{item.detail}</span>
					</div>
					<button type="button" onclick={() => onNavigate(item.tab)}
						>{item.cta || 'Open'}</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.attention {
		display: grid;
		gap: 8px;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.attention-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	h2 {
		margin: 0;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 600;
	}

	.all-clear {
		color: var(--ok);
		font-size: 0.72rem;
		font-weight: 600;
	}

	ul {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.attention-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		background: rgba(var(--tone-rgb), 0.07);
	}

	.attention-item.danger {
		--tone-rgb: var(--danger-rgb);
		--tone-ink: var(--danger);
	}

	.attention-item.warn {
		--tone-rgb: var(--warn-rgb);
		--tone-ink: var(--warn);
	}

	.attention-item > div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 8px;
		min-width: 0;
	}

	.attention-item strong {
		color: var(--tone-ink);
		font-size: 0.74rem;
	}

	.attention-item span {
		color: var(--text-muted);
		font-size: 0.72rem;
		overflow-wrap: anywhere;
	}

	.attention-item button {
		flex: none;
		min-height: 32px;
		padding: 4px 9px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
	}

	@media (max-width: 640px) {
		.attention-item {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
