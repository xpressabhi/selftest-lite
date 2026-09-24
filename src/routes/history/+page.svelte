<script>
	import { onMount } from 'svelte';
	import { LOCAL_STORAGE_CHANGE_EVENT, STORAGE_KEYS } from '$lib/client/constants';
	import { t } from '$lib/client/i18n';
	import { MAX_SEARCH_CHARS, sanitizeInputText } from '$lib/shared/inputLimits';
	import { language } from '$lib/client/preferences';
	import FuseButton from '$lib/client/FuseButton.svelte';
	import Icon from '$lib/client/Icon.svelte';
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

	const localeTag = $derived($language === 'hindi' ? 'hi-IN' : 'en-IN');
	// Rows read "2 hours ago" (full timestamp stays available in the title);
	// anything older than a week falls back to a short date.
	const relativeFormatter = $derived(
		new Intl.RelativeTimeFormat(localeTag, { numeric: 'always' })
	);
	const shortDateFormatter = $derived(
		new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short' })
	);
	const fullDateFormatter = $derived(
		new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeStyle: 'short' })
	);

	function relativeTimestamp(timestamp) {
		const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
		if (minutes < 60) return relativeFormatter.format(-minutes, 'minute');
		const hours = Math.round(minutes / 60);
		if (hours < 24) return relativeFormatter.format(-hours, 'hour');
		const days = Math.round(hours / 24);
		if (days < 7) return relativeFormatter.format(-days, 'day');
		return shortDateFormatter.format(timestamp);
	}

	function dayBucket(timestamp) {
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		const start = startOfToday.getTime();
		if (!timestamp || timestamp >= start) return 'today';
		if (timestamp >= start - 24 * 60 * 60 * 1000) return 'yesterday';
		return 'earlier';
	}

	function bucketLabel(bucket) {
		if (bucket === 'today') return $t('historyGroupToday');
		if (bucket === 'yesterday') return $t('historyGroupYesterday');
		return $t('historyGroupEarlier');
	}

	// Newest first, split into date groups so long lists stay scannable.
	let historyGroups = $derived.by(() => {
		const groups = [];
		for (const entry of filteredHistory) {
			const bucket = dayBucket(entry.timestamp);
			const current = groups[groups.length - 1];
			if (current?.bucket === bucket) {
				current.entries.push(entry);
			} else {
				groups.push({ bucket, label: bucketLabel(bucket), entries: [entry] });
			}
		}
		return groups;
	});

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
	<header class="page-head">
		<div>
			<h1 class="h2 fw-bold mb-1">{$t('history')}</h1>
			<p class="text-muted mb-0">{$t('recentTests')}</p>
		</div>
		<div class="head-actions">
			{#if pendingCount > 0}
				<span class="sync-chip">
					<Icon name="refresh" size={14} />
					{$t('syncingActivity')} ({pendingCount})
				</span>
			{:else if isHydrating}
				<span class="sync-chip">
					<Icon name="refresh" size={14} />
					{$t('syncingActivity')}
				</span>
			{/if}
			{#if history.length > 0}
				<button class="clear-link" type="button" onclick={clearHistory}>
					{$t('clear')}
				</button>
			{/if}
		</div>
	</header>

	{#if stats.totalTests > 0}
		<section class="stat-strip" aria-label={$t('history')}>
			<div class="stat-cell">
				<strong>{stats.totalTests}</strong><span>{$t('quizzes')}</span>
			</div>
			<div class="stat-cell">
				<strong>{stats.averageScore}%</strong><span>{$t('avgScore')}</span>
			</div>
			<div class="stat-cell">
				<strong>{stats.totalQuestions}</strong><span>{$t('questionsHeading')}</span>
			</div>
			<div class="stat-cell">
				<strong>{formatDuration(stats.totalTime, $t('minuteShort'), $t('hourShort'))}</strong>
				<span>{$t('timeSpent')}</span>
			</div>
		</section>
	{/if}

	{#if reviewQueue.today.length > 0}
		<section class="review-callout">
			<span class="review-icon" aria-hidden="true"><Icon name="refresh" size={18} /></span>
			<div class="review-text">
				<span class="review-label">{$t('reviewQueueTitle')}</span>
				<span class="review-topic">{reviewQueue.today[0].topic}</span>
			</div>
			<a
				class="btn btn-sm btn-primary"
				href={`/?mode=quiz-practice&topic=${encodeURIComponent(reviewQueue.today[0].topic)}`}
			>
				{$t('startReview')}
			</a>
		</section>
	{/if}

	<label class="search-block" for="history-search-input">
		<span class="fw-semibold">{$t('searchTests')}</span>
		<span class="search-field">
			<Icon name="search" size={18} />
			<input
				id="history-search-input"
				class="form-control search-input"
				type="search"
				name="search"
				autocomplete="off"
				bind:value={search}
				maxlength={MAX_SEARCH_CHARS}
				placeholder={$t('searchByTopic')}
				oninput={(event) => {
					search = sanitizeInputText(event.currentTarget.value, MAX_SEARCH_CHARS);
					trackDebounced('history:search', { q: search.trim().slice(0, 64) });
				}}
			/>
		</span>
	</label>

	{#if filteredHistory.length === 0}
		<div class="history-empty">
			<span class="empty-icon" aria-hidden="true"><Icon name="clock" size={22} /></span>
			<p class="mb-0 text-muted">{$t('noTestsFound')}</p>
			<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
		</div>
	{:else}
		{#each historyGroups as group (group.bucket)}
			<h2 class="group-label">{group.label}</h2>
			<div class="history-list">
				{#each group.entries as entry (`${entry.id}-${entry.timestamp || ''}`)}
					<div class="history-row" class:is-pending={pendingDelete?.id === entry.id}>
						<a
							class="history-link"
							href={entry.userAnswers
								? `/results?id=${entry.id}`
								: `/test?id=${entry.id}`}
							title={entry.timestamp
								? fullDateFormatter.format(new Date(entry.timestamp))
								: undefined}
							onclick={() =>
								track('history:open-test', {
									id: entry.id,
									status: entry.userAnswers ? 'submitted' : 'unsubmitted',
								})}
						>
							<span class="row-main">
								<span class="row-topic">{entry.topic || $t('untitledTest')}</span>
								<span class="row-meta">
									{entry.questions?.length || entry.totalQuestions || 0}
									{$t('questions')}
									{#if entry.timestamp}
										· {relativeTimestamp(entry.timestamp)}
									{/if}
								</span>
							</span>
							{#if entry.userAnswers}
								<span class="score-chip is-scored">
									{entry.score ?? 0}/{entry.totalQuestions ||
										entry.questions?.length ||
										0}
								</span>
							{:else}
								<span class="score-chip is-unsubmitted">{$t('unsubmittedTest')}</span>
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
							<Icon name="trash" size={18} />
						</FuseButton>
					</div>
				{/each}
			</div>
		{/each}
	{/if}
</section>

<svelte:window onkeydown={handleDeleteKeydown} />

<style>
	.page-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}

	.head-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sync-chip {
		display: inline-flex;
		min-height: 32px;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 600;
	}

	.clear-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0 12px;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--motion-fast) var(--ease-out),
			color var(--motion-fast) var(--ease-out);
	}

	.clear-link:hover,
	.clear-link:focus-visible {
		background: color-mix(in srgb, var(--danger) 8%, transparent);
		color: var(--danger);
	}

	.stat-strip {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin-bottom: 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--line);
		overflow: hidden;
	}

	.stat-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		background: var(--surface);
	}

	.stat-cell strong {
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}

	.stat-cell span {
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.review-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
		padding: 12px 14px;
		border: 1px solid color-mix(in srgb, var(--color-brand-600) 28%, var(--line));
		border-radius: var(--radius-surface);
		background: color-mix(in srgb, var(--color-brand-600) 6%, var(--surface));
	}

	.review-icon {
		display: grid;
		width: 34px;
		height: 34px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-brand-600) 12%, transparent);
		color: var(--brand-text);
	}

	.review-text {
		display: flex;
		min-width: 0;
		flex: 1 1 200px;
		flex-direction: column;
	}

	.review-label {
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.review-topic {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.search-block {
		display: block;
		max-width: 520px;
		margin-bottom: 16px;
	}

	.search-field {
		position: relative;
		display: block;
		margin-top: 4px;
	}

	.search-field > :global(svg) {
		position: absolute;
		top: 50%;
		left: 12px;
		color: var(--text-muted);
		pointer-events: none;
		translate: 0 -50%;
	}

	.search-input {
		padding-left: 38px;
	}

	.group-label {
		margin: 20px 0 8px;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.history-list {
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		overflow: hidden;
	}

	.history-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.history-row + .history-row {
		border-top: 1px solid var(--line);
	}

	.history-row.is-pending {
		opacity: 0.6;
	}

	.history-link {
		display: flex;
		min-width: 0;
		flex: 1 1 auto;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 4px 12px 16px;
		color: inherit;
		text-decoration: none;
	}

	.history-link:hover {
		background: var(--surface-muted);
	}

	.history-link:focus-visible {
		outline-offset: -2px;
	}

	.row-main {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 2px;
	}

	.row-topic {
		display: -webkit-box;
		overflow: hidden;
		font-weight: 600;
		line-height: 1.35;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	.row-meta {
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.score-chip {
		display: inline-flex;
		min-height: 28px;
		flex: 0 0 auto;
		align-items: center;
		padding: 0 10px;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.score-chip.is-scored {
		background: color-mix(in srgb, var(--ok) 12%, transparent);
		color: var(--ok);
	}

	.score-chip.is-unsubmitted {
		background: color-mix(in srgb, var(--warn) 16%, transparent);
		color: var(--warn);
	}

	.history-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 40px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		text-align: center;
	}

	.empty-icon {
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text-muted);
	}

	:global(.history-delete) {
		width: 44px;
		height: 44px;
		flex: 0 0 auto;
		margin-right: 8px;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-muted);
		transition:
			background var(--motion-fast) var(--ease-out),
			color var(--motion-fast) var(--ease-out);
	}

	:global(.history-delete:hover),
	:global(.history-delete:focus-visible) {
		background: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
	}

	:global(.history-undo) {
		min-height: 44px;
		flex: 0 0 auto;
		margin-right: 8px;
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		color: var(--danger);
		font-size: 0.85rem;
	}

	:global(.history-undo:hover),
	:global(.history-undo:focus-visible) {
		background: color-mix(in srgb, var(--danger) 20%, transparent);
	}

	@media (min-width: 640px) {
		.stat-strip {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
