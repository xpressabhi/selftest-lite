<script>
	import { t } from '$lib/client/i18n';
</script>

<svelte:head>
	<title>{$t('termsHeroTitle')} | selftest.in</title>
	<meta name="description" content="Terms of service for using selftest.in." />
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto" style="max-width: 820px;">
		<h1 class="h2 fw-bold">{$t('termsHeroTitle')}</h1>
		<p class="text-muted">{$t('termsHeroBody')}</p>
		<article class="bg-body border rounded-3 p-3 mb-3">
			<h2 class="h5 fw-bold">{$t('termsSectionUseTitle')}</h2>
			<p class="mb-0 text-muted">{$t('termsSectionUseBody')}</p>
		</article>
		<article class="bg-body border rounded-3 p-3">
			<h2 class="h5 fw-bold">{$t('termsSectionLiabilityTitle')}</h2>
			<p class="mb-0 text-muted">{$t('termsSectionLiabilityBody')}</p>
		</article>
	</div>
</section>
