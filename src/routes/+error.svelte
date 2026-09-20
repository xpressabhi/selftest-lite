<script>
	import { page } from '$app/state';
	import { t } from '$lib/client/i18n';
</script>

<svelte:head>
	<title>{$t('pageNotFoundTitle')} | selftest.in</title>
	<meta name="description" content={$t('pageNotFoundBody')} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto text-center" style="max-width: 560px;">
		<p class="display-6 fw-bold mb-1">{page.status}</p>
		<h1 class="h3 fw-bold">{$t('pageNotFoundTitle')}</h1>
		<p class="text-muted">{$t('pageNotFoundBody')}</p>
		<div class="d-flex flex-wrap justify-content-center gap-2 mt-3">
			<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
			<a class="btn btn-outline-secondary" href="/blog">{$t('blog')}</a>
			<a class="btn btn-outline-secondary" href="/faq">{$t('faq')}</a>
		</div>
	</div>
</section>
