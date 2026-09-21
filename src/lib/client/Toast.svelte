<script>
	import { onMount } from 'svelte';
	import { dismissToast, runToastAction } from '$lib/client/toast';

	let { entry } = $props();

	let swipeX = $state(0);
	let dragging = $state(false);
	let leaving = $state(false);
	let paused = $state(false);

	let remainingMs = 0;
	let timerStartedAt = 0;
	let timer = null;
	let outTimer = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let axisDecided = false;
	let horizontalDrag = false;
	let dragPointerId = null;

	const REDUCED_MOTION = () =>
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

	function clearTimer() {
		window.clearTimeout(timer);
		timer = null;
	}

	function startTimer(ms) {
		clearTimer();
		remainingMs = ms;
		timerStartedAt = Date.now();
		timer = window.setTimeout(() => dismissEntry('timeout'), ms);
	}

	function pauseTimer() {
		if (timer === null) {
			return;
		}
		window.clearTimeout(timer);
		timer = null;
		remainingMs = Math.max(0, remainingMs - (Date.now() - timerStartedAt));
		paused = true;
	}

	function resumeTimer() {
		if (dragging || leaving || timer !== null || remainingMs <= 0) {
			return;
		}
		paused = false;
		timerStartedAt = Date.now();
		timer = window.setTimeout(() => dismissEntry('timeout'), remainingMs);
	}

	function dismissEntry(reason) {
		if (leaving) {
			return;
		}
		if (reason === 'swipe') {
			leaving = true;
			paused = false;
			swipeX = (swipeX >= 0 ? 1 : -1) * (typeof window === 'undefined' ? 400 : window.innerWidth);
			window.clearTimeout(outTimer);
			outTimer = window.setTimeout(() => dismissToast(entry.id), REDUCED_MOTION() ? 0 : 180);
			return;
		}
		clearTimer();
		dismissToast(entry.id);
	}

	function handleAction() {
		runToastAction(entry);
		dismissEntry('action');
	}

	function onPointerDown(event) {
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}
		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		axisDecided = false;
		horizontalDrag = false;
		dragging = true;
		pauseTimer();
	}

	function onPointerMove(event) {
		if (!dragging || event.pointerId !== dragPointerId) {
			return;
		}
		const dx = event.clientX - dragStartX;
		const dy = event.clientY - dragStartY;
		if (!axisDecided) {
			if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
				return;
			}
			axisDecided = true;
			horizontalDrag = Math.abs(dx) > Math.abs(dy);
			if (horizontalDrag) {
				event.currentTarget.setPointerCapture?.(event.pointerId);
			}
		}
		if (horizontalDrag) {
			swipeX = dx;
		}
	}

	function onPointerUp(event) {
		if (!dragging || event.pointerId !== dragPointerId) {
			return;
		}
		dragging = false;
		if (horizontalDrag && Math.abs(swipeX) > 80) {
			dismissEntry('swipe');
			return;
		}
		swipeX = 0;
		horizontalDrag = false;
		resumeTimer();
	}

	function onFocusOut(event) {
		if (!event.currentTarget.contains(event.relatedTarget)) {
			resumeTimer();
		}
	}

	onMount(() => {
		startTimer(entry.durationMs || 3000);
		return () => {
			window.clearTimeout(timer);
			window.clearTimeout(outTimer);
		};
	});
</script>

<div
	class="toast-lite {entry.type}"
	class:is-leaving={leaving}
	class:is-dragging={dragging}
	role={entry.type === 'error' ? 'alert' : 'status'}
	style={`--toast-duration: ${entry.durationMs || 3000}ms; transform: translateX(${swipeX}px);`}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onpointerenter={pauseTimer}
	onpointerleave={resumeTimer}
	onfocusin={pauseTimer}
	onfocusout={onFocusOut}
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			dismissEntry('escape');
		}
	}}
>
	<span class="toast-text">{entry.message}</span>
	{#if entry.actionLabel}
		<button class="toast-action" type="button" onclick={handleAction}>
			{entry.actionLabel}
		</button>
	{/if}
	<span class="toast-fuse" class:paused aria-hidden="true"></span>
</div>

<style>
	.toast-lite {
		position: fixed;
		right: 16px;
		bottom: calc(92px + var(--sab, env(safe-area-inset-bottom, 0px)));
		z-index: 1100;
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(360px, calc(100vw - 32px));
		padding: 10px 12px;
		border-radius: 8px;
		background: #111827;
		color: #fff;
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.2);
		overflow: hidden;
		touch-action: pan-y;
		transition:
			transform var(--motion-base) var(--ease-out),
			opacity var(--motion-fast) linear;
	}

	.toast-lite.is-dragging {
		transition: none;
	}

	.toast-lite.is-leaving {
		pointer-events: none;
	}

	.toast-text {
		flex: 1 1 auto;
	}

	.toast-action {
		flex: none;
		min-height: 44px;
		padding: 0 12px;
		margin: -6px -4px -6px 0;
		border: 0;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.toast-action:hover,
	.toast-action:focus-visible {
		background: rgba(255, 255, 255, 0.26);
	}

	.toast-fuse {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 2px;
		background: currentColor;
		opacity: 0.4;
		transform-origin: left center;
		animation: toast-fuse-burn var(--toast-duration, 3000ms) linear forwards;
	}

	.toast-fuse.paused {
		animation-play-state: paused;
	}

	@keyframes toast-fuse-burn {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	/* Data saver: swipe still works, the burning fuse is dropped. */
	:global(html.data-saver) .toast-fuse {
		display: none;
	}
</style>
