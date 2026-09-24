<script>
	// Destructive action with an undo window: the first press arms the button
	// (the parent shows "Undo" and a burning fuse), a second press cancels, and
	// the parent's onfire runs once the fuse burns out. The parent keeps at most
	// one instance armed.
	let {
		armed = false,
		disabled = false,
		label = '',
		undoLabel = '',
		durationMs = 4000,
		class: className = '',
		onarm,
		oncancel,
		onfire,
		children,
	} = $props();

	$effect(() => {
		if (!armed) {
			return;
		}
		const timer = window.setTimeout(() => onfire?.(), durationMs);
		return () => window.clearTimeout(timer);
	});

	function handleClick() {
		if (disabled) {
			return;
		}
		if (armed) {
			oncancel?.();
		} else {
			onarm?.();
		}
	}
</script>

<button
	class={`fuse-button ${className}`}
	class:is-armed={armed}
	type="button"
	{disabled}
	aria-label={armed ? undoLabel : label}
	onclick={handleClick}
>
	{#if armed}
		<span class="fuse-undo">{undoLabel}</span>
		<span class="fuse-line" aria-hidden="true" style={`--fuse-duration: ${durationMs}ms`}></span>
	{:else}
		{@render children?.()}
	{/if}
</button>

<style>
	.fuse-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		overflow: hidden;
		border: 0;
		border-radius: var(--radius-control);
		cursor: pointer;
	}

	.fuse-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.fuse-button.is-armed {
		padding: 0 14px;
		gap: 6px;
	}

	.fuse-undo {
		font-weight: 700;
	}

	.fuse-line {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 2px;
		background: currentColor;
		opacity: 0.45;
		transform-origin: left center;
		animation: fuse-burn var(--fuse-duration, 4000ms) linear forwards;
	}

	@keyframes fuse-burn {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	:global(html.data-saver) .fuse-line {
		display: none;
	}
</style>
