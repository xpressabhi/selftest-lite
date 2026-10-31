<script>
	import { t } from '#lib/client/i18n.js';
	import Icon from './Icon.svelte';
	import { canvasFont } from './fontStack.js';

	let {
		messages = [],
		pendingClarify = null,
		status = 'idle',
		recentTests = [],
		weakTopic = null,
		planCard = null,
		welcome = false,
		showTip = true,
		exampleGroups = [],
		onquickreply = () => {},
		onskip = () => {},
		onstartover = () => {},
		onopentest = () => {},
		onpracticetopic = () => {},
		onexample = () => {},
		onrecenttouch = () => {},
	} = $props();

	let logRef = $state(null);
	let repliesRef = $state(null);
	let lastClarifyId = null;
	let pinnedToBottom = true;

	const PARSING = $derived(status === 'parsing');
	const hasConversation = $derived(messages.length > 0 || Boolean(pendingClarify));
	const showIdleState = $derived(!hasConversation && !planCard && !PARSING);

	// A multiline bubble in a flex row takes its full max-width even when its
	// longest line is much shorter. Measure the tight width after the message
	// settles (idle, and never on Save-Data) and let the bubble shrink to it.
	const TIGHT_MIN_LENGTH = 48;
	const TIGHT_MIN_SAVING = 12;
	let bubbleMeasureToken = 0;

	function bubbleNodes() {
		if (!logRef) {
			return [];
		}
		return Array.from(
			logRef.querySelectorAll('.chat-bubble-user, .chat-bubble-assistant')
		).filter(
			(node) =>
				!node.classList.contains('chat-question') &&
				!node.classList.contains('chat-thinking')
		);
	}

	function clearTightBubbleWidths() {
		bubbleMeasureToken += 1;
		for (const node of bubbleNodes()) {
			node.style.removeProperty('width');
			delete node.dataset.tightWidth;
		}
	}

	async function measureTightBubbles() {
		if (typeof window === 'undefined' || !logRef) {
			return;
		}
		if (navigator.connection?.saveData) {
			return;
		}
		if (
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-data: reduce)').matches
		) {
			return;
		}
		const nodes = bubbleNodes();
		const logWidth = logRef.clientWidth;
		if (nodes.length === 0 || logWidth <= 0) {
			return;
		}
		const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		const font = canvasFont(Math.round(root * 0.9), 400);
		const lineHeight = root * 0.9 * 1.45;
		const { tightWidth, measureNaturalWidth } = await import('./pretextLayout.js');
		const chWidth = (await measureNaturalWidth('0', font)) || root * 0.5;
		const contentMax = Math.max(
			120,
			Math.min(Math.floor(logWidth * 0.86), Math.floor(chWidth * 72)) - 28
		);
		const token = ++bubbleMeasureToken;
		for (const node of nodes) {
			if (token !== bubbleMeasureToken) {
				return;
			}
			const text = (node.textContent || '').trim();
			if (text.length < TIGHT_MIN_LENGTH) {
				continue;
			}
			const result = await tightWidth(text, font, contentMax, lineHeight);
			if (!result || result.lineCount < 2) {
				continue;
			}
			const width = Math.ceil(result.width + 28);
			if (width <= contentMax + 28 - TIGHT_MIN_SAVING) {
				node.style.width = `${width}px`;
				node.dataset.tightWidth = 'true';
			}
		}
	}

	function scrollLogToBottom(force = false) {
		const log = logRef;
		if (!log) return;
		if (force) pinnedToBottom = true;
		if (pinnedToBottom) {
			log.scrollTop = log.scrollHeight;
		}
	}

	$effect(() => {
		// Reference the collections so new messages/questions scroll into view.
		messages.length;
		pendingClarify;
		status;
		if (welcome) {
			// The welcome gallery reads top-down: open at the greeting, never
			// scrolled to the bottom of the example list.
			pinnedToBottom = false;
			if (logRef) logRef.scrollTop = 0;
			return;
		}
		scrollLogToBottom(true);
	});

	$effect(() => {
		// Keep growing content (plan card, quick replies, chips) in view when the
		// reader is already at the bottom; never yank them down while reading.
		// Idle-state rows (recent tests, examples) must never trigger a scroll:
		// a scroll between touchstart and click moves the tapped row and opens
		// the wrong test.
		const log = logRef;
		if (!log || typeof MutationObserver === 'undefined') return;
		let frame = 0;
		const schedule = () => {
			if (!pinnedToBottom || frame || !hasConversation) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				scrollLogToBottom();
			});
		};
		const onScroll = () => {
			pinnedToBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
		};
		const observer = new MutationObserver(schedule);
		observer.observe(log, { childList: true, subtree: true, characterData: true });
		const resizeObserver = new ResizeObserver(schedule);
		resizeObserver.observe(log);
		log.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			observer.disconnect();
			resizeObserver.disconnect();
			log.removeEventListener('scroll', onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	$effect(() => {
		// Re-measure when the conversation grows. Pretext is imported inside the
		// idle callback so the home page never pays for it during first paint.
		const list = messages;
		const clarifyId = pendingClarify?.id;
		if (list.length === 0 && !clarifyId) {
			return;
		}
		let cancelled = false;
		const run = () => {
			if (!cancelled) {
				void measureTightBubbles();
			}
		};
		const idle = typeof requestIdleCallback === 'function';
		const handle = idle ? requestIdleCallback(run, { timeout: 900 }) : setTimeout(run, 150);
		return () => {
			cancelled = true;
			if (idle && typeof cancelIdleCallback === 'function') {
				cancelIdleCallback(handle);
			} else {
				clearTimeout(handle);
			}
		};
	});

	$effect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		let timer = 0;
		const onResize = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				clearTightBubbleWidths();
				void measureTightBubbles();
			}, 180);
		};
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			window.clearTimeout(timer);
		};
	});

	$effect(() => {
		const clarifyId = pendingClarify?.id ?? null;
		if (clarifyId && clarifyId !== lastClarifyId && repliesRef && !PARSING) {
			// Move keyboard focus to the options only on devices where a focus
			// ring makes sense; on touch screens it just flashes a highlight.
			const finePointer =
				typeof window !== 'undefined' &&
				typeof window.matchMedia === 'function' &&
				window.matchMedia('(hover: hover) and (pointer: fine)').matches;
			if (finePointer) {
				const firstReply = repliesRef.querySelector('button');
				firstReply?.focus({ preventScroll: true });
			}
		}
		lastClarifyId = clarifyId;
	});

	function optionLabel(option) {
		if (option.labelKey) {
			return $t(option.labelKey);
		}
		return option.label || option.value;
	}

	// First visit: three examples is enough to show the shape of a prompt, and
	// it keeps every row whole inside the panel on a 640px-tall phone. The rest
	// stays one tap away instead of being clipped mid-row.
	let showAllExamples = $state(false);
	let visibleExampleGroups = $derived.by(() => {
		if (showAllExamples) {
			return exampleGroups;
		}
		// One example per group while collapsed: it keeps all three labels
		// visible (exam, school, skills) without turning the first screen into
		// a six-row menu.
		return exampleGroups
			.slice(0, 3)
			.map((group) => ({ ...group, examples: group.examples.slice(0, 1) }))
			.filter((group) => group.examples.length > 0);
	});
	let totalExampleCount = $derived(
		exampleGroups.reduce((total, group) => total + group.examples.length, 0)
	);
	let hiddenExampleCount = $derived(
		totalExampleCount -
			visibleExampleGroups.reduce((total, group) => total + group.examples.length, 0)
	);
</script>

<section class="chat-thread" aria-label={$t('plannerChatLabel')}>
	<div class="chat-header">
		<h2 class="chat-title">{$t('plannerChatTitle')}</h2>
		{#if hasConversation || planCard}
			<button class="chat-reset" type="button" onclick={onstartover}>
				{$t('plannerStartOver')}
			</button>
		{/if}
	</div>

	<div
		class="chat-log"
		class:chat-bottom={!showIdleState}
		class:chat-gallery={showIdleState && welcome}
		role={welcome ? undefined : 'log'}
		aria-live={welcome ? undefined : 'polite'}
		bind:this={logRef}
	>
		{#if showIdleState}
			<div class="chat-idle">
				{#if welcome}
					<div class="welcome-gallery" class:is-expanded={showAllExamples}>
						<div class="welcome-greeting">{$t('plannerWelcomeGreeting')}</div>
						{#each visibleExampleGroups as group (group.labelKey)}
							<div class="welcome-group">
								<span class="welcome-group-label">{$t(group.labelKey)}</span>
								{#each group.examples as example (example.key)}
									<button
										class="welcome-example"
										type="button"
										onclick={() => onexample(example)}
									>
										<span class="welcome-example-label">{$t(example.key)}</span>
										<Icon name="chevron-right" size={16} />
									</button>
								{/each}
							</div>
						{/each}
						{#if hiddenExampleCount > 0 || showAllExamples}
							<button
								class="welcome-more"
								type="button"
								aria-expanded={showAllExamples}
								onclick={() => (showAllExamples = !showAllExamples)}
							>
								{showAllExamples
									? $t('plannerFewerExamples')
									: $t('plannerMoreExamples', { count: hiddenExampleCount })}
							</button>
						{/if}
					</div>
				{:else if recentTests.length > 0}
					<div class="recent-block" role="presentation" onpointerdown={onrecenttouch}>
						<span class="recent-title">{$t('plannerRecentTests')}</span>
						{#each recentTests as test (test.id)}
							<button
								class="recent-item"
								type="button"
								onclick={() => onopentest(test.id)}
							>
								<span class="recent-topic">{test.topic || $t('untitledTest')}</span>
								<span class="recent-meta">{test.meta}</span>
							</button>
						{/each}
						<a class="recent-all" href="/history">{$t('plannerViewAll')}</a>
						{#if weakTopic}
							<button
								class="weak-topic"
								type="button"
								onclick={() => onpracticetopic(weakTopic.topic)}
							>
								<span class="weak-topic-eyebrow">{$t('plannerWeakTopic')}</span>
								<span class="weak-topic-name">{weakTopic.topic}</span>
								<span class="weak-topic-meta"
									>{$t('plannerWeakTopicMeta', {
										accuracy: weakTopic.averageAccuracy,
									})}</span
								>
							</button>
						{/if}
					</div>
				{:else}
					<p class="chat-idle-hint">{$t('plannerWelcomeGreeting')}</p>
				{/if}
			</div>
		{/if}

		{#each messages as message (message.id)}
			{#if message.role === 'system'}
				<p class="chat-system">
					{$t(message.messageKey || 'plannerPlanEdited', message.messageParams)}
				</p>
			{:else if message.role === 'user'}
				<div class="chat-row chat-row-user">
					<div
						class="chat-bubble chat-bubble-user"
						role="group"
						aria-label={$t('plannerYou')}
					>
						{message.text}
					</div>
				</div>
			{:else}
				<div class="chat-row chat-row-assistant">
					<div
						class="chat-bubble chat-bubble-assistant"
						role="group"
						aria-label={$t('plannerAssistant')}
					>
						{#if message.messageKey}
							{$t(message.messageKey, {
								...message.messageParams,
								count: message.messageParams?.numQuestions,
							})}
						{:else}
							{message.text}
						{/if}
					</div>
				</div>
			{/if}
		{/each}

		{#if pendingClarify}
			<div class="chat-row chat-row-assistant">
				<div class="chat-bubble chat-bubble-assistant chat-question">
					{$t(pendingClarify.promptKey, pendingClarify.params)}
					<div
						class="chat-replies"
						bind:this={repliesRef}
						role="group"
						aria-label={$t('plannerQuickReplies')}
					>
						{#each pendingClarify.options as option (option.value)}
							<button
								class="chat-reply"
								type="button"
								onclick={() =>
									onquickreply({ ...option, label: optionLabel(option) })}
							>
								{optionLabel(option)}
							</button>
						{/each}
						{#if pendingClarify.allowSkip}
							<button class="chat-reply chat-skip" type="button" onclick={onskip}>
								{$t('plannerSkip')}
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		{#if PARSING}
			<div class="chat-row chat-row-assistant">
				<div
					class="chat-bubble chat-bubble-assistant chat-thinking"
					role="status"
					aria-label={$t('plannerThinking')}
				>
					<span class="typing-dot"></span>
					<span class="typing-dot"></span>
					<span class="typing-dot"></span>
				</div>
			</div>
		{/if}

		{#if planCard}
			<div class="chat-plan">{@render planCard()}</div>
		{/if}
	</div>

	{#if welcome && showTip}
		<p class="welcome-tip">{$t('plannerWelcomeTip')}</p>
	{/if}
</section>

<style>
	.chat-thread {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-height: 0;
	}

	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.chat-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.chat-reset {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		min-height: 44px;
		padding: 4px 6px;
	}

	.chat-log {
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
		padding: 4px 2px;
		flex: 1;
		min-height: 0;
		scroll-behavior: smooth;
	}

	/* The panel's height is fixed (clamp 440px..720px), so a short thread
	   leaves a dead band at the bottom of the scroll log. Live content
	   (messages, plan card) anchors to the bottom, where the composer is and
	   where the next message will land; the slack then sits above the
	   conversation instead of between the card and the input. Idle states
	   (welcome gallery, recent tests) stay top-anchored: they are a list read
	   downward. `margin-top: auto` collapses to 0 once the log overflows, so
	   long conversations are unaffected. */
	.chat-log.chat-bottom > :first-child {
		margin-top: auto;
	}

	.chat-row {
		display: flex;
	}

	.chat-row-user {
		justify-content: flex-end;
	}

	.chat-row-assistant {
		justify-content: flex-start;
	}

	.chat-bubble {
		max-width: min(86%, 72ch);
		padding: 10px 14px;
		border-radius: var(--radius-overlay);
		font-size: 0.9rem;
		line-height: 1.45;
		word-break: break-word;
	}

	.chat-bubble-user {
		background: rgb(var(--brand-rgb));
		color: var(--on-brand);
		border-bottom-right-radius: var(--radius-control);
	}

	.chat-bubble-assistant {
		background: var(--surface-muted);
		color: var(--text);
		border: 1px solid var(--line);
		border-bottom-left-radius: var(--radius-control);
	}

	.chat-question {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.chat-system {
		margin: 0;
		text-align: center;
		font-size: 0.76rem;
		color: var(--text-muted);
	}

	.chat-replies {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chat-reply {
		border: 1px solid color-mix(in srgb, var(--color-brand-600) 35%, transparent);
		background: color-mix(in srgb, var(--color-brand-600) 8%, transparent);
		color: var(--brand-text);
		font-size: 0.82rem;
		font-weight: 600;
		padding: 8px 12px;
		border-radius: 999px;
		min-height: 44px;
		cursor: pointer;
		transition:
			background 0.15s ease,
			transform 0.15s ease;
	}

	.chat-reply:hover {
		background: color-mix(in srgb, var(--color-brand-600) 14%, transparent);
	}

	.chat-reply:active {
		transform: scale(0.97);
	}

	.chat-skip {
		border-color: var(--line);
		background: transparent;
		color: var(--text-muted);
	}

	.chat-thinking {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 12px 16px;
	}

	.chat-plan {
		margin-top: 2px;
	}

	.chat-idle {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 4px;
	}

	.chat-idle-hint {
		margin: 0;
		padding: 10px 6px;
		text-align: center;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.recent-block {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.welcome-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.recent-title {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.recent-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
		color: var(--text);
		text-align: left;
		cursor: pointer;
		min-height: 44px;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.recent-item:hover {
		border-color: rgba(var(--brand-rgb), 0.4);
		background: rgba(var(--brand-rgb), 0.05);
	}

	.recent-topic {
		font-size: 0.88rem;
		font-weight: 600;
		word-break: break-word;
	}

	.recent-meta {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.recent-all {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 2px;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--brand-text);
		text-decoration: none;
	}

	.weak-topic {
		display: grid;
		gap: 1px;
		width: 100%;
		min-height: 44px;
		margin-top: 4px;
		padding: 10px 12px;
		border: 1px solid rgba(var(--brand-rgb), 0.32);
		border-radius: var(--radius-surface);
		background: rgba(var(--brand-rgb), 0.07);
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.weak-topic-eyebrow {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--brand-text);
	}

	.weak-topic-name {
		font-size: 0.9rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.weak-topic-meta {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.welcome-gallery {
		display: flex;
		flex-direction: column;
		gap: 10px;
		animation: welcome-in 0.22s ease;
	}

	/* Short phones: the greeting repeats what the group labels already say,
	   and the second/third group can wait behind the disclosure. Keeping the
	   first screen to whole rows is the point; nothing is cut mid-button. */
	@media (max-height: 819.98px) {
		.welcome-greeting {
			display: none;
		}
	}

	@media (max-height: 759.98px) {
		.welcome-gallery:not(.is-expanded) .welcome-group:nth-child(4) {
			display: none;
		}
	}

	/* A clipped scroll edge reads as a bug unless it is signalled. Only the
	   gallery (not a conversation) gets the fade. */
	@media (max-width: 639.98px) {
		.chat-log.chat-gallery {
			-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent);
			mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent);
		}
	}

	.welcome-greeting {
		background: var(--surface-muted);
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		border-bottom-left-radius: var(--radius-control);
		padding: 10px 14px;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--text);
	}

	.welcome-group-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.welcome-example {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
		color: var(--text);
		text-align: left;
		font-size: 0.88rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.welcome-example-label {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.welcome-example :global(svg) {
		flex: none;
		color: var(--text-muted);
	}

	.welcome-example:hover {
		border-color: rgba(var(--brand-rgb), 0.4);
		background: rgba(var(--brand-rgb), 0.05);
	}

	.welcome-more {
		align-self: flex-start;
		min-height: 44px;
		padding: 0 4px;
		border: 0;
		background: none;
		color: var(--brand-text);
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	/* From tablet up the gallery stops being a list of full-width bars. Six
	   prompts each stretched across a 1200px shell read as a form to fill in
	   rather than six things you could try, and they pushed the last group
	   below the panel's scroll fold. Wrapping them into pills fits the whole
	   set in three short rows. This has to sit after the base rules above —
	   same specificity, so source order decides. Phones keep the stacked bar:
	   at 390px these strings do not fit as pills, and the gallery overflow is
	   an accepted bound pinned by tests/e2e/welcome-gallery.e2e.js. */
	@media (min-width: 640px) {
		.welcome-group {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			gap: 4px 8px;
		}

		.welcome-group-label {
			flex-basis: 100%;
		}

		.welcome-example {
			width: auto;
			padding: 0 16px;
			border-radius: 999px;
		}
	}

	.welcome-tip {
		margin: 0;
		text-align: center;
		font-size: 0.76rem;
		color: var(--text-muted);
		animation: welcome-in 0.22s ease;
	}

	@keyframes welcome-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.typing-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: rgb(var(--brand-rgb));
		animation: typing-bounce 1.2s ease-in-out infinite;
	}

	.typing-dot:nth-child(2) {
		animation-delay: 0.15s;
	}

	.typing-dot:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes typing-bounce {
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

	@media (max-width: 480px) {
		.chat-bubble {
			max-width: 92%;
		}
	}
</style>
