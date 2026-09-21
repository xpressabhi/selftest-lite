<script>
	let { checked = false, label = '', ariaLabel = '', disabled = false, onchange } = $props();
</script>

<label class="squish-switch" class:is-disabled={disabled}>
	<input
		class="squish-input"
		type="checkbox"
		role="switch"
		aria-label={ariaLabel || undefined}
		{checked}
		{disabled}
		onchange={(event) => onchange?.(event.currentTarget.checked)}
	/>
	<span class="squish-track" aria-hidden="true">
		<span class="squish-thumb"></span>
	</span>
	{#if label}<span class="squish-label">{label}</span>{/if}
</label>

<style>
	.squish-switch {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		cursor: pointer;
	}

	.squish-switch.is-disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.squish-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.squish-track {
		position: relative;
		width: 44px;
		height: 26px;
		flex: none;
		border-radius: 999px;
		background: var(--line);
		transition: background var(--motion-base) var(--ease-out);
	}

	.squish-input:checked + .squish-track {
		background: var(--color-brand-600);
	}

	.squish-input:focus-visible + .squish-track {
		outline: 2px solid var(--brand-text);
		outline-offset: 2px;
	}

	.squish-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		background: #fff;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
		transition: transform var(--motion-base) var(--ease-commit);
	}

	.squish-input:checked + .squish-track .squish-thumb {
		transform: translateX(18px);
	}

	.squish-input:active + .squish-track .squish-thumb {
		transform: scaleX(1.2);
	}

	.squish-input:checked:active + .squish-track .squish-thumb {
		transform: translateX(18px) scaleX(1.2);
	}

	.squish-label {
		color: var(--text);
		font-size: 0.9rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.squish-track,
		.squish-thumb {
			transition: none;
		}

		.squish-input:active + .squish-track .squish-thumb,
		.squish-input:checked:active + .squish-track .squish-thumb {
			transform: none;
		}

		.squish-input:checked + .squish-track .squish-thumb {
			transform: translateX(18px);
		}
	}
</style>
