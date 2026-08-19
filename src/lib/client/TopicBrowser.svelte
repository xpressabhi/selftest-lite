<script>
	import { t } from '$lib/client/i18n';
	import { TOPIC_CATEGORIES } from '$lib/shared/constants';

	let { selectedCategory = '', selectedTopics = [], ontopicchange = () => {} } = $props();

	let expanded = $state(false);
	let showAllCategories = $state(false);
	const ALL_CATEGORIES = Object.entries(TOPIC_CATEGORIES);
	const CATEGORIES = $derived(showAllCategories ? ALL_CATEGORIES : ALL_CATEGORIES.slice(0, 4));

	function toggleCategory(cat) {
		const next = selectedCategory === cat ? '' : cat;
		ontopicchange('selectedCategory', next);
	}

	function toggleTopic(topicName) {
		const next = selectedTopics.includes(topicName)
			? selectedTopics.filter((t) => t !== topicName)
			: [...selectedTopics, topicName];
		ontopicchange('selectedTopics', next);
	}
</script>

<div class="topic-browser">
	<button class="browser-toggle" type="button" onclick={() => (expanded = !expanded)}>
		<span class="toggle-icon" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
		<span class="toggle-label">{$t('browseTopics')}</span>
		{#if selectedTopics.length > 0}
			<span class="toggle-count">{selectedTopics.length} {$t('unitsSelected')}</span>
		{/if}
	</button>

	{#if expanded}
		<div class="browser-body">
			<div class="category-grid">
				{#each CATEGORIES as [category, topics] (category)}
					<button
						class="category-btn"
						class:selected={selectedCategory === category}
						type="button"
						onclick={() => toggleCategory(category)}
					>
						{category}
					</button>
					{#if selectedCategory === category}
						<div class="topic-chips">
							{#each topics as topicName (topicName)}
								<button
									class="topic-chip"
									class:active={selectedTopics.includes(topicName)}
									type="button"
									onclick={() => toggleTopic(topicName)}
								>
									{topicName}
								</button>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
			{#if ALL_CATEGORIES.length > 4}
				<button
					class="show-more-btn"
					type="button"
					onclick={() => (showAllCategories = !showAllCategories)}
				>
					{showAllCategories ? $t('hideList') : $t('showAllCategories')}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.topic-browser {
		margin-top: 12px;
	}

	.browser-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 0;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s ease;
		min-height: 44px;
	}

	.browser-toggle:hover {
		color: var(--text);
	}

	.toggle-icon {
		font-size: 0.8rem;
		width: 16px;
		text-align: center;
	}

	.toggle-count {
		font-size: 0.72rem;
		color: rgb(var(--brand-rgb));
		margin-left: auto;
	}

	.browser-body {
		animation: slide-in 0.2s ease;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.category-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 4px 0 8px;
	}

	.category-btn {
		padding: 8px 16px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			color 0.15s ease;
		min-height: 44px;
	}

	.category-btn:hover {
		border-color: rgb(var(--brand-rgb));
		color: rgb(var(--brand-rgb));
	}

	.category-btn.selected {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.08);
		color: rgb(var(--brand-rgb));
	}

	.topic-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		width: 100%;
	}

	.topic-chip {
		padding: 8px 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			color 0.15s ease;
		min-height: 44px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.topic-chip:hover {
		border-color: rgb(var(--brand-rgb));
		color: rgb(var(--brand-rgb));
	}

	.topic-chip.active {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.1);
		color: rgb(var(--brand-rgb));
		font-weight: 600;
	}

	.show-more-btn {
		padding: 4px 8px;
		border: 0;
		background: transparent;
		color: rgb(var(--brand-rgb));
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		min-height: 44px;
	}
</style>
