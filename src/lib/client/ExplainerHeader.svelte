<script>
	import { t } from '#lib/client/i18n.js';

	// The one explainer masthead, shared by the playground result card and the
	// public /explain page so both surfaces present the same title, summary and
	// action placement. `tag`/`size` keep platform semantics right: the public
	// page owns the document h1, the playground card is a section of a page
	// whose h1 is "Playground". `views` is the public page's viewer counter:
	// the line renders from the second viewer on; the playground card passes
	// nothing and stays unchanged.
	let { title = '', summary = '', tag = 'h2', size = 'card', views = 0, eyebrow = '', children } =
		$props();
</script>

<header class="explainer-header" class:is-page={size === 'page'}>
	<div class="explainer-header-copy">
		{#if eyebrow}
			<p class="explainer-header-eyebrow">{$t(eyebrow)}</p>
		{/if}
		<svelte:element this={tag} class="explainer-header-title">{title}</svelte:element>
		{#if summary}
			<p class="explainer-header-summary">{summary}</p>
		{/if}
		{#if Number(views) >= 2}
			<p class="explainer-header-views">{$t('explainViewedBy', { count: views })}</p>
		{/if}
	</div>
	{#if children}
		<div class="explainer-header-actions">{@render children()}</div>
	{/if}
</header>

<style>
	.explainer-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px 16px;
	}

	.explainer-header-copy {
		min-width: 0;
	}

	.explainer-header-eyebrow {
		margin: 0 0 4px;
		color: var(--brand-text);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.explainer-header-title {
		margin: 0 0 4px;
		font-size: 1.125rem;
		line-height: 1.3;
		text-wrap: balance;
	}

	.explainer-header-summary {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.explainer-header-views {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.explainer-header-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	@media (min-width: 768px) {
		.explainer-header-title {
			font-size: 1.25rem;
		}
	}

	.explainer-header.is-page .explainer-header-title {
		font-size: 1.5rem;
	}

	.explainer-header.is-page .explainer-header-summary {
		font-size: 1rem;
	}

	@media (min-width: 768px) {
		.explainer-header.is-page .explainer-header-title {
			font-size: 1.875rem;
		}
	}
</style>
