<script>
	import { t } from '$lib/client/i18n';

	let {
		value = '',
		disabled = false,
		status = 'idle',
		onsubmit = () => {},
		onnavigate = () => {},
		oninput = () => {},
	} = $props();

	const EXAMPLES = [
		'Class 12 chemistry organic reactions for NEET',
		'10 JavaScript array questions for interview prep',
		'SSC CGL general awareness practice',
		'AWS DevOps basics for beginners',
		'UPSC Indian polity MCQs',
		'Python data structures coding practice',
	];

	const SEARCH_DEBOUNCE_MS = 350;
	const SEARCH_INITIAL_PAGE_SIZE = 10;
	const SEARCH_INCREMENT = 5;
	const RECENT_TTL_MS = 60_000;

	let currentExampleIndex = $state(0);
	let exampleInterval;
	let dropdownOpen = $state(false);
	let dropdownRef = $state(null);
	let inputRef = $state(null);
	let resultsRef = $state(null);

	let localSearchResults = $state([]);
	let localSearchStatus = $state('idle');
	let localHasMore = $state(false);
	let localLoadingMore = $state(false);
	let localResultsOffset = 0;
	let searchTimer;
	let searchAbort = null;
	let recentCache = null;

	function cycleExample() {
		if (typeof window !== 'undefined') {
			exampleInterval = setInterval(() => {
				currentExampleIndex = (currentExampleIndex + 1) % EXAMPLES.length;
			}, 3000);
		}
	}

	function clearExampleInterval() {
		if (exampleInterval) {
			clearInterval(exampleInterval);
			exampleInterval = null;
		}
	}

	$effect(() => {
		cycleExample();
		return clearExampleInterval;
	});

	const PARSING = $derived(status === 'parsing');
	const GENERATING = $derived(status === 'loading');
	const trimmedValue = $derived(value.trim());
	const isTestId = $derived(/^\d+$/.test(trimmedValue));
	const showDropdown = $derived(dropdownOpen && !PARSING && !GENERATING);
	const hasSearchResults = $derived(localSearchResults.length > 0);
	const searchDone = $derived(localSearchStatus === 'done');
	const exactTestIdMatch = $derived(
		isTestId ? localSearchResults.find((t) => String(t.id) === trimmedValue) : null
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
			localLoadingMore = true;
		} else {
			localSearchStatus = 'loading';
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
			const hasMore = response.ok && payload?.hasMore === true;

			if (!append && !q) {
				recentCache = { tests, hasMore, fetchedAt: Date.now() };
			}

			if (value.trim() !== q) return;

			let next = append ? [...localSearchResults, ...tests] : [...tests];
			if (!append && /^\d+$/.test(q)) {
				const exactIndex = next.findIndex((test) => String(test.id) === q);
				if (exactIndex > 0) {
					const [exact] = next.splice(exactIndex, 1);
					next.unshift(exact);
				}
			}

			localSearchResults = next;
			localResultsOffset = offset + tests.length;
			localHasMore = hasMore;
			localSearchStatus = 'done';
			if (append) localLoadingMore = false;
		} catch (fetchError) {
			if (fetchError?.name === 'AbortError' || searchAbort !== controller) return;
			if (value.trim() !== q) return;
			if (!append) {
				localSearchResults = [];
				localHasMore = false;
			}
			localSearchStatus = 'done';
			if (append) localLoadingMore = false;
		}
	}

	function doSearch(query) {
		const q = query.trim();
		const isSearchable = q.length >= 4 || /^\d+$/.test(q);

		if (!isSearchable) {
			const cached = getFreshRecent();
			if (cached && q === '') {
				localSearchResults = cached.tests;
				localHasMore = cached.hasMore;
				localResultsOffset = cached.tests.length;
				localSearchStatus = 'done';
			} else if (localSearchStatus !== 'loading') {
				localSearchStatus = 'loading';
				localSearchResults = [];
				void fetchSearchList(q.length >= 4 ? q : '', 0, false);
			}
			return;
		}

		localSearchStatus = 'loading';
		localSearchResults = [];
		localResultsOffset = 0;
		localHasMore = false;

		if (searchTimer) window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => {
			void fetchSearchList(q, 0, false);
		}, SEARCH_DEBOUNCE_MS);
	}

	function handleLoadMore() {
		if (localSearchStatus !== 'done' || !localHasMore || localLoadingMore) return;
		const q = value.trim();
		const isSearchable = q.length >= 4 || /^\d+$/.test(q);
		void fetchSearchList(isSearchable ? q : '', localResultsOffset, true);
	}

	function openDropdown() {
		dropdownOpen = true;
		clearExampleInterval();
		doSearch(value);
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	function handleSubmit(e) {
		e.preventDefault();
		if (!trimmedValue || disabled || PARSING || GENERATING) return;
		clearExampleInterval();
		closeDropdown();

		if (exactTestIdMatch) {
			onnavigate(exactTestIdMatch.id);
			return;
		}
		if (isTestId) {
			onnavigate(trimmedValue);
			return;
		}
		if (searchDone && localSearchResults.length === 1) {
			onnavigate(localSearchResults[0].id);
			return;
		}
		onsubmit(trimmedValue);
	}

	function handleInputEvent() {
		oninput();
		if (!dropdownOpen) {
			openDropdown();
			return;
		}
		doSearch(value);
	}

	function handleFocus() {
		if (!dropdownOpen && !PARSING && !GENERATING) {
			openDropdown();
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') {
			closeDropdown();
			inputRef?.blur();
		} else if (e.key === 'Enter') {
			handleSubmit(e);
		}
	}

	function handleClickOutside(e) {
		if (dropdownRef && !dropdownRef.contains(e.target)) {
			closeDropdown();
		}
	}

	function fillExample(example) {
		value = example;
		clearExampleInterval();
		openDropdown();
	}

	function handleResultClick(testId) {
		closeDropdown();
		onnavigate(testId);
	}

	function handleDropdownScroll() {
		const box = resultsRef;
		if (!box || !localHasMore || localLoadingMore) return;
		if (box.scrollTop + box.clientHeight >= box.scrollHeight - 48) {
			handleLoadMore();
		}
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (dropdownOpen) {
			document.addEventListener('pointerdown', handleClickOutside);
			return () => document.removeEventListener('pointerdown', handleClickOutside);
		}
	});
</script>

<div class="intent-wrap" bind:this={dropdownRef}>
	<form class="intent-form" onsubmit={handleSubmit}>
		<div
			class="intent-input-group"
			class:parsing={PARSING}
			class:dropdown-visible={showDropdown}
		>
			<span class="intent-icon" aria-hidden="true">&#10024;</span>
			<input
				class="intent-input"
				type="text"
				bind:value
				bind:this={inputRef}
				oninput={handleInputEvent}
				onfocus={handleFocus}
				onkeydown={handleKeydown}
				placeholder={PARSING ? '' : EXAMPLES[currentExampleIndex]}
				disabled={disabled || PARSING || GENERATING}
				aria-label={$t('smartIntentPlaceholder')}
				autocomplete="off"
			/>
			{#if PARSING}
				<span class="intent-thinking" aria-label={$t('smartIntentParsing')}>
					<span></span><span></span><span></span>
				</span>
			{:else}
				<button
					class="intent-btn"
					type="submit"
					disabled={!trimmedValue || disabled || GENERATING}
					aria-label={$t('generateQuiz')}
				>
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path
							d="M4 10L16 10M16 10L11 5M16 10L11 15"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			{/if}
		</div>

		{#if showDropdown}
			<div class="intent-dropdown" bind:this={resultsRef} onscroll={handleDropdownScroll}>
				{#if trimmedValue && !isTestId}
					<button
						class="dropdown-generate"
						type="button"
						onclick={() => {
							closeDropdown();
							onsubmit(trimmedValue);
						}}
					>
						<span class="generate-icon" aria-hidden="true">&#9889;</span>
						<div class="generate-text">
							<span class="generate-label"
								>{$t('generateNew')}: "{trimmedValue.length > 60
									? trimmedValue.slice(0, 57) + '...'
									: trimmedValue}"</span
							>
							<span class="generate-hint">{$t('aiWillConfigureBest')}</span>
						</div>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							class="generate-arrow"
						>
							<path
								d="M3 8H13M13 8L9 4M13 8L9 12"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				{/if}

				{#if exactTestIdMatch}
					<div class="dropdown-section">
						<span class="dropdown-section-title">{$t('exactMatch')}</span>
						<button
							class="dropdown-result"
							type="button"
							onclick={() => handleResultClick(exactTestIdMatch.id)}
						>
							<span class="result-icon" aria-hidden="true">&#128269;</span>
							<div class="result-text">
								<strong>{exactTestIdMatch.topic || $t('untitledTest')}</strong>
								<span class="result-meta">
									{exactTestIdMatch.test_mode === 'full-exam'
										? $t('fullExamPaper')
										: $t('quizPractice')} &middot; {$t('testId')}: {exactTestIdMatch.id}
								</span>
							</div>
						</button>
					</div>
				{/if}

				{#if localSearchStatus === 'loading' && !hasSearchResults}
					<div class="dropdown-section">
						<span class="dropdown-section-title">{$t('loading')}</span>
					</div>
				{:else if searchDone && hasSearchResults}
					<div class="dropdown-section">
						<span class="dropdown-section-title">
							{trimmedValue ? $t('matchingTests') : $t('recentTests')}
						</span>
						{#each localSearchResults as test (test.id)}
							<button
								class="dropdown-result"
								type="button"
								onclick={() => handleResultClick(test.id)}
							>
								<div class="result-text">
									<strong>{test.topic || $t('untitledTest')}</strong>
									<span class="result-meta">
										{test.test_mode === 'full-exam'
											? $t('fullExamPaper')
											: $t('quizPractice')} &middot; {$t('testId')}: {test.id}
									</span>
								</div>
							</button>
						{/each}
						{#if localLoadingMore}
							<div class="dropdown-loading">{$t('loading')}</div>
						{/if}
					</div>
				{:else if searchDone && !hasSearchResults && trimmedValue}
					<div class="dropdown-section">
						<span class="dropdown-section-title">{$t('noTestsFound')}</span>
					</div>
				{/if}

				{#if !trimmedValue && !hasSearchResults && searchDone}
					<div class="dropdown-section">
						<span class="dropdown-empty">{$t('startTypingToGenerate')}</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if PARSING}
			<p class="intent-hint parsing-hint">{$t('smartIntentParsing')}</p>
		{/if}
	</form>

	{#if !PARSING && !GENERATING && !dropdownOpen}
		<div class="intent-examples">
			<span class="examples-label">{$t('welcomeTryThese')}</span>
			{#each EXAMPLES.slice(0, 4) as example (example)}
				<button class="example-chip" type="button" onclick={() => fillExample(example)}>
					{example.length > 55 ? example.slice(0, 52) + '...' : example}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.intent-wrap {
		max-width: 680px;
		margin: 0 auto;
		position: relative;
	}

	.intent-form {
		width: 100%;
		position: relative;
	}

	.intent-input-group {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 6px 6px 18px;
		border-radius: 20px;
		background: var(--surface);
		border: 2px solid var(--line);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			border-radius 0.2s ease;
		position: relative;
		z-index: 10;
	}

	.intent-input-group.dropdown-visible {
		border-radius: 20px 20px 0 0;
		border-bottom-color: transparent;
	}

	.intent-input-group:focus-within {
		border-color: rgb(var(--brand-rgb));
		box-shadow: 0 0 0 4px rgba(var(--brand-rgb), 0.12);
	}

	.intent-input-group.parsing {
		border-color: rgb(var(--brand-rgb));
		box-shadow: 0 0 0 4px rgba(var(--brand-rgb), 0.15);
		animation: parsing-glow 2s ease-in-out infinite;
	}

	.intent-input-group.parsing.dropdown-visible {
		border-radius: 20px;
		border-bottom-color: rgb(var(--brand-rgb));
	}

	@keyframes parsing-glow {
		0%,
		100% {
			box-shadow:
				0 0 0 4px rgba(var(--brand-rgb), 0.12),
				0 0 12px rgba(var(--brand-rgb), 0.06);
		}
		50% {
			box-shadow:
				0 0 0 6px rgba(var(--brand-rgb), 0.08),
				0 0 20px rgba(var(--brand-rgb), 0.1);
		}
	}

	.intent-icon {
		font-size: 1.3rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.intent-input {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		font-size: 16px;
		color: var(--text);
		padding: 12px 0;
		min-width: 0;
	}

	.intent-input::placeholder {
		color: var(--text-muted);
		opacity: 0.7;
		font-size: 16px;
	}

	.intent-input:disabled {
		opacity: 0.7;
	}

	.intent-thinking {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-right: 8px;
		flex-shrink: 0;
	}
	.intent-thinking span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgb(var(--brand-rgb));
		animation: thinking-dot 1.4s ease-in-out infinite;
	}
	.intent-thinking span:nth-child(2) {
		animation-delay: 0.16s;
	}
	.intent-thinking span:nth-child(3) {
		animation-delay: 0.32s;
	}

	.intent-btn {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 14px;
		background: rgb(var(--brand-rgb));
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			background 0.2s ease,
			transform 0.15s ease,
			opacity 0.15s ease;
	}

	.intent-btn:hover:not(:disabled) {
		background: rgba(var(--brand-rgb), 0.85);
		transform: scale(1.03);
	}

	.intent-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.intent-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.intent-dropdown {
		position: absolute;
		top: calc(100% - 2px);
		left: 0;
		right: 0;
		z-index: 9;
		max-height: min(60vh, 400px);
		overflow-y: auto;
		background: var(--surface);
		border: 2px solid rgb(var(--brand-rgb));
		border-top: 1px solid var(--line);
		border-radius: 0 0 20px 20px;
		box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
		animation: dropdown-in 0.12s ease;
		overscroll-behavior: contain;
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

	.dropdown-generate {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 16px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: rgba(var(--brand-rgb), 0.04);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition: background 0.12s ease;
	}

	.dropdown-generate:hover {
		background: rgba(var(--brand-rgb), 0.08);
	}

	.generate-icon {
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.generate-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.generate-label {
		font-weight: 600;
		font-size: 0.88rem;
		color: rgb(var(--brand-rgb));
		word-break: break-word;
	}

	.generate-hint {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.generate-arrow {
		flex-shrink: 0;
		color: rgb(var(--brand-rgb));
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

	.intent-hint {
		text-align: center;
		font-size: 0.82rem;
		color: var(--text-muted);
		margin: 10px 0 0;
	}

	.parsing-hint {
		color: rgb(var(--brand-rgb));
	}

	.intent-examples {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		justify-content: center;
	}

	.examples-label {
		font-size: 0.78rem;
		color: var(--text-muted);
		font-weight: 600;
		margin-right: 2px;
	}

	.example-chip {
		font-size: 0.82rem;
		padding: 8px 14px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface-muted);
		color: var(--text-muted);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease,
			background 0.15s ease;
		white-space: nowrap;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		min-height: 44px;
	}

	.example-chip:hover {
		border-color: rgb(var(--brand-rgb));
		color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.04);
	}
</style>
