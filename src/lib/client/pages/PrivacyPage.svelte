<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { localizedPath } from '$lib/shared/seo';

	const sections = [
		['privacySection1Title', 'privacySection1Body'],
		['privacySection2Title', 'privacySection2Body'],
		['privacySection3Title', 'privacySection3Body'],
		['privacySection4Title', 'privacySection4Body'],
		['privacySection5Title', 'privacySection5Body'],
		['privacySection6Title', 'privacySection6Body'],
		['privacySection7Title', 'privacySection7Body'],
	];
</script>

<SeoHead
	path={localizedPath('/privacy', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('privacyHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('privacyHeroBody')
		: 'Privacy policy for selftest.in learning data, local storage, analytics, and contact information.'}
	ogDescription={$activeLanguage === 'hindi'
		? $t('privacyHeroBody')
		: 'How selftest.in handles learning data, local storage, analytics and contact information.'}
	twitterDescription={$activeLanguage === 'hindi'
		? $t('privacyHeroBody')
		: 'How selftest.in handles learning data, local storage and analytics.'}
/>

<section class="container py-4 py-md-5">
	<div class="mx-auto" style="max-width: 860px;">
		<h1 class="h2 fw-bold">{$t('privacyHeroTitle')}</h1>
		<p class="text-muted">{$t('privacyHeroBody')}</p>
		<p class="small text-muted">{$t('privacyLastUpdated')}</p>
		<div class="d-grid gap-3">
			{#each sections as section (section[0])}
				<article class="bg-body border rounded-3 p-3">
					<h2 class="h5 fw-bold">{$t(section[0])}</h2>
					<p class="mb-0 text-muted">{$t(section[1])}</p>
				</article>
			{/each}
		</div>
		<a class="btn btn-primary mt-4" href={localizedPath('/contact', $activeLanguage)}>{$t('privacyContactButton')}</a>
	</div>
</section>
