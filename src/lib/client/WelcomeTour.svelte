<script>
	import { onMount, tick } from 'svelte';
	import { focusTrap } from '$lib/client/focusTrap';
	import Icon from '$lib/client/Icon.svelte';
	import { activeLanguage, t, translate } from '$lib/client/i18n';
	import { getDictionary, loadDictionary } from '$lib/client/locales';
	import { track } from '$lib/client/telemetry';

	let {
		step = 1,
		onlanguage = () => {},
		onback = () => {},
		onnext = () => {},
		onskip = () => {},
		onfill = () => {},
	} = $props();

	const STEP_COUNT = 5;
	const HALO = 8;
	const GUTTER = 16;
	const CARD_GAP = 12;
	const CARD_MAX_WIDTH = 340;
	const STEP_INDEXES = [1, 2, 3, 4, 5];

	const LANGUAGES = [
		{ id: 'english', label: 'English' },
		{ id: 'hindi', label: 'हिंदी' },
	];

	// Spotlight targets are the repository's stable test hooks, so the tour
	// follows the live layout instead of hard-coded coordinates.
	const STEPS = [
		{
			key: 'language',
			target: '.lang-toggle',
			titleKey: 'welcomeTourLanguageTitle',
			bodyKey: '',
		},
		{
			key: 'composer',
			target: '.intent-input',
			titleKey: 'welcomeTourStartTitle',
			bodyKey: 'welcomeTourStartBody',
		},
		{
			key: 'examples',
			target: '.welcome-gallery',
			titleKey: 'welcomeTourExamplesTitle',
			bodyKey: 'welcomeTourExamplesBody',
		},
		{
			key: 'daily',
			target: '.daily-five-row',
			titleKey: 'welcomeTourDailyTitle',
			bodyKey: 'welcomeTourDailyBody',
		},
		{
			key: 'streak',
			target: '.streak-card',
			titleKey: 'welcomeTourStreakTitle',
			bodyKey: 'welcomeTourStreakBody',
		},
	];

	const meta = $derived(STEPS[step - 1] ?? STEPS[0]);
	const isFirst = $derived(step <= 1);
	const isLast = $derived(step >= STEP_COUNT);

	let spotlight = $state(null);
	let cardPosition = $state(null);
	let cardEl = $state(null);
	let titleEl = $state(null);
	let otherLanguageTitle = $state('');
	let watchTimer = null;
	let lastFocusedStep = null;

	// Step 1 speaks both scripts: the current one in the title, the other one
	// underneath, so a visitor who cannot read the current UI language still
	// understands the choice (the Hindi dictionary is loaded lazily).
	const subtitle = $derived(
		$activeLanguage === 'english'
			? otherLanguageTitle
			: translate('welcomeTourLanguageTitle', 'english')
	);

	function prefersReducedMotion() {
		return (
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		);
	}

	function measureSpotlight() {
		if (!meta.target) {
			spotlight = null;
			centerCard();
			return;
		}
		const target = document.querySelector(meta.target);
		if (!target) {
			spotlight = null;
			centerCard();
			return;
		}
		const rect = target.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) {
			// Hidden at this breakpoint (e.g. desktop-only controls): fall back
			// to a centered card instead of a zero-size spotlight.
			spotlight = null;
			centerCard();
			return;
		}
		const next = {
			x: rect.left - HALO,
			y: rect.top - HALO,
			width: rect.width + HALO * 2,
			height: rect.height + HALO * 2,
		};
		if (
			!spotlight ||
			Math.abs(spotlight.x - next.x) > 0.5 ||
			Math.abs(spotlight.y - next.y) > 0.5 ||
			Math.abs(spotlight.width - next.width) > 0.5 ||
			Math.abs(spotlight.height - next.height) > 0.5
		) {
			spotlight = next;
		}
		placeCard();
	}

	function centerCard() {
		if (!cardEl) {
			return;
		}
		const cardRect = cardEl.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const width = Math.min(cardRect.width || CARD_MAX_WIDTH, viewportWidth - GUTTER * 2);
		const height = cardRect.height;
		cardPosition = {
			x: Math.max(GUTTER, (viewportWidth - width) / 2),
			y: Math.max(GUTTER, (viewportHeight - height) / 2),
		};
	}

	function placeCard() {
		if (!spotlight || !cardEl) {
			return;
		}
		const cardRect = cardEl.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const width = Math.min(cardRect.width || CARD_MAX_WIDTH, viewportWidth - GUTTER * 2);
		const height = cardRect.height;
		const x = Math.min(
			Math.max(spotlight.x + spotlight.width / 2 - width / 2, GUTTER),
			Math.max(GUTTER, viewportWidth - width - GUTTER)
		);
		const below = spotlight.y + spotlight.height + CARD_GAP;
		const above = spotlight.y - CARD_GAP - height;
		let y;
		if (below + height <= viewportHeight - GUTTER) {
			y = below;
		} else if (above >= GUTTER) {
			y = above;
		} else {
			// Neither side fits: park on whichever half the target is not in.
			y =
				spotlight.y + spotlight.height / 2 < viewportHeight / 2
					? viewportHeight - height - GUTTER
					: GUTTER;
		}
		// Never cover the highlighted target.
		const overlaps = y < spotlight.y + spotlight.height && y + height > spotlight.y;
		if (overlaps) {
			y =
				spotlight.y + spotlight.height / 2 < viewportHeight / 2
					? viewportHeight - height - GUTTER
					: GUTTER;
		}
		y = Math.min(Math.max(y, GUTTER), Math.max(GUTTER, viewportHeight - height - GUTTER));
		if (
			!cardPosition ||
			Math.abs(cardPosition.x - x) > 0.5 ||
			Math.abs(cardPosition.y - y) > 0.5
		) {
			cardPosition = { x, y };
		}
	}

	function handleViewportChange() {
		measureSpotlight();
	}

	onMount(() => {
		if ($activeLanguage === 'english') {
			void loadDictionary('hindi').then(() => {
				otherLanguageTitle = getDictionary('hindi').welcomeTourLanguageTitle || '';
			});
		}
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		// The header and page settle after hydration (the sign-in control
		// changes width), so keep watching at a low rate and update only when
		// the target actually moved.
		watchTimer = window.setInterval(measureSpotlight, 250);
		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('orientationchange', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, { passive: true });
		return () => {
			document.body.style.overflow = previousOverflow;
			window.clearInterval(watchTimer);
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('orientationchange', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange);
		};
	});

	$effect(() => {
		// Re-run on every step change; meta already derives from step.
		const currentStep = step;
		const target = meta.target;
		if (typeof document !== 'undefined' && target) {
			document.querySelector(target)?.scrollIntoView({
				block: 'center',
				behavior: prefersReducedMotion() ? 'auto' : 'smooth',
			});
		}
		void tick().then(() => {
			measureSpotlight();
			if (lastFocusedStep !== null && currentStep !== lastFocusedStep) {
				titleEl?.focus({ preventScroll: true });
			}
			lastFocusedStep = currentStep;
		});
		track('tour:step', { step: currentStep });
	});
</script>

<div class="welcome-tour" data-step={step}>
	{#if spotlight}
		<div
			class="welcome-tour-spotlight"
			style="left: {spotlight.x}px; top: {spotlight.y}px; width: {spotlight.width}px; height: {spotlight.height}px;"
		></div>
	{/if}

	<div
		class="welcome-tour-backdrop"
		class:solid={!spotlight}
		role="presentation"
		onclick={onskip}
		onwheel={(event) => event.preventDefault()}
		ontouchmove={(event) => event.preventDefault()}
	></div>

	<div
		class="welcome-tour-card"
		class:ready={Boolean(cardPosition)}
		style={cardPosition ? `left: ${cardPosition.x}px; top: ${cardPosition.y}px;` : ''}
		role="dialog"
		aria-modal="true"
		aria-labelledby="welcome-tour-title"
		tabindex="-1"
		use:focusTrap={{ onEscape: onskip }}
		bind:this={cardEl}
	>
		<div class="welcome-tour-head">
			<h2 class="welcome-tour-title" id="welcome-tour-title" tabindex="-1" bind:this={titleEl}>
				{$t(meta.titleKey)}
			</h2>
			<button class="welcome-tour-skip" type="button" onclick={onskip}>
				{$t('welcomeTourSkip')}
			</button>
		</div>

		{#if meta.key === 'language'}
			{#if subtitle}
				<p class="welcome-tour-subtitle" lang={$activeLanguage === 'english' ? 'hi' : 'en'}>
					{subtitle}
				</p>
			{/if}
			<div class="welcome-tour-languages">
				{#each LANGUAGES as language (language.id)}
					<button
						class="welcome-tour-lang"
						class:selected={$activeLanguage === language.id}
						data-lang={language.id}
						type="button"
						aria-pressed={$activeLanguage === language.id}
						data-autofocus={step === 1 && language.id === 'english' ? '' : undefined}
						onclick={() => onlanguage(language.id)}
					>
						<span>{language.label}</span>
						{#if $activeLanguage === language.id}
							<span class="welcome-tour-check" aria-hidden="true"
								><Icon name="check" size={16} /></span
							>
						{/if}
					</button>
				{/each}
			</div>
			<p class="welcome-tour-hint">{$t('welcomeTourLanguageHint')}</p>
		{:else if meta.bodyKey}
			<p class="welcome-tour-body">{$t(meta.bodyKey)}</p>
		{/if}

		<footer class="welcome-tour-controls">
			<span class="welcome-tour-dots" aria-hidden="true">
				{#each STEP_INDEXES as index (index)}
					<span class="welcome-tour-dot" class:active={index === step}></span>
				{/each}
			</span>
			<span class="welcome-tour-buttons">
				{#if !isFirst}
					<button
						class="btn btn-sm btn-outline-secondary welcome-tour-back"
						type="button"
						onclick={onback}
					>
						{$t('welcomeTourBack')}
					</button>
				{/if}
				{#if isLast}
					<button
						class="btn btn-sm btn-primary welcome-tour-fill"
						type="button"
						data-autofocus={step === STEP_COUNT ? '' : undefined}
						onclick={onfill}
					>
						{$t('welcomeTourFill')}
					</button>
				{:else}
					<button
						class="btn btn-sm btn-primary welcome-tour-next"
						type="button"
						data-autofocus={step > 1 ? '' : undefined}
						onclick={onnext}
					>
						{$t('welcomeTourNext')}
					</button>
				{/if}
			</span>
			<span class="sr-only welcome-tour-counter" aria-live="polite">
				{$t('welcomeTourStepCounter', { current: step, total: STEP_COUNT })}
			</span>
		</footer>
	</div>
</div>

<style>
	.welcome-tour {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
	}

	.welcome-tour-backdrop {
		position: fixed;
		inset: 0;
	}

	.welcome-tour-backdrop.solid {
		background: var(--backdrop);
	}

	.welcome-tour-spotlight {
		position: fixed;
		border: 2px solid var(--brand-text);
		border-radius: var(--radius-surface);
		box-shadow: 0 0 0 100vmax var(--backdrop);
		transition:
			left 0.24s ease,
			top 0.24s ease,
			width 0.24s ease,
			height 0.24s ease;
		pointer-events: none;
	}

	.welcome-tour-card {
		position: fixed;
		width: calc(100vw - 32px);
		max-width: 340px;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		box-shadow: var(--shadow-2);
		opacity: 0;
		transition:
			left 0.24s ease,
			top 0.24s ease,
			opacity 0.18s ease;
	}

	.welcome-tour-card.ready {
		opacity: 1;
	}

	.welcome-tour-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}

	.welcome-tour-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--text);
	}

	.welcome-tour-title:focus-visible {
		outline: none;
	}

	.welcome-tour-skip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		margin: -10px -10px 0 0;
		padding: 0 10px;
		border: 0;
		background: none;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.welcome-tour-skip:hover {
		color: var(--text);
	}

	.welcome-tour-subtitle {
		margin: 2px 0 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.welcome-tour-languages {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}

	.welcome-tour-lang {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
		padding: 10px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
	}

	.welcome-tour-lang.selected {
		border-color: var(--brand-text);
		color: var(--brand-text);
	}

	.welcome-tour-check {
		display: inline-flex;
		color: var(--brand-text);
	}

	.welcome-tour-hint {
		margin: 10px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.welcome-tour-body {
		margin: 10px 0 0;
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--text);
	}

	.welcome-tour-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 14px;
	}

	.welcome-tour-dots {
		display: inline-flex;
		gap: 6px;
	}

	.welcome-tour-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--line);
	}

	.welcome-tour-dot.active {
		background: var(--brand-text);
	}

	.welcome-tour-buttons {
		display: inline-flex;
		gap: 8px;
	}

	@media (prefers-reduced-motion: reduce) {
		.welcome-tour-spotlight,
		.welcome-tour-card {
			transition: none;
		}
	}
</style>
