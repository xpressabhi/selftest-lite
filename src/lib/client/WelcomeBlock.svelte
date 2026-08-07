<script>
	import { t } from '$lib/client/i18n';

	let { onDismiss = () => {}, onShowExample = () => {} } = $props();

	let visible = $state(true);
	let dismissed = $state(false);

	const STORAGE_KEY = 'selftest_welcome_dismissed';

	$effect(() => {
		if (typeof window !== 'undefined') {
			const stored = window.localStorage.getItem(STORAGE_KEY);
			if (stored === 'true') {
				visible = false;
				dismissed = true;
			}
		}
	});

	function handleDismiss() {
		visible = false;
		dismissed = true;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(STORAGE_KEY, 'true');
		}
		onDismiss();
	}

	function handleShowExample() {
		onShowExample();
	}

	function handleReopen() {
		visible = true;
		dismissed = false;
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(STORAGE_KEY);
		}
	}
</script>

{#if visible}
	<div class="welcome-block">
		<div class="welcome-inner">
			<div class="welcome-top">
				<h2 class="welcome-title">{$t('welcomeTitle')}</h2>
				<button class="welcome-dismiss" type="button" onclick={handleDismiss} aria-label={$t('close')}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<p class="welcome-body">{$t('welcomeBody')}</p>

			<div class="welcome-steps">
				<div class="welcome-step">
					<div class="step-circle">1</div>
					<div class="step-label">{$t('welcomeStep1Label')}</div>
					<div class="step-desc">{$t('welcomeStep1Desc')}</div>
				</div>
				<div class="welcome-arrow" aria-hidden="true">→</div>
				<div class="welcome-step">
					<div class="step-circle">2</div>
					<div class="step-label">{$t('welcomeStep2Label')}</div>
					<div class="step-desc">{$t('welcomeStep2Desc')}</div>
				</div>
				<div class="welcome-arrow" aria-hidden="true">→</div>
				<div class="welcome-step">
					<div class="step-circle">3</div>
					<div class="step-label">{$t('welcomeStep3Label')}</div>
					<div class="step-desc">{$t('welcomeStep3Desc')}</div>
				</div>
			</div>

			<p class="welcome-summary">{$t('welcomeSummary')}</p>

			<div class="welcome-actions">
				<button class="welcome-btn example-btn" type="button" onclick={handleShowExample}>
					{$t('welcomeShowExample')}
				</button>
				<button class="welcome-btn dismiss-btn" type="button" onclick={handleDismiss}>
					{$t('welcomeDismiss')}
				</button>
			</div>
		</div>
	</div>
{:else if dismissed}
	<button class="welcome-reopen" type="button" onclick={handleReopen} aria-label={$t('welcomeReopen')}>
		?
	</button>
{/if}

<style>
	.welcome-block {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 20px;
		margin-bottom: 20px;
		overflow: hidden;
		animation: welcome-in 0.4s ease;
	}

	@keyframes welcome-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.welcome-inner {
		padding: 24px;
	}

	.welcome-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}

	.welcome-title {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.welcome-dismiss {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s ease, color 0.15s ease;
		flex-shrink: 0;
	}

	.welcome-dismiss:hover {
		background: var(--surface-muted);
		color: var(--text);
	}

	.welcome-body {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0 0 16px;
	}

	.welcome-steps {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		gap: 8px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.welcome-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
		min-width: 80px;
	}

	.step-circle {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(var(--brand-rgb), 0.1);
		color: rgb(var(--brand-rgb));
		font-weight: 700;
		font-size: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.step-label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text);
	}

	.step-desc {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-align: center;
		line-height: 1.3;
	}

	.welcome-arrow {
		font-size: 1.2rem;
		color: var(--text-muted);
		margin-top: 10px;
		opacity: 0.5;
	}

	.welcome-summary {
		font-size: 0.85rem;
		color: var(--text);
		margin: 0 0 16px;
		line-height: 1.5;
	}

	.welcome-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.welcome-btn {
		padding: 10px 20px;
		border-radius: 12px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		border: 0;
		transition: background 0.15s ease, transform 0.12s ease;
		min-height: 44px;
	}

	.example-btn {
		background: rgba(var(--brand-rgb), 0.1);
		color: rgb(var(--brand-rgb));
	}

	.example-btn:hover {
		background: rgba(var(--brand-rgb), 0.18);
	}

	.dismiss-btn {
		background: var(--surface-muted);
		color: var(--text-muted);
		border: 1px solid var(--line);
	}

	.dismiss-btn:hover {
		color: var(--text);
		border-color: var(--text-muted);
	}

	.welcome-reopen {
		position: fixed;
		bottom: calc(100px + env(safe-area-inset-bottom, 0px));
		right: calc(16px + env(safe-area-inset-right, 0px));
		z-index: 100;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 0;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s ease, transform 0.12s ease;
	}

	.welcome-reopen:hover {
		color: var(--text);
		transform: scale(1.08);
	}

	@media (max-width: 480px) {
		.welcome-steps {
			gap: 4px;
		}

		.welcome-step {
			min-width: 70px;
		}

		.welcome-arrow {
			margin-top: 12px;
		}
	}
</style>
