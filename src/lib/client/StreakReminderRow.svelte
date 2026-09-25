<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import {
		disableReminders,
		enableReminders,
		isReminderEnabled,
		remindersSupported,
	} from '$lib/client/reminders';
	import { showToast } from '$lib/client/toast';

	let { historyCount = 0 } = $props();

	// Push support is resolved after mount so the server render and the first
	// client render agree; the card itself is client-only anyway.
	let supported = $state(false);
	let reminderEnabled = $state(false);
	let reminderBusy = $state(false);

	const visible = $derived(historyCount >= 1 && supported);

	onMount(() => {
		if (!remindersSupported()) {
			return;
		}
		supported = true;
		void isReminderEnabled().then((enabled) => {
			reminderEnabled = enabled;
		});
	});

	async function toggleReminders(event) {
		// currentTarget is only valid during dispatch, so capture it first.
		const input = event.currentTarget;
		if (reminderBusy) {
			return;
		}
		reminderBusy = true;
		const result = reminderEnabled ? await disableReminders() : await enableReminders();
		if (result.ok) {
			reminderEnabled = !reminderEnabled;
		} else {
			// The checkbox toggles visually on click; put it back when the
			// change did not stick.
			input.checked = reminderEnabled;
			const message =
				result.reason === 'denied'
					? $t('reminderDenied')
					: result.reason === 'unconfigured'
						? $t('reminderUnconfigured')
						: $t('reminderFailed');
			showToast(message, 'warning');
		}
		reminderBusy = false;
	}
</script>

{#if visible}
	<div class="streak-reminder">
		<label class="streak-reminder-label">
			<span class="streak-reminder-copy">
				<span class="streak-reminder-title">{$t('streakReminderTitle')}</span>
				<span class="streak-reminder-body">{$t('streakReminderBody')}</span>
			</span>
			<span class="streak-switch">
				<input
					type="checkbox"
					checked={reminderEnabled}
					disabled={reminderBusy}
					onchange={toggleReminders}
				/>
				<span class="streak-switch-track" aria-hidden="true">
					<span class="streak-switch-thumb"></span>
				</span>
			</span>
		</label>
	</div>
{/if}

<style>
	.streak-reminder {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}

	.streak-reminder-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		cursor: pointer;
	}

	.streak-reminder-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.streak-reminder-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
	}

	.streak-reminder-body {
		font-size: 12px;
		color: var(--text-muted);
	}

	.streak-switch {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
	}

	.streak-switch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.streak-switch input:disabled {
		cursor: default;
	}

	.streak-switch-track {
		display: block;
		position: relative;
		width: 40px;
		height: 24px;
		border-radius: 999px;
		background: var(--line);
		transition: background 0.15s ease;
	}

	.streak-switch-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--surface);
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
		transition: transform 0.15s ease;
	}

	.streak-switch input:checked + .streak-switch-track {
		background: var(--color-brand-600);
	}

	.streak-switch input:checked + .streak-switch-track .streak-switch-thumb {
		transform: translateX(16px);
	}

	.streak-switch input:focus-visible + .streak-switch-track {
		outline: 2px solid var(--color-brand-600);
		outline-offset: 2px;
	}
</style>
