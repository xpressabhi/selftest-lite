<script>
	// Shared confirmation modal — the single destructive-action idiom for the
	// app. Cancel carries data-autofocus, so the safe choice is focused first;
	// Escape and a backdrop tap cancel; focusTrap restores focus to the
	// trigger when the dialog unmounts.
	import { focusTrap } from '#lib/client/focusTrap.js';

	let {
		title = '',
		body = '',
		confirmLabel = '',
		cancelLabel = '',
		danger = true,
		onconfirm = () => {},
		oncancel = () => {},
	} = $props();

	$effect(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});
</script>

<div
	class="confirm-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) {
			oncancel();
		}
	}}
>
	<div
		class="confirm-dialog"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		use:focusTrap={{ onEscape: oncancel }}
	>
		<p class="confirm-title">{title}</p>
		{#if body}
			<p class="confirm-body">{body}</p>
		{/if}
		<div class="confirm-actions">
			<button
				class="btn btn-outline-secondary"
				type="button"
				data-autofocus
				onclick={oncancel}
			>
				{cancelLabel}
			</button>
			<button
				class="btn {danger ? 'btn-danger' : 'btn-primary'}"
				type="button"
				onclick={onconfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>

<style>
	.confirm-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal-backdrop);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		background: rgba(15, 23, 42, 0.5);
	}

	.confirm-dialog {
		z-index: var(--z-modal);
		width: min(100%, 400px);
		padding: 18px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		box-shadow: var(--shadow-1);
	}

	.confirm-title {
		margin: 0 0 6px;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
	}

	.confirm-body {
		margin: 0 0 14px;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.confirm-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
