<script>
	import { onDestroy } from 'svelte';
	import { HOLD_DURATION_MS, isTapRelease } from '$lib/client/holdCommit.js';
	import { HAPTIC_COMMIT, triggerVibration } from '$lib/client/haptics';

	let {
		label = '',
		busyLabel = '',
		hint = '',
		busy = false,
		disabled = false,
		class: className = 'btn btn-success',
		onhold,
	} = $props();

	const uid = $props.id();
	const hintId = `${uid}-hint`;

	let holding = $state(false);
	let committed = $state(false);
	let nudged = $state(false);
	let holdStartedAt = 0;
	let holdTimer = null;
	let nudgeTimer = null;

	const filled = $derived(holding || committed || busy);

	// Once the parent stops reporting busy (success navigated away, or a
	// failure re-armed the flow) the liquid drains back down.
	$effect(() => {
		if (!busy && committed) {
			committed = false;
		}
	});

	function startHold(event) {
		if (busy || disabled || holding) {
			return;
		}
		if (event.type === 'keydown') {
			if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) {
				return;
			}
			event.preventDefault();
		}
		holding = true;
		holdStartedAt = Date.now();
		holdTimer = window.setTimeout(() => {
			holdTimer = null;
			holding = false;
			committed = true;
			triggerVibration(HAPTIC_COMMIT);
			onhold?.();
		}, HOLD_DURATION_MS);
	}

	function cancelHold(event) {
		if (!holding) {
			return;
		}
		if (event?.type === 'keyup' && event.key !== ' ' && event.key !== 'Enter') {
			return;
		}
		const elapsed = Date.now() - holdStartedAt;
		window.clearTimeout(holdTimer);
		holdTimer = null;
		holding = false;
		if (isTapRelease(elapsed)) {
			nudged = true;
			window.clearTimeout(nudgeTimer);
			nudgeTimer = window.setTimeout(() => {
				nudged = false;
			}, 1600);
		}
	}

	onDestroy(() => {
		window.clearTimeout(holdTimer);
		window.clearTimeout(nudgeTimer);
	});
</script>

<div class="hold-button-wrap" style={`--hold-duration: ${HOLD_DURATION_MS}ms`}>
	<button
		class={`hold-button ${className}`}
		class:is-filled={filled}
		type="button"
		disabled={disabled || busy}
		aria-describedby={hint ? hintId : undefined}
		onpointerdown={startHold}
		onpointerup={cancelHold}
		onpointerleave={cancelHold}
		onpointercancel={cancelHold}
		onkeydown={startHold}
		onkeyup={cancelHold}
	>
		<span class="hold-fill" aria-hidden="true"></span>
		<span class="hold-label">
			{#if busy}
				<span class="thinking-dots" aria-hidden="true">
					<span></span><span></span><span></span>
				</span>
			{/if}
			{busy ? busyLabel : label}
		</span>
	</button>
	{#if hint}
		<span class="hold-hint" id={hintId} class:nudged>{hint}</span>
	{/if}
</div>

<style>
	.hold-button-wrap {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 4px;
	}

	.hold-button {
		position: relative;
		overflow: hidden;
		isolation: isolate;
		touch-action: manipulation;
		-webkit-user-select: none;
		user-select: none;
	}

	.hold-fill {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		transform: scaleY(0);
		transform-origin: bottom;
		background: rgba(15, 23, 42, 0.24);
		transition: transform 140ms ease-out;
	}

	.hold-fill::before {
		position: absolute;
		top: -8px;
		left: -60%;
		width: 220%;
		height: 16px;
		border-radius: 50%;
		background: inherit;
		content: '';
		animation: hold-wave 1.6s ease-in-out infinite alternate;
	}

	.hold-button.is-filled .hold-fill {
		transform: scaleY(1);
		transition-duration: var(--hold-duration, 900ms);
		transition-timing-function: linear;
	}

	.hold-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.hold-hint {
		color: var(--text-muted);
		font-size: 0.72rem;
		text-align: center;
		transition: color var(--motion-base) var(--ease-out);
	}

	.hold-hint.nudged {
		color: var(--brand-text);
		animation: hold-nudge 1.4s var(--ease-out);
	}

	@keyframes hold-wave {
		from {
			transform: translateX(-3%);
		}
		to {
			transform: translateX(3%);
		}
	}

	@keyframes hold-nudge {
		0%,
		100% {
			opacity: 1;
			transform: translateY(0);
		}
		30% {
			opacity: 0.6;
			transform: translateY(-2px);
		}
	}

	/* Data saver: the fill still communicates state, without the wave. */
	:global(html.data-saver) .hold-fill::before {
		animation: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.hold-fill,
		.hold-fill::before {
			transition: none;
			animation: none;
		}
	}
</style>
