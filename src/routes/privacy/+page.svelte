<script>
	import { t } from '$lib/client/i18n';

	const sections = [
		['privacySection1Title', 'privacySection1Body'],
		['privacySection2Title', 'privacySection2Body'],
		['privacySection3Title', 'privacySection3Body'],
		['privacySection4Title', 'privacySection4Body'],
		['privacySection5Title', 'privacySection5Body'],
	];
</script>

<svelte:head>
	<title>{$t('privacyHeroTitle')} | selftest.in</title>
	<meta name="description" content="Privacy policy for selftest.in learning data, local storage, analytics, and contact information." />
</svelte:head>

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
		<a class="btn btn-primary mt-4" href="/contact">{$t('privacyContactButton')}</a>
	</div>
</section>
