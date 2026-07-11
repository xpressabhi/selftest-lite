<script>
	import { onMount } from 'svelte';
	import { LOCAL_STORAGE_CHANGE_EVENT, STORAGE_KEYS } from '$lib/client/constants';
	import { t } from '$lib/client/i18n';
	import { buildReviewQueue, formatDuration, getStats } from '$lib/client/learning';
	import { getHistory, saveHistory } from '$lib/client/storage';

	let history = [];
	let search = '';

	$: filteredHistory = history.filter((entry) =>
		`${entry.topic || ''}`.toLowerCase().includes(search.trim().toLowerCase()),
	);
	$: stats = getStats(history);
	$: reviewQueue = buildReviewQueue(history);

	function refreshHistory() {
		history = getHistory();
	}

	function clearHistory() {
		if (!confirm($t('clearHistoryConfirm'))) {
			return;
		}
		saveHistory([]);
		refreshHistory();
	}

	onMount(() => {
		refreshHistory();
		const handleStorage = (event) => {
			if (!event.key || event.key === STORAGE_KEYS.TEST_HISTORY) {
				refreshHistory();
			}
		};
		const handleLocalChange = (event) => {
			const keys = event?.detail?.keys || [];
			if (keys.length === 0 || keys.includes(STORAGE_KEYS.TEST_HISTORY)) {
				refreshHistory();
			}
		};
		window.addEventListener('storage', handleStorage);
		window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange);
		return () => {
			window.removeEventListener('storage', handleStorage);
			window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange);
		};
	});
</script>

<svelte:head>
	<title>{$t('history')} | selftest.in</title>
</svelte:head>

<section class="container py-4">
	<div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
		<div>
			<h1 class="h3 fw-bold mb-1">{$t('history')}</h1>
			<p class="text-muted mb-0">{$t('recentTests')}</p>
		</div>
		{#if history.length > 0}
			<button class="btn btn-sm btn-outline-danger" type="button" onclick={clearHistory}>
				{$t('clear')}
			</button>
		{/if}
	</div>

	{#if stats.totalTests > 0}
		<section class="row g-3 mb-4">
			<div class="col-6 col-md-3">
				<div class="stat-card"><strong>{stats.totalTests}</strong><span>{$t('quizzes')}</span></div>
			</div>
			<div class="col-6 col-md-3">
				<div class="stat-card"><strong>{stats.averageScore}%</strong><span>{$t('avgScore')}</span></div>
			</div>
			<div class="col-6 col-md-3">
				<div class="stat-card"><strong>{stats.totalQuestions}</strong><span>{$t('questionsHeading')}</span></div>
			</div>
			<div class="col-6 col-md-3">
				<div class="stat-card"><strong>{formatDuration(stats.totalTime, $t('minuteShort'), $t('hourShort'))}</strong><span>{$t('timeSpent')}</span></div>
			</div>
		</section>
	{/if}

	{#if reviewQueue.today.length > 0}
		<section class="alert alert-info d-flex flex-wrap align-items-center justify-content-between gap-2">
			<span>{$t('reviewQueueTitle')}: {reviewQueue.today[0].topic}</span>
			<a class="btn btn-sm btn-primary" href={`/?mode=quiz-practice&topic=${encodeURIComponent(reviewQueue.today[0].topic)}`}>
				{$t('startReview')}
			</a>
		</section>
	{/if}

	<label class="form-label w-100 mb-3" style="max-width: 520px;">
		<span class="fw-semibold">{$t('searchTests')}</span>
		<input class="form-control mt-1" bind:value={search} placeholder={$t('searchByTopic')} />
	</label>

	{#if filteredHistory.length === 0}
		<div class="alert alert-light border">
			{$t('noTestsFound')} <a href="/">{$t('startNewTest')}</a>.
		</div>
	{:else}
		<div class="list-group">
			{#each filteredHistory as entry (`${entry.id}-${entry.timestamp || ''}`)}
				<a
					class="list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-3"
					href={entry.userAnswers ? `/results?id=${entry.id}` : `/test?id=${entry.id}`}
				>
					<div>
						<div class="fw-semibold">{entry.topic || $t('testNotFound')}</div>
						<div class="text-muted small">
							{entry.questions?.length || entry.totalQuestions || 0} {$t('questions')}
							{#if entry.timestamp}
								<span> · {new Date(entry.timestamp).toLocaleString()}</span>
							{/if}
						</div>
					</div>
					{#if entry.userAnswers}
						<span class="badge bg-success">
							{entry.score ?? 0}/{entry.totalQuestions || entry.questions?.length || 0}
						</span>
					{:else}
						<span class="badge bg-warning text-dark">{$t('unsubmittedTest')}</span>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</section>

<style>
	.stat-card {
		display: flex;
		min-height: 76px;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
	}

	.stat-card strong {
		font-size: 1.25rem;
	}

	.stat-card span {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
</style>
