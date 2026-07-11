<script>
	import { t } from '$lib/client/i18n';
</script>

<svelte:head>
	<title>{$t('aboutHeroTitle')} | selftest.in</title>
	<meta name="description" content="Learn how selftest.in helps learners practice with AI-generated quizzes and exam papers." />
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto content-wrap">
		<h1 class="h2 fw-bold">{$t('aboutHeroTitle')}</h1>
		<p class="lead text-muted">{$t('aboutHeroBody')}</p>
		<div class="d-flex flex-wrap gap-2 mb-4">
			<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{$t('aboutBadgeFree')}</span>
			<span class="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-800">{$t('aboutBadgePrivacy')}</span>
		</div>

		<section class="mb-4">
			<h2 class="h4 fw-bold">{$t('aboutMissionTitle')}</h2>
			<p>{$t('aboutMissionBody')}</p>
		</section>

		<section class="mb-4">
			<h2 class="h4 fw-bold">{$t('aboutWhyWorksTitle')}</h2>
			<ul class="list-group">
				<li class="list-group-item"><strong>{$t('aboutWhyWorksPoint1Title')}</strong> {$t('aboutWhyWorksPoint1Body')}</li>
				<li class="list-group-item"><strong>{$t('aboutWhyWorksPoint2Title')}</strong> {$t('aboutWhyWorksPoint2Body')}</li>
				<li class="list-group-item"><strong>{$t('aboutWhyWorksPoint3Title')}</strong> {$t('aboutWhyWorksPoint3Body')}</li>
			</ul>
		</section>

		<section class="mb-4">
			<h2 class="h4 fw-bold">{$t('aboutHowItWorksTitle')}</h2>
			<div class="row g-3">
				<div class="col-md-4"><div class="border rounded-3 p-3 h-100"><h3 class="h6">{$t('aboutStep1Title')}</h3><p class="mb-0 text-muted">{$t('aboutStep1Body')}</p></div></div>
				<div class="col-md-4"><div class="border rounded-3 p-3 h-100"><h3 class="h6">{$t('aboutStep2Title')}</h3><p class="mb-0 text-muted">{$t('aboutStep2Body')}</p></div></div>
				<div class="col-md-4"><div class="border rounded-3 p-3 h-100"><h3 class="h6">{$t('aboutStep3Title')}</h3><p class="mb-0 text-muted">{$t('aboutStep3Body')}</p></div></div>
			</div>
		</section>

		<div class="bg-body border rounded-3 p-4">
			<h2 class="h4 fw-bold">{$t('aboutCtaTitle')}</h2>
			<p class="text-muted">{$t('aboutCtaBody')}</p>
			<a class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors inline-block text-center" href="/">{$t('aboutCtaButton')}</a>
		</div>
	</div>
</section>

<style>
	.content-wrap {
		max-width: 920px;
	}
</style>
