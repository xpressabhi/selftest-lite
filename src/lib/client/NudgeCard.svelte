<script>
	// One quiet, inline nudge row. Presentational only: the page owns the
	// decision, the ledger writes and the action. Never a modal, never an
	// animation beyond the switch primitives (data-saver stays flat).
	import Icon from '$lib/client/Icon.svelte';
	import { t } from '$lib/client/i18n';

	let { kind, params = {}, busy = false, onselect = () => {}, ondismiss = () => {} } = $props();

	const copy = $derived.by(() => {
		switch (kind) {
			case 'challenge_friend':
				return {
					title: $t('nudgeChallengeTitle', params),
					body: $t('nudgeChallengeBody'),
					cta: $t('nudgeChallengeCta')
				};
			case 'share_streak':
				return {
					title: $t('nudgeShareStreakTitle', params),
					body: $t('nudgeShareStreakBody'),
					cta: $t('nudgeShareStreakCta')
				};
			case 'enable_reminders':
				return {
					title:
						Number(params?.count) > 0
							? $t('nudgeEnableRemindersTitle', params)
							: $t('nudgeEnableRemindersTitleNoStreak'),
					body: $t('nudgeEnableRemindersBody'),
					cta: $t('nudgeEnableRemindersCta')
				};
			default:
				return {
					title: $t('nudgeShareResultTitle'),
					body: $t('nudgeShareResultBody'),
					cta: $t('nudgeShareResultCta')
				};
		}
	});
</script>

<aside class="nudge-card" aria-live="polite">
	<div class="nudge-copy">
		<p class="nudge-title">{copy.title}</p>
		<p class="nudge-body">{copy.body}</p>
	</div>
	<div class="nudge-actions">
		<button
			class="btn btn-sm btn-primary"
			type="button"
			disabled={busy}
			onclick={() => onselect(kind)}
		>
			{copy.cta}
		</button>
		<button
			class="nudge-dismiss"
			type="button"
			aria-label={$t('nudgeDismiss')}
			disabled={busy}
			onclick={() => ondismiss(kind)}
		>
			<Icon name="close" size={16} />
		</button>
	</div>
</aside>

<style>
	.nudge-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px 12px;
		flex-wrap: wrap;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}

	.nudge-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1 1 200px;
		min-width: 0;
	}

	.nudge-title {
		margin: 0;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.3;
		color: var(--text);
	}

	.nudge-body {
		margin: 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-muted);
	}

	.nudge-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.nudge-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.nudge-dismiss:hover:not(:disabled) {
		background: var(--surface-muted);
		color: var(--text);
	}

	.nudge-dismiss:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
