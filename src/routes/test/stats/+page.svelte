<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getClientHeaders } from '#lib/client/identity.js';
	import { activeLanguage, t } from '#lib/client/i18n.js';
	import { formatDate } from '#lib/client/formatting.js';

	let stats = $state(null);
	let loading = $state(true);
	let error = $state('');

	const testId = $derived(page.url.searchParams.get('id'));
	const maxDaily = $derived(
		Math.max(1, ...(stats?.daily || []).map((day) => Math.max(day.visits, day.submissions)))
	);

	onMount(async () => {
		if (!testId) {
			error = $t('testStatsNotFound');
			loading = false;
			return;
		}
		try {
			const response = await fetch(`/api/test/stats?id=${encodeURIComponent(testId)}`, {
				cache: 'no-store',
				headers: getClientHeaders(),
			});
			if (!response.ok) {
				error = $t('testStatsNotFound');
				return;
			}
			stats = await response.json();
		} catch {
			error = $t('testStatsNotFound');
		} finally {
			loading = false;
		}
	});
</script>

<section class="app-container py-4 test-stats-page">
	<a class="stats-back" href="/history">← {$t('history')}</a>
	<h1 class="text-page mb-1">{$t('testStatsTitle')}</h1>
	<p class="text-muted small mb-4">
		{$t('testStatsPageSubtitle', { id: testId || '' })}
	</p>

	{#if loading}
		<div class="test-stats-tiles" role="status" aria-label={$t('testStatsLoading')}>
			{#each [1, 2, 3] as tile (tile)}
				<div class="test-stats-skeleton-tile"></div>
			{/each}
		</div>
	{:else if error}
		<p class="text-danger small">{error}</p>
		<div class="d-flex flex-wrap gap-2 mt-2">
			<a class="btn btn-outline-primary" href="/history">{$t('history')}</a>
			<a class="btn btn-outline-secondary" href="/">{$t('startNewTest')}</a>
		</div>
	{:else if stats}
		<div class="test-stats-tiles">
			<div class="test-stats-tile" data-metric="visitors">
				<span class="test-stats-value">{stats.visitors}</span>
				<span class="test-stats-label">{$t('testVisitors')}</span>
			</div>
			<div class="test-stats-tile" data-metric="inProgress">
				<span class="test-stats-value">{stats.inProgress}</span>
				<span class="test-stats-label">{$t('testInProgress')}</span>
			</div>
			<div class="test-stats-tile" data-metric="submissions">
				<span class="test-stats-value">{stats.submissions}</span>
				<span class="test-stats-label">{$t('testSubmissions')}</span>
			</div>
		</div>

		{#if stats.myAttempt}
			<p class="test-stats-own">
				{$t('yourScoreOnTest')}:
				<strong>{stats.myAttempt.score}/{stats.myAttempt.total}</strong>
			</p>
		{/if}

		<h2 class="text-section mt-4 mb-2">{$t('testStatsDaily')}</h2>
		<figure class="test-stats-daily-figure">
			<div class="test-stats-daily" aria-hidden="true">
				{#each stats.daily as day (day.date)}
					<div class="test-stats-day" title={`${day.date}: ${day.visits}/${day.submissions}`}>
						<span
							class="test-stats-day-bar"
							style={`height: ${Math.max(4, Math.round((Math.max(day.visits, day.submissions) / maxDaily) * 100))}%`}
						></span>
					</div>
				{/each}
			</div>
			<ul class="visually-hidden">
				{#each stats.daily as day (day.date)}
					<li>
						{formatDate(day.date, $activeLanguage, { day: 'numeric', month: 'short' })}:
						{day.visits}
						{$t('testVisitors')},
						{day.submissions}
						{$t('testSubmissions')}
					</li>
				{/each}
			</ul>
		</figure>

		<h2 class="text-section mt-4 mb-2">{$t('testStatsScores')}</h2>
		{#if stats.scores.length}
			<ul class="test-stats-scores">
				{#each stats.scores as score (score.createdAt + score.score)}
					<li class="test-stats-score-row" class:mine={score.isMine}>
						<span class="test-stats-score-name">{score.name || $t('someoneLabel')}</span
						>
						<span class="test-stats-score-value">{score.score}/{score.total}</span>
						<span class="test-stats-score-date"
							>{formatDate(score.createdAt, $activeLanguage, {
								day: 'numeric',
								month: 'short',
							})}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-muted small">{$t('testStatsNoScores')}</p>
		{/if}

		<div class="d-flex flex-wrap gap-2 mt-4">
			<a class="btn btn-outline-primary" href={`/test?id=${encodeURIComponent(testId || '')}`}>
				{$t('openTest')}
			</a>
			{#if stats.myAttempt}
				<a
					class="btn btn-outline-secondary"
					href={`/results?id=${encodeURIComponent(testId || '')}`}
				>
					{$t('viewResults')}
				</a>
			{/if}
		</div>
	{/if}
</section>

<style>
	.stats-back {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
	}

	.stats-back:hover {
		color: var(--brand-text);
	}

	.test-stats-skeleton-tile {
		height: 64px;
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
		animation: stats-pulse 1s ease-in-out infinite alternate;
	}

	@keyframes stats-pulse {
		from {
			opacity: 0.6;
		}
		to {
			opacity: 1;
		}
	}

	.test-stats-tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.test-stats-tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		text-align: center;
	}

	.test-stats-value {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.test-stats-label {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.test-stats-own {
		margin: 12px 0 0;
		font-size: 0.9rem;
	}

	.test-stats-daily {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 72px;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.test-stats-day {
		display: flex;
		flex: 1;
		min-width: 0;
		height: 100%;
		align-items: flex-end;
	}

	.test-stats-day-bar {
		display: block;
		width: 100%;
		border-radius: 3px;
		background: var(--color-brand-600);
	}

	.test-stats-scores {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.test-stats-score-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.9rem;
	}

	.test-stats-score-row.mine .test-stats-score-name {
		font-weight: 700;
		color: var(--color-brand-600);
	}

	.test-stats-score-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.test-stats-score-value {
		font-weight: 700;
	}

	.test-stats-score-date {
		color: var(--text-muted);
		font-size: 0.78rem;
		white-space: nowrap;
	}
</style>
