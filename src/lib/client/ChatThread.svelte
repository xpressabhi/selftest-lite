<script>
	import { t } from '$lib/client/i18n';

	let {
		messages = [],
		pendingClarify = null,
		status = 'idle',
		recentTests = [],
		planCard = null,
		welcome = false,
		exampleGroups = [],
		onquickreply = () => {},
		onskip = () => {},
		onstartover = () => {},
		onopentest = () => {},
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
		role={welcome ? undefined : 'log'}
		aria-live={welcome ? undefined : 'polite'}
		bind:this={logRef}
	>
		{#if showIdleState}
			<div class="chat-idle">
				{#if welcome}
					<div class="welcome-gallery">
						<div class="welcome-greeting">{$t('plannerWelcomeGreeting')}</div>
						{#each exampleGroups as group (group.labelKey)}
							<div class="welcome-group">
								<span class="welcome-group-label">{$t(group.labelKey)}</span>
								{#each group.examples as example (example.key)}
									<button
										class="welcome-example"
										type="button"
										onclick={() => onexample(example)}
									>
										{$t(example.key)}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{:else if recentTests.length > 0}
					<div class="recent-block" onpointerdown={onrecenttouch}>
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
					</div>
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

	{#if welcome}
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
		max-width: 86%;
		padding: 10px 14px;
		border-radius: 16px;
		font-size: 0.9rem;
		line-height: 1.45;
		word-break: break-word;
	}

	.chat-bubble-user {
		background: rgb(var(--brand-rgb));
		color: #fff;
		border-bottom-right-radius: 6px;
	}

	.chat-bubble-assistant {
		background: var(--surface-muted);
		color: var(--text);
		border: 1px solid var(--line);
		border-bottom-left-radius: 6px;
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

	.recent-block,
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
		border-radius: 12px;
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

	.welcome-gallery {
		display: flex;
		flex-direction: column;
		gap: 10px;
		animation: welcome-in 0.22s ease;
	}

	.welcome-greeting {
		background: var(--surface-muted);
		border: 1px solid var(--line);
		border-radius: 16px;
		border-bottom-left-radius: 6px;
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
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
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

	.welcome-example:hover {
		border-color: rgba(var(--brand-rgb), 0.4);
		background: rgba(var(--brand-rgb), 0.05);
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

	:global(html.data-saver) .welcome-gallery,
	:global(html.reduce-motion) .welcome-gallery,
	:global(html.data-saver) .welcome-tip,
	:global(html.reduce-motion) .welcome-tip {
		animation: none;
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

	:global(html.data-saver) .typing-dot,
	:global(html.reduce-motion) .typing-dot {
		animation: none;
		opacity: 0.7;
	}

	@media (max-width: 480px) {
		.chat-bubble {
			max-width: 92%;
		}
	}
</style>
