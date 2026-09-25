<script>
	import { onMount } from 'svelte';
	import { getClientHeaders } from '$lib/client/identity';
	import { activeLanguage, t } from '$lib/client/i18n';

	let { testId } = $props();

	let stats = $state(null);

	// Shown once someone else has opened or taken the test, or when the
	// viewer has their own score to see. A fresh private test shows nothing.
	const visible = $derived.by(() => {
		if (!stats) {
			return false;
		}
		if (stats.viewer?.hasAttempted || stats.myAttempt) {
			return true;
		}
		const othersVisited = Number(stats.visitors || 0) - (stats.viewer?.hasVisited ? 1 : 0);
		const othersSubmitted =
			Number(stats.submissions || 0) - (stats.viewer?.hasAttempted ? 1 : 0);
		return othersVisited >= 1 || othersSubmitted >= 1;
	});

	const topScores = $derived((stats?.scores || []).slice(0, 5));
	const locale = $derived($activeLanguage === 'hindi' ? 'hi-IN' : 'en-IN');
	const dateFormatter = $derived(
		new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
	);

	function formatDate(value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
	}

	onMount(() => {
		let canceled = false;
		async function load() {
			try {
				const response = await fetch(`/api/test/stats?id=${encodeURIComponent(testId)}`, {
					cache: 'no-store',
					headers: getClientHeaders(),
				});
				if (!response.ok) {
					return;
				}
				const data = await response.json();
				if (!canceled) {
					stats = data;
				}
			} catch {
				// Stats are decorative; a failed fetch renders nothing.
			}
		}
		void load();
		return () => {
			canceled = true;
		};
	});
</script>

{#if visible}
	<section class="test-stats-card" aria-label={$t('testStatsTitle')}>
		<div class="test-stats-head">
			<h3 class="test-stats-title">{$t('testStatsTitle')}</h3>
			{#if stats.myAttempt}
				<span class="test-stats-my-score">
					{$t('yourScoreOnTest')}: {stats.myAttempt.score}/{stats.myAttempt.total}
				</span>
			{/if}
		</div>

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

		{#if topScores.length}
			<ul class="test-stats-scores">
				{#each topScores as score (score.createdAt + score.score)}
					<li class="test-stats-score-row" class:mine={score.isMine}>
						<span class="test-stats-score-name">{score.name || $t('someoneLabel')}</span>
						<span class="test-stats-score-value">{score.score}/{score.total}</span>
						<span class="test-stats-score-date">{formatDate(score.createdAt)}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<a class="test-stats-link" href={`/test/stats?id=${encodeURIComponent(testId)}`}>
			{$t('testStatsDetails')}
		</a>
	</section>
{/if}

<style>
	.test-stats-card {
		margin-top: 1rem;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.test-stats-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 10px;
	}

	.test-stats-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
	}

	.test-stats-my-score {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-brand-600);
		white-space: nowrap;
	}

	.test-stats-tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.test-stats-tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		border-radius: var(--radius-control);
		background: var(--surface-muted);
		text-align: center;
	}

	.test-stats-value {
		font-size: 1.15rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.test-stats-label {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.test-stats-scores {
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}

	.test-stats-score-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		border-top: 1px solid var(--line);
		font-size: 0.82rem;
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
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.test-stats-link {
		display: inline-block;
		margin-top: 10px;
		font-size: 0.82rem;
		font-weight: 600;
	}
</style>
