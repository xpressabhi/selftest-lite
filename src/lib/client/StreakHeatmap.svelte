<script>
	import Icon from '$lib/client/Icon.svelte';
	import { t } from '$lib/client/i18n';
	import { buildStreakGrid } from '$lib/client/learning';

	let { streak = null, locale = 'en' } = $props();

	const grid = $derived(buildStreakGrid(streak?.streakHistory, { locale }));
	const hasActivity = $derived(grid.weeks.some((week) => week.some((cell) => cell.active)));
	const monthLabelByIndex = $derived(
		new Map(grid.monthLabels.map((entry) => [entry.index, entry.label]))
	);
</script>

<section class="streak-card" aria-label={$t('streaks')}>
	<header class="streak-head">
		<div>
			<p class="streak-kicker">{$t('dayStreak')}</p>
			<p class="streak-current">
				<span class="streak-current-value">{streak?.currentStreak || 0}</span>
				<span class="streak-current-unit">{$t('streakDaysUnit')}</span>
			</p>
		</div>
		<span class="streak-flame">
			<Icon name="flame" size={26} />
		</span>
	</header>

	<p class="streak-meta">
		<span>{$t('best')}: {streak?.longestStreak || 0}</span>
		<span>{$t('streakFreezes')}: {streak?.freezesRemaining || 0}</span>
		<span>{$t('streakTotalDays')}: {streak?.totalQuizDays || 0}</span>
	</p>

	<div class="streak-grid-wrap" role="img" aria-label={$t('streakGridLabel')}>
		<div class="streak-months" aria-hidden="true">
			{#each grid.weeks as _week, index (_week[0].date)}
				<span>{monthLabelByIndex.get(index) || ''}</span>
			{/each}
		</div>
		<div class="streak-grid" aria-hidden="true">
			{#each grid.weeks as week (week[0].date)}
				<div class="streak-col">
					{#each week as cell (cell.date)}
						<span
							class="streak-cell"
							class:active={cell.active}
							class:today={cell.isToday}
							class:future={cell.isFuture}
							class:level-2={cell.quizCount === 2}
							class:level-3={cell.quizCount >= 3}
							title={`${cell.date}: ${cell.quizCount}`}
						></span>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<p class="streak-explainer">{$t('streakExplainer')}</p>
	{#if !hasActivity}
		<p class="streak-empty">{$t('streakEmpty')}</p>
	{/if}
</section>

<style>
	.streak-card {
		margin-bottom: 16px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.streak-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.streak-kicker {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.streak-current {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin: 4px 0 0;
	}

	.streak-current-value {
		font-size: 28px;
		font-weight: 700;
		line-height: 1;
		color: var(--color-brand-600);
	}

	.streak-current-unit {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}

	.streak-flame {
		display: flex;
		color: var(--warn);
	}

	.streak-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 8px 0 10px;
		font-size: 12px;
		color: var(--text-muted);
	}

	.streak-grid-wrap {
		overflow-x: auto;
	}

	.streak-months {
		display: flex;
		gap: 3px;
		margin-bottom: 4px;
		font-size: 10px;
		color: var(--text-muted);
	}

	.streak-months span {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
	}

	.streak-grid {
		display: flex;
		gap: 3px;
		min-width: 210px;
	}

	.streak-col {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-direction: column;
		gap: 3px;
	}

	.streak-cell {
		display: block;
		aspect-ratio: 1;
		border: 1px solid var(--line);
		border-radius: 3px;
		background: var(--surface-muted);
	}

	.streak-cell.active {
		border-color: var(--color-brand-300);
		background: var(--color-brand-100);
	}

	.streak-cell.level-2 {
		background: var(--color-brand-300);
	}

	.streak-cell.level-3 {
		border-color: var(--color-brand-600);
		background: var(--color-brand-600);
	}

	.streak-cell.today {
		outline: 2px solid var(--color-brand-600);
		outline-offset: 1px;
	}

	.streak-cell.future {
		opacity: 0.35;
	}

	.streak-explainer {
		margin: 10px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}

	.streak-empty {
		margin: 4px 0 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-brand-600);
	}
</style>
