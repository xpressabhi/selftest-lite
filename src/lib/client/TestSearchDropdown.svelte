<script>
	import { untrack } from 'svelte';
	import { t } from '$lib/client/i18n';
	import { track, trackDebounced } from '$lib/client/telemetry';

	let {
		query = '',
		variant = 'overlay',
		onnavigate = () => {},
		ongenerate = () => {},
		onlistcount = () => {},
	} = $props();

	const SEARCH_DEBOUNCE_MS = 350;
	const SEARCH_INITIAL_PAGE_SIZE = 10;
	const SEARCH_INCREMENT = 5;
	const RECENT_TTL_MS = 60_000;
	const STRIP_MAX_RESULTS = 3;

	let results = $state([]);
	let status = $state('idle');
	let blocked = $state(false);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let resultsOffset = $state(0);
	let resultsRef = $state(null);
	let searchTimer;
	let searchAbort = null;
	let recentCache = null;

	const trimmedQuery = $derived(query.trim());
	const isTestId = $derived(/^\d+$/.test(trimmedQuery));
	const isSearchable = $derived(trimmedQuery.length >= 4 || isTestId);
	const exactTestIdMatch = $derived(
		isTestId ? results.find((test) => String(test.id) === trimmedQuery) : null
	);
	const otherResults = $derived(
		exactTestIdMatch
			? results.filter((test) => String(test.id) !== String(exactTestIdMatch.id))
			: results
	);

	function getFreshRecent() {
		if (!recentCache) return null;
		return Date.now() - recentCache.fetchedAt <= RECENT_TTL_MS ? recentCache : null;
	}

	async function fetchSearchList(q, offset, append) {
		const controller = new AbortController();
		searchAbort?.abort();
		searchAbort = controller;
		if (append) {
			loadingMore = true;
		} else {
			status = 'loading';
		}

		const limit = append ? SEARCH_INCREMENT : SEARCH_INITIAL_PAGE_SIZE;

		try {
			const response = await fetch(
				`/api/test?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`,
				{ signal: controller.signal }
			);
			const payload = await response.json().catch(() => null);
			if (searchAbort !== controller) return;

			const tests = response.ok && Array.isArray(payload?.tests) ? payload.tests : [];
			const hasMoreResults = response.ok && payload?.hasMore === true;

			if (!append) {
				blocked = response.status === 429;
			}

			if (!append && !q) {
				recentCache = { tests, hasMore: hasMoreResults, fetchedAt: Date.now() };
			}

			let next = append ? [...results, ...tests] : [...tests];
			if (append) {
				const seen = new Set();
				next = next.filter((test) => {
					const key = String(test.id);
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});
			}
			if (!append && /^\d+$/.test(q)) {
				const exactIndex = next.findIndex((test) => String(test.id) === q);
				if (exactIndex > 0) {
					const [exact] = next.splice(exactIndex, 1);
					next.unshift(exact);
				}
			}

			results = next;
			resultsOffset = offset + tests.length;
			hasMore = hasMoreResults;
			status = 'done';
			if (append) loadingMore = false;
		} catch (fetchError) {
			if (fetchError?.name === 'AbortError' || searchAbort !== controller) return;
			if (!append) {
				results = [];
				hasMore = false;
			}
			status = 'done';
			if (append) loadingMore = false;
		}
	}

	function doSearch(q) {
		const normalized = q.trim();
		const isSearchable = normalized.length >= 4 || /^\d+$/.test(normalized);

		if (normalized.length > 0) {
			trackDebounced('search:keystroke', { length: normalized.length }, 500);
		}

		if (!isSearchable) {
			const cached = getFreshRecent();
			if (cached && normalized === '') {
				results = cached.tests;
				hasMore = cached.hasMore;
				resultsOffset = cached.tests.length;
				status = 'done';
			} else if (status !== 'loading') {
				status = 'loading';
				results = [];
				void fetchSearchList(normalized.length >= 4 ? normalized : '', 0, false);
			}
			return;
		}

		status = 'loading';
		results = [];
		resultsOffset = 0;
		hasMore = false;

		if (searchTimer) window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => {
			void fetchSearchList(normalized, 0, false);
		}, SEARCH_DEBOUNCE_MS);
	}

	$effect(() => {
		const nextQuery = query;
		// Track only query; state writes inside doSearch must not re-trigger
		// this effect (a failing request would otherwise loop forever).
		untrack(() => doSearch(nextQuery));
	});

	// Lets the composer keep `aria-expanded` honest about the suggestion list
	// (both variants render inside the same panel slot it controls).
	$effect(() => {
		onlistcount(status === 'done' ? results.length : 0);
	});

	function handleLoadMore() {
		if (status !== 'done' || !hasMore || loadingMore) return;
		const normalized = query.trim();
		const isSearchable = normalized.length >= 4 || /^\d+$/.test(normalized);
		track('search:scroll-more', { offset: resultsOffset });
		void fetchSearchList(isSearchable ? normalized : '', resultsOffset, true);
	}

	function handleResultClick(testId) {
		track('search:result-click', { id: testId });
		onnavigate(testId);
	}

	function handleScroll() {
		const box = resultsRef;
		if (!box || !hasMore || loadingMore) return;
		if (box.scrollTop + box.clientHeight >= box.scrollHeight - 48) {
			handleLoadMore();
		}
	}
</script>

{#if variant === 'strip'}
	{#if isSearchable && status === 'done' && results.length > 0}
		<div class="search-strip" role="group" aria-labelledby="planner-past-tests-label">
			<span class="sr-only" role="status" aria-live="polite">
				{$t('plannerPastTestsCount', { count: results.length })}
			</span>
			<span class="strip-label" id="planner-past-tests-label">{$t('plannerPastTests')}</span>
			<div class="strip-items">
				{#each results.slice(0, STRIP_MAX_RESULTS) as test (test.id)}
					<button
						class="strip-chip"
						type="button"
						onclick={() => handleResultClick(test.id)}
					>
						<span class="strip-topic">{test.topic || $t('untitledTest')}</span>
						<span class="strip-id">{$t('testId')}: {test.id}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
{:else}
	<div class="search-dropdown" bind:this={resultsRef} onscroll={handleScroll}>
		<span class="sr-only" role="status" aria-live="polite">
			{#if status === 'loading' && results.length === 0}
				{$t('searchingTests')}
			{:else if status === 'done' && otherResults.length > 0}
				{$t('matchingTests')}: {otherResults.length}
			{:else if status === 'done' && isSearchable && blocked}
				{$t('rateLimitExceededRetry')}
			{:else if status === 'done' && isSearchable}
				{$t('noTestsFound')}
			{/if}
		</span>
		{#if exactTestIdMatch}
			<div class="dropdown-section">
				<span class="dropdown-section-title">{$t('exactMatch')}</span>
				<button
					class="dropdown-result"
					type="button"
					onclick={() => handleResultClick(exactTestIdMatch.id)}
				>
					<span class="result-icon" aria-hidden="true">&#128269;</span>
					<span class="result-text">
						<strong>{exactTestIdMatch.topic || $t('untitledTest')}</strong>
						<span class="result-meta">
							{exactTestIdMatch.test_mode === 'full-exam'
								? $t('fullExamPaper')
								: $t('quizPractice')} &middot; {$t('testId')}: {exactTestIdMatch.id}
						</span>
					</span>
				</button>
			</div>
		{/if}

		{#if status === 'loading' && results.length === 0}
			<div class="dropdown-section">
				<span class="dropdown-section-title">{$t('searchingTests')}</span>
			</div>
		{:else if status === 'done' && otherResults.length > 0}
			<div class="dropdown-section">
				<span class="dropdown-section-title">
					{isSearchable ? $t('matchingTests') : $t('recentTests')}
				</span>
				{#each otherResults as test (test.id)}
					<button
						class="dropdown-result"
						type="button"
						onclick={() => handleResultClick(test.id)}
					>
						<span class="result-text">
							<strong>{test.topic || $t('untitledTest')}</strong>
							<span class="result-meta">
								{test.test_mode === 'full-exam'
									? $t('fullExamPaper')
									: $t('quizPractice')} &middot; {$t('testId')}: {test.id}
							</span>
						</span>
					</button>
				{/each}
				{#if loadingMore}
					<div class="dropdown-loading">{$t('searchingTests')}</div>
				{/if}
				{#if isSearchable && trimmedQuery}
					<p class="dropdown-hint">{$t('plannerEnterToPlan')}</p>
				{/if}
			</div>
		{:else if status === 'done' && otherResults.length === 0 && !exactTestIdMatch && isSearchable && blocked}
			<div class="dropdown-section">
				<span class="dropdown-empty">{$t('rateLimitExceededRetry')}</span>
			</div>
		{:else if status === 'done' && otherResults.length === 0 && !exactTestIdMatch && isSearchable}
			<div class="dropdown-section">
				<span class="dropdown-section-title">{$t('noTestsFound')}</span>
				<button
					class="dropdown-generate"
					type="button"
					onclick={() => ongenerate(trimmedQuery)}
				>
					<span class="generate-icon" aria-hidden="true">⚡</span>
					<span class="generate-text">
						<span class="generate-label">{$t('plannerGenerateNew')}</span>
						<span class="generate-query">{trimmedQuery}</span>
					</span>
				</button>
			</div>
		{:else if !isSearchable && otherResults.length === 0 && status === 'done'}
			<div class="dropdown-section">
				<span class="dropdown-empty">{$t('startTypingToGenerate')}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.search-dropdown {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		right: 0;
		z-index: 40;
		/* --search-top is measured by the composer: the real space between the
		   input and the top of the visible area. The visible top is whichever is
		   lower: the safe area (status bar / Dynamic Island) or the sticky app
		   header, so the panel's title never hides behind either. */
		max-height: max(
			140px,
			min(
				340px,
				calc(
					var(--search-top, 100dvh) -
						max(env(safe-area-inset-top, 0px), var(--search-block-top, 0px)) - 20px
				)
			)
		);
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
		animation: dropdown-in 0.12s ease;
		overscroll-behavior: contain;
	}

	.search-strip {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		margin: 0 2px 8px;
		min-width: 0;
	}

	.strip-label {
		flex-shrink: 0;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.strip-items {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
		padding: 2px 2px 4px;
	}

	.strip-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: 1 1 120px;
		min-width: 0;
		max-width: 240px;
		min-height: 44px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.strip-chip:hover,
	.strip-chip:active {
		border-color: rgba(var(--brand-rgb), 0.45);
		background: rgba(var(--brand-rgb), 0.06);
	}

	.strip-topic {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.strip-id {
		flex-shrink: 0;
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	@keyframes dropdown-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-section {
		padding: 4px 0;
	}

	.dropdown-section-title {
		display: block;
		padding: 8px 16px 4px;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.dropdown-empty {
		display: block;
		padding: 16px;
		text-align: center;
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.dropdown-result {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 16px;
		border: 0;
		background: transparent;
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition: background 0.08s ease;
		min-height: 44px;
	}

	.dropdown-result:hover {
		background: var(--surface-muted);
	}

	.result-icon {
		flex-shrink: 0;
		font-size: 0.9rem;
		opacity: 0.6;
	}

	.result-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.result-text strong {
		font-size: 0.85rem;
		word-break: break-word;
	}

	.result-meta {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.dropdown-loading {
		padding: 10px 16px;
		font-size: 0.78rem;
		color: var(--text-muted);
		text-align: center;
	}

	.dropdown-hint {
		margin: 0;
		padding: 8px 16px 10px;
		font-size: 0.74rem;
		color: var(--text-muted);
	}

	.dropdown-generate {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 16px;
		border: 0;
		background: rgba(var(--brand-rgb), 0.05);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		min-height: 56px;
		transition: background 0.12s ease;
	}

	.dropdown-generate:hover {
		background: rgba(var(--brand-rgb), 0.1);
	}

	.generate-icon {
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.generate-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.generate-label {
		font-size: 0.86rem;
		font-weight: 700;
		color: rgb(var(--brand-text-rgb));
	}

	.generate-query {
		font-size: 0.76rem;
		color: var(--text-muted);
		word-break: break-word;
	}
</style>
