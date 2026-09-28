<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import {
		disableReminders,
		enableReminders,
		isReminderEnabled,
		remindersSupported,
	} from '$lib/client/reminders';
	import { STORAGE_KEYS } from '$lib/client/constants';
	import { showToast } from '$lib/client/toast';

	// Returning visitors (at least one completed test) get one friendly,
	// one-tap opt-in for daily study nudges. "Not now" is a seven-day
	// cooldown rather than a permanent no: the ask may return once a week
	// while the visitor keeps practicing. The OS permission prompt still
	// needs their tap — browsers never allow a silent push opt-in.
	const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

	let { historyCount = 0 } = $props();

	// Push support is resolved after mount so the server render and the first
	// client render agree; the card itself is client-only anyway.
	let supported = $state(false);
	let reminderEnabled = $state(false);
	let reminderBusy = $state(false);
	let dismissedAt = $state(0);

	function readDismissedAt() {
		try {
			const value = Number(window.localStorage.getItem(STORAGE_KEYS.REMINDER_PROMPT_DISMISSED_AT));
			return Number.isFinite(value) && value > 0 ? value : 0;
		} catch {
			return 0;
		}
	}

	function rememberDismissal() {
		const now = Date.now();
		try {
			window.localStorage.setItem(STORAGE_KEYS.REMINDER_PROMPT_DISMISSED_AT, String(now));
		} catch {
			// Storage unavailable; the in-memory cooldown still applies this visit.
		}
		dismissedAt = now;
	}

	const eligible = $derived(supported && historyCount >= 1);
	const dismissedRecently = $derived(
		dismissedAt > 0 && Date.now() - dismissedAt < PROMPT_COOLDOWN_MS
	);
	const promptVisible = $derived(eligible && !reminderEnabled && !dismissedRecently);
	const switchVisible = $derived(eligible && reminderEnabled);

	onMount(() => {
		if (!remindersSupported()) {
			return;
		}
		supported = true;
		dismissedAt = readDismissedAt();
		void isReminderEnabled().then((enabled) => {
			reminderEnabled = enabled;
		});
	});

	function reminderErrorCopy(reason) {
		return reason === 'denied'
			? $t('reminderDenied')
			: reason === 'unconfigured'
				? $t('reminderUnconfigured')
				: $t('reminderFailed');
	}

	async function enablePrompt() {
		if (reminderBusy) {
			return;
		}
		reminderBusy = true;
		const result = await enableReminders();
		if (result.ok) {
			reminderEnabled = true;
			showToast($t('reminderEnabledToast'), 'success');
		} else {
			showToast(reminderErrorCopy(result.reason), 'warning');
		}
		reminderBusy = false;
	}

	async function disableFromSwitch(event) {
		// currentTarget is only valid during dispatch, so capture it first.
		const input = event.currentTarget;
		if (reminderBusy) {
			return;
		}
		reminderBusy = true;
		const result = await disableReminders();
		if (result.ok) {
			reminderEnabled = false;
			// Turning it off is an answer too: don't ask again right away.
			rememberDismissal();
		} else {
			// The checkbox toggles visually on click; put it back when the
			// change did not stick.
			input.checked = true;
			showToast($t('reminderFailed'), 'warning');
		}
		reminderBusy = false;
	}
</script>

{#if promptVisible}
	<div class="streak-reminder streak-reminder-prompt">
		<span class="streak-reminder-copy">
			<span class="streak-reminder-title">{$t('reminderPromptTitle')}</span>
			<span class="streak-reminder-body">{$t('reminderPromptBody')}</span>
		</span>
		<div class="streak-reminder-actions">
			<button
				class="reminder-enable"
				type="button"
				disabled={reminderBusy}
				onclick={enablePrompt}>{$t('reminderPromptEnable')}</button
			>
			<button
				class="reminder-dismiss"
				type="button"
				disabled={reminderBusy}
				onclick={rememberDismissal}>{$t('reminderPromptDismiss')}</button
			>
		</div>
	</div>
{:else if switchVisible}
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
					onchange={disableFromSwitch}
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

	.streak-reminder-prompt {
		display: grid;
		gap: 10px;
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

	.streak-reminder-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.reminder-enable,
	.reminder-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 16px;
		border-radius: var(--radius-control);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.reminder-enable {
		border: 0;
		background: rgb(var(--brand-rgb));
		color: #fff;
	}

	.reminder-enable:disabled,
	.reminder-dismiss:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.reminder-dismiss {
		border: 1px solid var(--line);
		background: transparent;
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
		box-shadow: var(--shadow-1);
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
