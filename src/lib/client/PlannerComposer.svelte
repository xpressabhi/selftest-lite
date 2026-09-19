<script>
	import { t } from '$lib/client/i18n';
	import { isDataSaverActive } from '$lib/client/preferences';
	import { track } from '$lib/client/telemetry';
	import TestSearchDropdown from './TestSearchDropdown.svelte';

	let {
		value = $bindable(''),
		disabled = false,
		status = 'idle',
		onsubmit = () => {},
		onnavigate = () => {},
	} = $props();

	let searchOpen = $state(false);
	let wrapperRef = $state(null);
	let baselineHeight = 0;
	let blurTimer;

	const MOBILE_QUERY = '(max-width: 640px)';

	const PARSING = $derived(status === 'parsing');
	const trimmedValue = $derived(value.trim());
	const showStrip = $derived(
		!searchOpen &&
			!PARSING &&
			!$isDataSaverActive &&
			(trimmedValue.length >= 4 || /^\d+$/.test(trimmedValue))
	);

	function isMobileViewport() {
		return (
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia(MOBILE_QUERY).matches
		);
	}

	function keyboardIsOpen() {
		if (typeof window === 'undefined') return false;
		const viewport = window.visualViewport;
		const layoutDelta = baselineHeight - window.innerHeight;
		const visualDelta = viewport ? window.innerHeight - viewport.height : 0;
		return layoutDelta > 80 || visualDelta > 80;
	}

	function syncKeyboardViewport() {
		const viewport = window.visualViewport;
		if (!viewport) return;
		document.documentElement.style.setProperty('--vvh', `${Math.round(viewport.height)}px`);
	}

	function onViewportResize() {
		syncKeyboardViewport();
		if (!keyboardIsOpen()) {
			disableKeyboardMode();
			return;
		}
		const panel = wrapperRef?.closest('.planner-panel');
		panel?.scrollIntoView({ block: 'end' });
	}

	function onViewportScroll() {
		syncKeyboardViewport();
		if (!keyboardIsOpen()) {
			disableKeyboardMode();
		}
	}

	function enableKeyboardMode() {
		if (typeof window === 'undefined' || !isMobileViewport()) return;
		if (!baselineHeight) baselineHeight = window.innerHeight;
		document.documentElement.classList.add('keyboard-open');
		syncKeyboardViewport();
		window.visualViewport?.addEventListener('resize', onViewportResize);
		window.visualViewport?.addEventListener('scroll', onViewportScroll);
		window.addEventListener('resize', onViewportResize);
		const panel = wrapperRef?.closest('.planner-panel');
		panel?.scrollIntoView({ block: 'end' });
	}

	function disableKeyboardMode() {
		if (typeof window === 'undefined') return;
		baselineHeight = 0;
		document.documentElement.classList.remove('keyboard-open');
		document.documentElement.style.removeProperty('--vvh');
		window.visualViewport?.removeEventListener('resize', onViewportResize);
		window.visualViewport?.removeEventListener('scroll', onViewportScroll);
		window.removeEventListener('resize', onViewportResize);
	}

	function handleFocusIn() {
		window.clearTimeout(blurTimer);
		enableKeyboardMode();
	}

	function handleFocusOut(event) {
		const next = event.relatedTarget;
		if (next && wrapperRef?.contains(next)) return;
		// Keyboard users tabbing past the composer should not leave the overlay
		// hanging open over the page.
		if (searchOpen && (!next || !wrapperRef?.contains(next))) {
			closeSearch();
		}
		window.clearTimeout(blurTimer);
		blurTimer = window.setTimeout(() => {
			if (wrapperRef?.contains(document.activeElement)) return;
			if (!keyboardIsOpen()) {
				disableKeyboardMode();
			}
		}, 250);
	}

	$effect(() => {
		return () => {
			window.clearTimeout(blurTimer);
			disableKeyboardMode();
		};
	});

	function openSearch() {
		if (!searchOpen) {
			track('search:open');
		}
		searchOpen = true;
	}

	function closeSearch() {
		if (searchOpen) {
			track('search:close');
		}
		searchOpen = false;
	}

	function toggleSearch() {
		if (searchOpen) {
			closeSearch();
		} else {
			openSearch();
		}
	}

	function handleSubmit(event) {
		event.preventDefault();
		if (!trimmedValue || disabled || PARSING) return;
		closeSearch();
		if (/^\d+$/.test(trimmedValue)) {
			track('search:submit', { mode: 'open-test' });
			onnavigate(trimmedValue);
			return;
		}
		track('search:submit', { mode: 'generate', source: 'composer' });
		onsubmit(trimmedValue);
	}

	function handleGenerateNew(query) {
		const next = String(query || '').trim();
		if (!next) return;
		closeSearch();
		track('search:submit', { mode: 'generate', source: 'no-matches' });
		onsubmit(next);
	}

	function handleResultNavigate(testId) {
		closeSearch();
		onnavigate(testId);
	}

	function handleClickOutside(event) {
		if (wrapperRef && !wrapperRef.contains(event.target)) {
			closeSearch();
		}
	}

	function handleKeydown(event) {
		if (event.key === 'Escape' && searchOpen) {
			event.preventDefault();
			closeSearch();
		}
	}

	$effect(() => {
		if (typeof window === 'undefined' || !searchOpen) return;
		document.addEventListener('pointerdown', handleClickOutside);
		return () => document.removeEventListener('pointerdown', handleClickOutside);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="composer-wrap intent-wrap"
	bind:this={wrapperRef}
	onfocusin={handleFocusIn}
	onfocusout={handleFocusOut}
>
	<form class="composer-form" onsubmit={handleSubmit}>
		<div class="composer-group" class:parsing={PARSING}>
			<button
				class="composer-search"
				type="button"
				aria-label={$t('plannerSearchTests')}
				aria-expanded={searchOpen}
				aria-controls="planner-search-panel"
				onclick={toggleSearch}
			>
				<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.8" />
					<path
						d="M13.2 13.2L17 17"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
			</button>
			<input
				class="intent-input"
				type="text"
				bind:value
				placeholder={PARSING ? '' : $t('smartIntentPlaceholder')}
				disabled={disabled || PARSING}
				aria-label={$t('smartIntentPlaceholder')}
				autocomplete="off"
				enterkeyhint="send"
			/>
			{#if PARSING}
				<span class="composer-thinking" role="status" aria-label={$t('plannerThinking')}>
					<span></span><span></span><span></span>
				</span>
			{:else}
				<button
					class="composer-send"
					type="submit"
					disabled={!trimmedValue || disabled}
					aria-label={$t('generateQuiz')}
				>
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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
	</form>

	<!-- Rendered after the form for a logical tab order, shown above it via
	     CSS `order` so forward Tab from the input reaches the results. -->
	<div class="search-slot" id="planner-search-panel">
		{#if showStrip || searchOpen}
			<TestSearchDropdown
				query={value}
				variant={searchOpen ? 'overlay' : 'strip'}
				onnavigate={handleResultNavigate}
				ongenerate={handleGenerateNew}
			/>
		{/if}
	</div>
</div>

<style>
	.composer-wrap {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	.composer-form {
		width: 100%;
	}

	/* Visual order above the input; DOM order stays after it so forward Tab
	   from the input reaches the result chips and overlay rows. */
	.search-slot {
		order: -1;
	}

	.search-slot:empty {
		display: none;
	}

	.composer-group {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px 8px;
		border-radius: 20px;
		background: var(--surface);
		border: 2px solid var(--line);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.composer-group:focus-within {
		border-color: rgb(var(--brand-text-rgb));
		box-shadow: 0 0 0 4px rgba(var(--brand-rgb), 0.12);
	}

	.composer-group.parsing {
		border-color: rgb(var(--brand-text-rgb));
		box-shadow: 0 0 0 4px rgba(var(--brand-rgb), 0.15);
		animation: parsing-glow 2s ease-in-out infinite;
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

	:global(html.data-saver) .composer-group.parsing,
	:global(html.reduce-motion) .composer-group.parsing {
		animation: none;
	}

	.composer-search {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 14px;
		background: transparent;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}

	.composer-search:hover,
	.composer-search[aria-expanded='true'] {
		color: rgb(var(--brand-text-rgb));
		background: rgba(var(--brand-rgb), 0.08);
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

	.composer-thinking {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-right: 8px;
		flex-shrink: 0;
	}

	.composer-thinking span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgb(var(--brand-rgb));
		animation: thinking-dot 1.4s ease-in-out infinite;
	}

	.composer-thinking span:nth-child(2) {
		animation-delay: 0.16s;
	}

	.composer-thinking span:nth-child(3) {
		animation-delay: 0.32s;
	}

	:global(html.data-saver) .composer-thinking span,
	:global(html.reduce-motion) .composer-thinking span {
		animation: none;
		opacity: 0.7;
	}

	@keyframes thinking-dot {
		0%,
		60%,
		100% {
			opacity: 0.35;
			transform: translateY(0);
		}
		30% {
			opacity: 1;
			transform: translateY(-3px);
		}
	}

	.composer-send {
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

	.composer-send:hover:not(:disabled) {
		background: rgba(var(--brand-rgb), 0.85);
		transform: scale(1.03);
	}

	.composer-send:active:not(:disabled) {
		transform: scale(0.97);
	}

	.composer-send:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
</style>
