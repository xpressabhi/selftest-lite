<script>
	import { onMount } from 'svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { t } from '$lib/client/i18n';
	import { dismissToast, runToastAction } from '$lib/client/toast';

	let { entry } = $props();

	const ICON_BY_TYPE = { info: 'info', success: 'check', warning: 'alert', error: 'alert' };
	const typeIcon = $derived(ICON_BY_TYPE[entry.type] || 'info');

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
	tabindex="0"
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
	<span class="toast-icon" aria-hidden="true"><Icon name={typeIcon} size={18} /></span>
	<span class="toast-text">{entry.message}</span>
	{#if entry.actionLabel}
		<button class="toast-action" type="button" onclick={handleAction}>
			{entry.actionLabel}
		</button>
	{/if}
	<button
		class="toast-dismiss"
		type="button"
		aria-label={$t('dismissNotification')}
		onclick={() => dismissEntry('dismiss')}
	>
		<Icon name="close" size={16} />
	</button>
	<span class="toast-fuse" class:paused aria-hidden="true"></span>
</div>

<style>
	.toast-lite {
		position: fixed;
		right: 16px;
		bottom: calc(92px + var(--sab, env(safe-area-inset-bottom, 0px)));
		z-index: var(--z-toast);
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(360px, calc(100vw - 32px));
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-left: 4px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-2);
		overflow: hidden;
		touch-action: pan-y;
		transition:
			transform var(--motion-base) var(--ease-out),
			opacity var(--motion-fast) linear;
	}

	.toast-lite.info {
		border-left-color: var(--color-brand-600);
	}

	.toast-lite.success {
		border-left-color: var(--ok);
	}

	.toast-lite.warning {
		border-left-color: var(--warn);
	}

	.toast-lite.error {
		border-left-color: var(--danger);
	}

	.toast-lite.is-dragging {
		transition: none;
	}

	.toast-lite.is-leaving {
		pointer-events: none;
	}

	.toast-icon {
		flex: none;
		display: inline-flex;
	}

	.toast-lite.info .toast-icon {
		color: var(--color-brand-600);
	}

	.toast-lite.success .toast-icon {
		color: var(--ok);
	}

	.toast-lite.warning .toast-icon {
		color: var(--warn);
	}

	.toast-lite.error .toast-icon {
		color: var(--danger);
	}

	.toast-text {
		flex: 1 1 auto;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.toast-action {
		flex: none;
		min-height: 44px;
		padding: 0 12px;
		margin: -6px 0 -6px 0;
		border: 0;
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--color-brand-600) 12%, transparent);
		color: var(--brand-text);
		font-size: 0.85rem;
		font-weight: 700;
	}

	.toast-action:hover,
	.toast-action:focus-visible {
		background: color-mix(in srgb, var(--color-brand-600) 20%, transparent);
	}

	.toast-dismiss {
		flex: none;
		display: inline-grid;
		width: 44px;
		height: 44px;
		margin: -12px -8px -12px 0;
		place-items: center;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-muted);
	}

	.toast-dismiss:hover,
	.toast-dismiss:focus-visible {
		background: var(--surface-muted);
		color: var(--text);
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
