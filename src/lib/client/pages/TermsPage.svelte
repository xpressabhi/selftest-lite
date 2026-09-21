<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { localizedPath } from '$lib/shared/seo';
</script>

<SeoHead
	path={localizedPath('/terms', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('termsHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('termsHeroBody')
		: 'Terms of service for using selftest.in.'}
	ogDescription={$activeLanguage === 'hindi'
		? $t('termsHeroBody')
		: 'Terms of service for using selftest.in AI quizzes and exam papers.'}
/>

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
