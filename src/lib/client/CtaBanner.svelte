<script>
	/**
	 * Reusable call-to-action banner used at the end of content pages.
	 * Keeps the About / Blog / FAQ / Contact pages visually consistent without
	 * duplicating gradient markup in every route.
	 */
	import { t } from '$lib/client/i18n';

	let {
		titleKey,
		bodyKey,
		buttonKey = 'aboutCtaButton',
		href = '/',
		secondaryKey = null,
		secondaryHref = '/faq',
		compact = false,
	} = $props();
</script>

<section class="cta-banner" class:compact>
	<div class="cta-copy">
		<h2 class="cta-title">{$t(titleKey)}</h2>
		<p class="cta-body">{$t(bodyKey)}</p>
	</div>
	<div class="cta-actions">
		<a class="btn btn-primary" {href}>{$t(buttonKey)}</a>
		{#if secondaryKey}
			<a class="cta-secondary" href={secondaryHref}>{$t(secondaryKey)}</a>
		{/if}
	</div>
</section>

<style>
	.cta-banner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: flex-start;
		padding: 1.25rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background:
			linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(129, 140, 248, 0.05)),
			var(--surface);
	}

	.cta-copy {
		max-width: 46rem;
	}

	.cta-title {
		margin: 0 0 0.25rem;
		font-size: 1.25rem;
		line-height: 1.3;
		font-weight: 700;
	}

	.cta-body {
		margin: 0;
		color: var(--text-muted);
	}

	.cta-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
	}

	.cta-secondary {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: var(--brand-text);
		font-weight: 600;
		text-decoration: none;
	}

	.cta-secondary:hover {
		text-decoration: underline;
	}

	.compact {
		padding: 1rem 1.25rem;
	}

	@media (min-width: 768px) {
		.cta-banner {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			padding: 1.5rem;
		}

		.cta-actions {
			flex-shrink: 0;
		}
	}
</style>
