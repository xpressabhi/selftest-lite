<script>
	import { onMount } from 'svelte';
	import { LOCAL_STORAGE_CHANGE_EVENT, STORAGE_KEYS } from '$lib/client/constants';
	import { t } from '$lib/client/i18n';
	import { MAX_SEARCH_CHARS, sanitizeInputText } from '$lib/shared/inputLimits';
	import { language } from '$lib/client/preferences';
	import FuseButton from '$lib/client/FuseButton.svelte';
	import { track, trackDebounced } from '$lib/client/telemetry';
	import { buildReviewQueue, formatDuration, getStats } from '$lib/client/learning';
	import { getHistory, removeFromHistory, saveHistory } from '$lib/client/storage';
	import { requestPersonalize } from '$lib/client/personalize';
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
	let historyReranked = false;

	let filteredHistory = $derived(
		history.filter((entry) =>
			`${entry.topic || ''}`.toLowerCase().includes(search.trim().toLowerCase())
		)
	);
	let stats = $derived(getStats(history));
	let reviewQueue = $derived(buildReviewQueue(history));
	const dateFormatter = $derived(
		new Intl.DateTimeFormat($language === 'hindi' ? 'hi-IN' : 'en-IN', {
			dateStyle: 'medium',
			timeStyle: 'short',
		})
	);

	function refreshHistory() {
		history = getHistory();
		pendingCount = getPendingAttemptCount();
		// Central rerank (fail-open, once): move the Jev-picked item to the
		// top; the full list and search stay intact below it.
		const ids = history
			.slice(0, 8)
			.map((entry) => String(entry.id))
			.filter(Boolean);
		if (ids.length >= 2 && !historyReranked) {
			historyReranked = true;
			void requestPersonalize('history', { ids }).then((decision) => {
				if (!decision?.applied || !decision.action || decision.action === 'none') return;
				const index = history.findIndex((entry) => String(entry.id) === String(decision.action));
				if (index > 0) {
					const promoted = history[index];
					history = [promoted, ...history.slice(0, index), ...history.slice(index + 1)];
				}
			});
		}
	}

	function clearHistory() {
		if (!confirm($t('clearHistoryConfirm'))) {
			return;
		}
		saveHistory([]);
		track('history:clear');
		refreshHistory();
	}

	// Deleting is a two-step affordance now: the first press arms the button
	// (fuse + Undo), the second cancels, and the delete commits when the fuse
	// burns out. Arming another row commits the previous one immediately.
	function armDelete(entry) {
		if (pendingDelete && pendingDelete.id !== entry.id) {
			performDelete(pendingDelete);
		}
		pendingDelete = entry;
	}

	function performDelete(entry = pendingDelete) {
		if (!entry) {
			return;
		}
		removeFromHistory(entry.id);
		purgePendingAttemptsForTest(entry.id);
		showToast($t('deleteTestSuccess'), 'success');
		track('history:delete-test', { id: entry.id });
		if (pendingDelete?.id === entry.id) {
			pendingDelete = null;
		}
	}

	function undoDelete() {
		if (!pendingDelete) {
			return;
		}
		track('history:undo-delete', { id: pendingDelete.id });
		pendingDelete = null;
	}

	function handleDeleteKeydown(event) {
		if (event.key === 'Escape' && pendingDelete) {
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
	<meta name="robots" content="noindex, nofollow" />
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
			type="search"
			name="search"
			autocomplete="off"
			aria-label={$t('searchTests')}
			bind:value={search}
			maxlength={MAX_SEARCH_CHARS}
			placeholder={$t('searchByTopic')}
			oninput={(event) => {
				search = sanitizeInputText(event.currentTarget.value, MAX_SEARCH_CHARS);
				trackDebounced('history:search', { q: search.trim().slice(0, 64) });
			}}
		/>
	</label>

	{#if filteredHistory.length === 0}
		<div class="alert alert-light border">
			{$t('noTestsFound')} <a href="/">{$t('startNewTest')}</a>.
		</div>
	{:else}
		<div class="list-group">
			{#each filteredHistory as entry (`${entry.id}-${entry.timestamp || ''}`)}
				<div
					class="list-group-item list-group-item-action history-row"
					class:is-pending={pendingDelete?.id === entry.id}
				>
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
							<div class="fw-semibold">{entry.topic || $t('untitledTest')}</div>
							<div class="text-muted small">
								{entry.questions?.length || entry.totalQuestions || 0}
								{$t('questions')}
								{#if entry.timestamp}
									<span>
										· {dateFormatter.format(new Date(entry.timestamp))}</span
									>
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
					<FuseButton
						armed={pendingDelete?.id === entry.id}
						label={`${$t('deleteTest')}: ${entry.topic || $t('untitledTest')}`}
						undoLabel={$t('undo')}
						durationMs={4000}
						class={pendingDelete?.id === entry.id ? 'history-undo' : 'history-delete'}
						onarm={() => armDelete(entry)}
						oncancel={undoDelete}
						onfire={() => performDelete(entry)}
					>
						<span aria-hidden="true">🗑</span>
					</FuseButton>
				</div>
			{/each}
		</div>
	{/if}
</section>

<svelte:window onkeydown={handleDeleteKeydown} />

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

	:global(.history-delete) {
		width: 44px;
		height: 44px;
		flex: 0 0 auto;
		margin-right: 8px;
		border-radius: 10px;
		background: transparent;
		color: var(--text-muted);
		font-size: 1rem;
		transition:
			background 0.12s ease,
			color 0.12s ease;
	}

	:global(.history-delete:hover),
	:global(.history-delete:focus-visible) {
		background: rgba(220, 53, 69, 0.1);
		color: #dc2626;
	}

	:global(.history-undo) {
		min-height: 44px;
		flex: 0 0 auto;
		margin-right: 8px;
		border-radius: 10px;
		background: rgba(220, 53, 69, 0.12);
		color: #dc2626;
		font-size: 0.85rem;
	}

	:global(.history-undo:hover),
	:global(.history-undo:focus-visible) {
		background: rgba(220, 53, 69, 0.2);
	}

	.history-row.is-pending {
		opacity: 0.6;
	}
</style>
