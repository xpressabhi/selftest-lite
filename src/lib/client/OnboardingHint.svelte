<script>
	import { activeLanguage, t } from '#lib/client/i18n.js';

	let { ondismiss = () => {}, onswitch = () => {} } = $props();
</script>

<aside class="onboarding-hint" role="note">
	<div class="onboarding-hint-head">
		<p class="onboarding-hint-body">{$t('onboardingHintBody')}</p>
		<button
			class="onboarding-hint-dismiss"
			type="button"
			aria-label={$t('onboardingHintDismissAria')}
			onclick={() => ondismiss('close')}
		>
			<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path
					d="M5.5 5.5l9 9M14.5 5.5l-9 9"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>
	<button
		class="onboarding-hint-switch"
		type="button"
		lang={$activeLanguage === 'english' ? 'hi' : 'en'}
		onclick={onswitch}
	>
		{$t('onboardingHintSwitch')}
	</button>
</aside>

<style>
	.onboarding-hint {
		display: flex;
		flex-direction: column;
		margin-top: 8px;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		animation: onboarding-hint-in 180ms ease-out both;
	}

	.onboarding-hint-head {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.onboarding-hint-body {
		flex: 1;
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.35;
		color: var(--text);
	}

	.onboarding-hint-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		margin: -10px -10px 0 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.onboarding-hint-dismiss:hover {
		color: var(--text);
	}

	.onboarding-hint-switch {
		align-self: flex-start;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--brand-text);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	@keyframes onboarding-hint-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
