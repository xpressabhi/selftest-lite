<script>
	import { onMount } from 'svelte';
	import { LOCAL_STORAGE_CHANGE_EVENT, STORAGE_KEYS } from '$lib/client/constants';
	import { t } from '$lib/client/i18n';
	import { track, trackDebounced } from '$lib/client/telemetry';
	import { buildReviewQueue, formatDuration, getStats } from '$lib/client/learning';
	import { getHistory, removeFromHistory, saveHistory } from '$lib/client/storage';
	import {
		flushPendingAttempts,
		getPendingAttemptCount,
		hydrateHistoryFromServer,
		purgePendingAttemptsForTest,
	} from '$lib/client/sync';
	import { showToast } from '$lib/client/toast';

	let history = $state([]);
	let search = $state('');
	let isHydrating = $state(false);
	let pendingCount = $state(0);
	let pendingDelete = $state(null);
	let deleting = $state(false);

	let filteredHistory = $derived(
		history.filter((entry) =>
			`${entry.topic || ''}`.toLowerCase().includes(search.trim().toLowerCase())
		)
	);
	let stats = $derived(getStats(history));
	let reviewQueue = $derived(buildReviewQueue(history));

	function refreshHistory() {
		history = getHistory();
		pendingCount = getPendingAttemptCount();
	}

	function clearHistory() {
		if (!confirm($t('clearHistoryConfirm'))) {
			return;
		}
		saveHistory([]);
		track('history:clear');
		refreshHistory();
	}

	function requestDelete(entry) {
		pendingDelete = entry;
	}

	function performDelete() {
		const entry = pendingDelete;
		if (!entry || deleting) {
			return;
		}
		deleting = true;
		removeFromHistory(entry.id);
		purgePendingAttemptsForTest(entry.id);
		showToast($t('deleteTestSuccess'), 'success');
		track('history:delete-test', { id: entry.id });
		deleting = false;
		pendingDelete = null;
	}

	function handleDeleteKeydown(event) {
		if (event.key === 'Escape' && pendingDelete && !deleting) {
			pendingDelete = null;
		}
	}

	onMount(() => {
		track('history:view');
		refreshHistory();
		async function hydrate() {
			isHydrating = true;
			try {
				await Promise.all([hydrateHistoryFromServer(), flushPendingAttempts()]);
			} finally {
				isHydrating = false;
				refreshHistory();
			}
		}
		void hydrate();
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
			<h1 class="h2 fw-bold mb-1">{$t('history')}</h1>
			<p class="text-muted mb-0">{$t('recentTests')}</p>
		</div>
		<div class="d-flex align-items-center gap-2">
			{#if pendingCount > 0}
				<span class="badge bg-warning text-dark"
					>{$t('syncingActivity')} ({pendingCount})</span
				>
			{:else if isHydrating}
				<span class="badge bg-secondary">{$t('syncingActivity')}</span>
			{/if}
			{#if history.length > 0}
				<button class="btn btn-sm btn-outline-danger" type="button" onclick={clearHistory}>
					{$t('clear')}
				</button>
			{/if}
		</div>
	</div>

	{#if stats.totalTests > 0}
		<section class="row g-3 mb-4">
			<div class="col-6 col-md-3">
				<div class="stat-card">
					<strong>{stats.totalTests}</strong><span>{$t('quizzes')}</span>
				</div>
			</div>
			<div class="col-6 col-md-3">
				<div class="stat-card">
					<strong>{stats.averageScore}%</strong><span>{$t('avgScore')}</span>
				</div>
			</div>
			<div class="col-6 col-md-3">
				<div class="stat-card">
					<strong>{stats.totalQuestions}</strong><span>{$t('questionsHeading')}</span>
				</div>
			</div>
			<div class="col-6 col-md-3">
				<div class="stat-card">
					<strong
						>{formatDuration(
							stats.totalTime,
							$t('minuteShort'),
							$t('hourShort')
						)}</strong
					><span>{$t('timeSpent')}</span>
				</div>
			</div>
		</section>
	{/if}

	{#if reviewQueue.today.length > 0}
		<section
			class="alert alert-info d-flex flex-wrap align-items-center justify-content-between gap-2"
		>
			<span>{$t('reviewQueueTitle')}: {reviewQueue.today[0].topic}</span>
			<a
				class="btn btn-sm btn-primary"
				href={`/?mode=quiz-practice&topic=${encodeURIComponent(reviewQueue.today[0].topic)}`}
			>
				{$t('startReview')}
			</a>
		</section>
	{/if}

	<label class="form-label w-full mb-3" style="max-width: 520px;">
		<span class="fw-semibold">{$t('searchTests')}</span>
		<input
			class="form-control mt-1"
			bind:value={search}
			placeholder={$t('searchByTopic')}
			oninput={() => trackDebounced('history:search', { q: search.trim().slice(0, 64) })}
		/>
	</label>

	{#if filteredHistory.length === 0}
		<div class="alert alert-light border">
			{$t('noTestsFound')} <a href="/">{$t('startNewTest')}</a>.
		</div>
	{:else}
		<div class="list-group">
			{#each filteredHistory as entry (`${entry.id}-${entry.timestamp || ''}`)}
				<div class="list-group-item list-group-item-action history-row">
					<a
						class="history-link"
						href={entry.userAnswers
							? `/results?id=${entry.id}`
							: `/test?id=${entry.id}`}
						onclick={() =>
							track('history:open-test', {
								id: entry.id,
								status: entry.userAnswers ? 'submitted' : 'unsubmitted',
							})}
					>
						<div>
							<div class="fw-semibold">{entry.topic || $t('testNotFound')}</div>
							<div class="text-muted small">
								{entry.questions?.length || entry.totalQuestions || 0}
								{$t('questions')}
								{#if entry.timestamp}
									<span> · {new Date(entry.timestamp).toLocaleString()}</span>
								{/if}
							</div>
						</div>
						{#if entry.userAnswers}
							<span class="badge bg-success">
								{entry.score ?? 0}/{entry.totalQuestions ||
									entry.questions?.length ||
									0}
							</span>
						{:else}
							<span class="badge bg-warning text-dark">{$t('unsubmittedTest')}</span>
						{/if}
					</a>
					<button
						class="history-delete"
						type="button"
						aria-label={`${$t('deleteTest')}: ${entry.topic || $t('untitledTest')}`}
						onclick={() => requestDelete(entry)}
					>
						<span aria-hidden="true">🗑</span>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</section>

<svelte:window onkeydown={handleDeleteKeydown} />

{#if pendingDelete}
	<div
		class="delete-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget && !deleting) {
				pendingDelete = null;
			}
		}}
	>
		<div
			class="delete-modal"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-label={$t('deleteTestConfirmTitle')}
		>
			<h2 class="h5 fw-bold mb-1">{$t('deleteTestConfirmTitle')}</h2>
			<p class="text-muted small mb-2">
				{$t('deleteTestConfirmTopic')}:
				<strong class="text-break">{pendingDelete.topic || $t('untitledTest')}</strong>
			</p>
			<p class="text-muted small mb-3">{$t('deleteTestConfirmBody')}</p>
			<div class="d-flex flex-wrap gap-2">
				<button
					class="btn btn-outline-secondary"
					type="button"
					disabled={deleting}
					onclick={() => (pendingDelete = null)}
				>
					{$t('cancel')}
				</button>
				<button
					class="btn btn-danger"
					type="button"
					disabled={deleting}
					onclick={performDelete}
				>
					{deleting ? $t('deleting') : $t('deleteTest')}
				</button>
			</div>
		</div>
	</div>
{/if}

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

	.history-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0;
	}

	.history-link {
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0 12px 16px;
		color: inherit;
		text-decoration: none;
	}

	.history-link:hover {
		background: var(--surface-muted);
	}

	.history-delete {
		display: grid;
		width: 44px;
		height: 44px;
		flex: 0 0 auto;
		margin-right: 8px;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		transition:
			background 0.12s ease,
			color 0.12s ease;
	}

	.history-delete:hover,
	.history-delete:focus-visible {
		background: rgba(220, 53, 69, 0.1);
		color: #dc2626;
	}

	.delete-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1200;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(15, 23, 42, 0.55);
	}

	.delete-modal {
		width: 100%;
		max-width: 400px;
		padding: 20px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
	}
</style>
