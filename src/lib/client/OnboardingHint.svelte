<script>
	import { activeLanguage, t } from '#lib/client/i18n.js';

	let { ondismiss = () => {}, onswitch = () => {}, revealed = true } = $props();
</script>

<!-- Sits between the conversation and the input, inside the planner panel:
     it teaches the control directly above it and can never be hidden behind the
     fixed bottom navigation on a 640px-tall phone. -->
<aside class="onboarding-hint" class:is-revealed={revealed} role="note">
	<p class="onboarding-hint-body">{$t('onboardingHintBody')}</p>
	<button
		class="onboarding-hint-switch"
		type="button"
		lang={$activeLanguage === 'english' ? 'hi' : 'en'}
		onclick={onswitch}
	>
		{$t('onboardingHintSwitch')}
	</button>
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
</aside>

<style>
	.onboarding-hint {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px 2px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
	}

	/* Reserved but not yet revealed: the box keeps its space from the first
	   paint, so becoming visible is not a layout shift. */
	.onboarding-hint:not(.is-revealed) {
		visibility: hidden;
	}

	.onboarding-hint.is-revealed {
		animation: onboarding-hint-in 180ms ease-out both;
	}

	.onboarding-hint-body {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.35;
		color: var(--text);
	}

	.onboarding-hint-switch {
		flex: none;
		min-height: 44px;
		padding: 0 4px;
		border: 0;
		background: none;
		color: var(--brand-text);
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	.onboarding-hint-dismiss {
		display: inline-flex;
		width: 44px;
		height: 44px;
		flex: none;
		align-items: center;
		justify-content: center;
		margin-right: -4px;
		border: 0;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.onboarding-hint-dismiss:hover {
		color: var(--text);
	}

	@media (max-width: 359.98px) {
		/* 320px-class phones: stack the switch under the copy rather than
		   squeezing the sentence into three words per line. */
		.onboarding-hint {
			flex-wrap: wrap;
			padding-block: 4px;
		}

		.onboarding-hint-body {
			flex-basis: calc(100% - 44px);
		}

		.onboarding-hint-switch {
			margin-left: auto;
		}
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
