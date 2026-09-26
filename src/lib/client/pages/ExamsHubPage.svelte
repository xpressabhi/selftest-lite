<script>
	// Public exam notification hub. Server-rendered from the daily sync's
	// exam_notification rows; all filtering/search is client-side over the
	// SSR payload (a few hundred rows), mirroring PracticeHubPage.
	//
	// Guards: content comes from official sources but is auto-extracted, so
	// the page carries a "verify on the official notice" line and treats every
	// date as best-effort (null dates simply do not render).
	import { onMount } from 'svelte';
	import { activeLanguage, t } from '$lib/client/i18n';
	import { track, trackDebounced } from '$lib/client/telemetry';
	import Icon from '$lib/client/Icon.svelte';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { localizedPath } from '$lib/shared/seo';
	import { HUB_CATEGORIES, OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
	import { MAX_SEARCH_CHARS, sanitizeInputText } from '$lib/shared/inputLimits';
	import { NOTIFICATION_STATUS } from '$lib/shared/examNotificationStatus';

	let { notifications = [], lastRunAt = null, lastRunStatus = null } = $props();

	const examById = new Map(OBJECTIVE_ONLY_EXAMS.map((exam) => [exam.id, exam]));

	let query = $state('');
	let statusFilter = $state('all');
	let categoryFilter = $state('all');
	let stateFilter = $state('all');
	let nowMs = $state(null);

	onMount(() => {
		nowMs = Date.now();
		track('exams:view', { items: notifications.length });
	});

	const trimmedQuery = $derived(query.trim().toLowerCase());
	const categories = $derived(
		HUB_CATEGORIES.filter((category) =>
			notifications.some((item) => item.category === category.id)
		)
	);
	const states = $derived(
		[...new Set(notifications.map((item) => item.state).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b)
		)
	);
	const filtersActive = $derived(
		statusFilter !== 'all' || categoryFilter !== 'all' || stateFilter !== 'all' || query !== ''
	);

	function matchesStatus(item) {
		if (statusFilter === 'all') {
			return true;
		}
		if (statusFilter === 'new') {
			return item.isNew;
		}
		if (statusFilter === 'open') {
			return (
				item.status === NOTIFICATION_STATUS.OPEN ||
				item.status === NOTIFICATION_STATUS.CLOSING_SOON
			);
		}
		if (statusFilter === 'closing_soon') {
			return item.status === NOTIFICATION_STATUS.CLOSING_SOON;
		}
		return true;
	}

	function haystack(item) {
		const examName = item.examId ? (examById.get(item.examId)?.name ?? '') : '';
		return `${item.title} ${item.org} ${item.qualification ?? ''} ${item.state ?? ''} ${examName}`.toLowerCase();
	}

	const filtered = $derived(
		notifications.filter((item) => {
			if (!matchesStatus(item)) return false;
			if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
			if (stateFilter !== 'all' && item.state !== stateFilter) return false;
			if (trimmedQuery && !haystack(item).includes(trimmedQuery)) return false;
			return true;
		})
	);

	// Active first: closing soon → open → awaited → closed. Within a group the
	// soonest deadline wins, then the most recently published.
	const STATUS_RANK = {
		[NOTIFICATION_STATUS.CLOSING_SOON]: 0,
		[NOTIFICATION_STATUS.OPEN]: 1,
		[NOTIFICATION_STATUS.UPCOMING]: 2,
		[NOTIFICATION_STATUS.CLOSED]: 3
	};
	const sorted = $derived(
		[...filtered].sort((left, right) => {
			const rank = (STATUS_RANK[left.status] ?? 2) - (STATUS_RANK[right.status] ?? 2);
			if (rank !== 0) return rank;
			const leftKey = left.applyEnd || left.examDate || left.publishedAt || '';
			const rightKey = right.applyEnd || right.examDate || right.publishedAt || '';
			if (leftKey !== rightKey) {
				return leftKey < rightKey ? -1 : 1;
			}
			return (right.publishedAt || '').localeCompare(left.publishedAt || '');
		})
	);

	function formatDate(isoDate) {
		if (!isoDate) return '';
		const locale = $activeLanguage === 'hindi' ? 'hi-IN' : 'en-IN';
		return new Date(`${isoDate}T00:00:00`).toLocaleDateString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const updatedText = $derived.by(() => {
		if (!lastRunAt) {
			return '';
		}
		const then = new Date(lastRunAt).getTime();
		if (nowMs === null) {
			return $t('examsUpdatedOn', { date: formatDate(lastRunAt.slice(0, 10)) });
		}
		const minutes = Math.max(0, Math.round((nowMs - then) / 60000));
		if (minutes < 2) {
			return $t('examsUpdatedJustNow');
		}
		if (minutes < 60) {
			return $t('examsUpdatedMinutes', { count: minutes });
		}
		const hours = Math.round(minutes / 60);
		if (hours < 24) {
			return $t('examsUpdatedHours', { count: hours });
		}
		return $t('examsUpdatedOn', { date: formatDate(lastRunAt.slice(0, 10)) });
	});

	const stale = $derived.by(() => {
		if (!lastRunAt) {
			return true;
		}
		if (nowMs === null) {
			return false;
		}
		return nowMs - new Date(lastRunAt).getTime() > 48 * 60 * 60 * 1000;
	});

	function statusKey(status) {
		if (status === NOTIFICATION_STATUS.CLOSING_SOON) return 'examsStatusClosingSoon';
		if (status === NOTIFICATION_STATUS.CLOSED) return 'examsStatusClosed';
		if (status === NOTIFICATION_STATUS.UPCOMING) return 'examsStatusUpcoming';
		return 'examsStatusOpen';
	}

	function setStatus(value) {
		statusFilter = value;
		track('exams:filter', { filter: 'status', value });
	}

	function setCategory(value) {
		categoryFilter = value;
		track('exams:filter', { filter: 'category', value });
	}

	function clearFilters() {
		query = '';
		statusFilter = 'all';
		categoryFilter = 'all';
		stateFilter = 'all';
		track('exams:filter', { filter: 'clear' });
	}

	const statusChips = [
		{ value: 'all', key: 'examsFilterStatusAll' },
		{ value: 'new', key: 'examsFilterStatusNew' },
		{ value: 'open', key: 'examsFilterStatusOpen' },
		{ value: 'closing_soon', key: 'examsFilterStatusClosing' }
	];
</script>

<SeoHead
	path={localizedPath('/exams', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('examsTitle')} | selftest.in`}
	description={$t('examsMetaDescription')}
/>

<section class="app-container py-4 py-md-5">
	<div class="exams-hub">
		<header class="exams-hero">
			<h1 class="exams-title">{$t('examsTitle')}</h1>
			<p class="exams-sub">{$t('examsHeroBody')}</p>
			<p class="exams-updated">
				{#if updatedText}<span class="exams-updated-text">{updatedText}</span>{/if}
				{#if lastRunStatus === 'unavailable'}
					<span class="exams-updated-warn">{$t('examsUnavailableNote')}</span>
				{:else if stale}
					<span class="exams-updated-warn">{$t('examsStaleNote')}</span>
				{/if}
			</p>
		</header>

		<div class="exams-search">
			<span class="exams-search-icon" aria-hidden="true">
				<Icon name="search" size={18} />
			</span>
			<label class="visually-hidden" for="exams-search">{$t('examsSearchLabel')}</label>
			<input
				id="exams-search"
				class="exams-search-input"
				type="text"
				autocomplete="off"
				placeholder={$t('examsSearchPlaceholder')}
				maxlength={MAX_SEARCH_CHARS}
				bind:value={query}
				oninput={(event) => {
					query = sanitizeInputText(event.currentTarget.value, MAX_SEARCH_CHARS);
					trackDebounced('exams:search', { length: query.length });
				}}
			/>
			{#if query}
				<button
					type="button"
					class="exams-search-clear"
					aria-label={$t('examsSearchClear')}
					onclick={() => (query = '')}
				>
					<Icon name="close" size={16} />
				</button>
			{/if}
		</div>

		<div class="exams-filters">
			<div class="exams-chip-row" role="group" aria-label={$t('examsFilterStatusLabel')}>
				{#each statusChips as chip (chip.value)}
					<button
						type="button"
						class="exams-chip"
						class:is-active={statusFilter === chip.value}
						aria-pressed={statusFilter === chip.value}
						onclick={() => setStatus(chip.value)}
					>
						{$t(chip.key)}
					</button>
				{/each}
			</div>
			{#if categories.length > 1}
				<div class="exams-chip-row" role="group" aria-label={$t('examsFilterCategoryLabel')}>
					<button
						type="button"
						class="exams-chip"
						class:is-active={categoryFilter === 'all'}
						aria-pressed={categoryFilter === 'all'}
						onclick={() => setCategory('all')}
					>
						{$t('examsFilterCategoryAll')}
					</button>
					{#each categories as category (category.id)}
						<button
							type="button"
							class="exams-chip"
							class:is-active={categoryFilter === category.id}
							aria-pressed={categoryFilter === category.id}
							onclick={() => setCategory(category.id)}
						>
							{$t(category.labelKey)}
						</button>
					{/each}
				</div>
			{/if}
			{#if states.length > 1}
				<div class="exams-state">
					<label class="visually-hidden" for="exams-state">{$t('examsFilterStateLabel')}</label>
					<select
						id="exams-state"
						class="exams-state-select"
						bind:value={stateFilter}
						onchange={() => track('exams:filter', { filter: 'state', value: stateFilter })}
					>
						<option value="all">{$t('examsFilterStateAll')}</option>
						{#each states as state (state)}
							<option value={state}>{state}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<p class="exams-count" aria-live="polite">
			{$t('examsResultsCount', { count: sorted.length })}
		</p>

		{#if sorted.length > 0}
			<div class="exams-list">
				{#each sorted as item (item.id)}
					{@const exam = item.examId ? examById.get(item.examId) : null}
					<article class="exam-card" class:is-closed={item.status === NOTIFICATION_STATUS.CLOSED}>
						<div class="exam-card-head">
							<span class="exam-status exam-status-{item.status}">{$t(statusKey(item.status))}</span>
							{#if item.isNew}
								<span class="exam-new">{$t('examsNewBadge')}</span>
							{/if}
							<span class="exam-org">{item.org}</span>
						</div>
						<h2 class="exam-card-title">{item.title}</h2>
						<p class="exam-card-meta">
							{#if item.publishedAt}
								<span>{$t('examsPublishedOn', { date: formatDate(item.publishedAt) })}</span>
							{/if}
							{#if item.applyEnd}
								<span class:is-urgent={item.status === NOTIFICATION_STATUS.CLOSING_SOON}>
									{$t('examsApplyBy', { date: formatDate(item.applyEnd) })}
								</span>
							{/if}
							{#if item.examDate}
								<span>{$t('examsExamOn', { date: formatDate(item.examDate) })}</span>
							{/if}
							{#if item.vacancies}
								<span>{$t('examsVacancies', { count: item.vacancies })}</span>
							{/if}
							{#if item.qualification}
								<span>{item.qualification}</span>
							{/if}
						</p>
						<div class="exam-card-actions">
							<a
								class="exam-action exam-action-primary"
								href={item.notificationUrl}
								target="_blank"
								rel="noopener"
								onclick={() => track('exams:notice-open', { source: item.sourceId })}
							>
								<Icon name="note" size={16} />
								{$t('examsOfficialNotice')}
								<span class="visually-hidden">{$t('examsExternalHint')}</span>
							</a>
							{#if item.applyUrl}
								<a
									class="exam-action"
									href={item.applyUrl}
									target="_blank"
									rel="noopener"
									onclick={() => track('exams:notice-open', { source: item.sourceId, kind: 'apply' })}
								>
									<Icon name="external" size={16} />
									{$t('examsApplyNow')}
									<span class="visually-hidden">{$t('examsExternalHint')}</span>
								</a>
							{/if}
							{#if exam}
								<a
									class="exam-action exam-action-practice"
									href={localizedPath(`/practice/${exam.id}`, $activeLanguage)}
									onclick={() => track('exams:practice-click', { examId: exam.id })}
								>
									<Icon name="target" size={16} />
									{$t('examsPracticePrefix')} {exam.name}
								</a>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{:else if notifications.length === 0}
			<div class="exams-empty">
				<Icon name="note" size={28} />
				<h2 class="exams-empty-title">
					{lastRunStatus === 'unavailable' ? $t('examsUnavailableNote') : $t('examsEmptyTitle')}
				</h2>
				{#if lastRunStatus !== 'unavailable'}
					<p class="exams-empty-body">{$t('examsEmptyBody')}</p>
				{/if}
			</div>
		{:else}
			<div class="exams-empty">
				<Icon name="search" size={28} />
				<h2 class="exams-empty-title">{$t('examsFilterEmptyTitle')}</h2>
				<p class="exams-empty-body">{$t('examsFilterEmptyHint')}</p>
				{#if filtersActive}
					<button type="button" class="exams-chip is-active" onclick={clearFilters}>
						{$t('examsFilterClear')}
					</button>
				{/if}
			</div>
		{/if}

		<p class="exams-disclaimer">{$t('examsDisclaimer')}</p>
	</div>
</section>

<style>
	.exams-hub {
		display: grid;
		gap: 1.1rem;
	}

	.exams-hero {
		text-align: center;
	}

	.exams-title {
		margin: 0 0 0.35rem;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.exams-sub {
		margin: 0 auto;
		max-width: 44rem;
		color: var(--text-muted);
	}

	.exams-updated {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		display: grid;
		gap: 0.2rem;
		justify-items: center;
	}

	.exams-updated-warn {
		color: var(--warn-text, #b45309);
	}

	.exams-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 48px;
		padding: 0 0.25rem 0 0.85rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		transition:
			border-color 0.15s ease-out,
			box-shadow 0.15s ease-out;
	}

	.exams-search:focus-within {
		border-color: var(--brand-text);
		box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
	}

	.exams-search-icon {
		display: inline-flex;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.exams-search-input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 1rem;
		min-height: 46px;
	}

	.exams-search-input::placeholder {
		color: var(--text-muted);
	}

	.exams-search-clear {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
	}

	.exams-search-clear:hover {
		background: var(--surface-muted);
		color: var(--text);
	}

	.exams-filters {
		display: grid;
		gap: 0.6rem;
	}

	.exams-chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.exams-chip {
		min-height: 44px;
		padding: 0.35rem 0.85rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.exams-chip.is-active {
		border-color: var(--brand-text);
		background: var(--brand-50, #eef2ff);
		color: var(--brand-text);
		font-weight: 600;
	}

	.exams-state-select {
		min-height: 44px;
		padding: 0 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		color: inherit;
		font: inherit;
	}

	.exams-count {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.exams-list {
		display: grid;
		gap: 0.85rem;
	}

	@media (min-width: 820px) {
		.exams-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.exam-card {
		display: grid;
		gap: 0.55rem;
		padding: 0.95rem 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.exam-card.is-closed {
		opacity: 0.72;
	}

	.exam-card-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.exam-status {
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border: 1px solid var(--line);
		background: var(--surface-muted);
		color: var(--text-muted);
	}

	.exam-status-open {
		border-color: var(--brand-text);
		background: var(--brand-50, #eef2ff);
		color: var(--brand-text);
	}

	.exam-status-closing_soon {
		border-color: #f59e0b;
		background: #fffbeb;
		color: #b45309;
	}

	.exam-status-closed {
		color: var(--text-muted);
	}

	.exam-new {
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
		background: #dcfce7;
		color: #166534;
	}

	.exam-org {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.exam-card-title {
		margin: 0;
		font-size: 1.02rem;
		line-height: 1.35;
	}

	.exam-card-meta {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.85rem;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	.exam-card-meta .is-urgent {
		color: #b45309;
		font-weight: 600;
	}

	.exam-card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.15rem;
	}

	.exam-action {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding: 0 0.85rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
	}

	.exam-action:hover {
		border-color: var(--brand-text);
		color: var(--brand-text);
	}

	.exam-action-primary {
		background: var(--brand-text);
		border-color: var(--brand-text);
		color: #fff;
	}

	.exam-action-primary:hover {
		color: #fff;
		opacity: 0.92;
	}

	.exam-action-practice {
		border-color: var(--brand-text);
		color: var(--brand-text);
	}

	.exams-empty {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		padding: 2.5rem 1rem;
		border: 1px dashed var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		text-align: center;
		color: var(--text-muted);
	}

	.exams-empty-title {
		margin: 0;
		color: var(--text);
		font-size: 1.05rem;
	}

	.exams-empty-body {
		margin: 0;
		max-width: 32rem;
	}

	.exams-disclaimer {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.82rem;
		text-align: center;
	}
</style>
