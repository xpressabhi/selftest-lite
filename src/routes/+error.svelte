<script>
	import { page } from '$app/state';
	import { t } from '$lib/client/i18n';

	const isNotFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{isNotFound ? $t('pageNotFoundTitle') : $t('somethingWentWrong')} | selftest.in</title>
	<meta
		name="description"
		content={isNotFound ? $t('pageNotFoundBody') : $t('errorBoundaryMessage')}
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="app-container py-4 py-md-5">
	<div class="mx-auto text-center" style="max-width: 560px;">
		<p class="display-6 fw-bold mb-1">{page.status}</p>
		<h1 class="h3 fw-bold">
			{isNotFound ? $t('pageNotFoundTitle') : $t('somethingWentWrong')}
		</h1>
		<p class="text-muted">
			{isNotFound ? $t('pageNotFoundBody') : $t('errorBoundaryMessage')}
		</p>
		<div class="d-flex flex-wrap justify-content-center align-items-center gap-2 mt-3">
			<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
			<a class="error-link" href="/blog">{$t('blog')}</a>
			<a class="error-link" href="/faq">{$t('faq')}</a>
		</div>
	</div>
</section>

<style>
	.error-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0 8px;
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.error-link:hover,
	.error-link:focus-visible {
		color: var(--text);
	}
</style>
