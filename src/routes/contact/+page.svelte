<script>
	import { t } from '$lib/client/i18n';
</script>

<svelte:head>
	<title>{$t('contactHeroTitle')} | selftest.in</title>
	<meta name="description" content="Contact selftest.in for feedback, questions, and support." />
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto" style="max-width: 820px;">
		<h1 class="h2 fw-bold">{$t('contactHeroTitle')}</h1>
		<p class="lead text-muted">{$t('contactHeroBody')}</p>
		<div class="row g-3">
			<div class="col-md-6">
				<div class="bg-body border rounded-3 p-3 h-100">
					<h2 class="h5 fw-bold">{$t('contactInfoTitle')}</h2>
					<p class="text-muted">{$t('contactInfoBody')}</p>
					<a class="btn btn-primary" href="mailto:hello@selftest.in">hello@selftest.in</a>
				</div>
			</div>
			<div class="col-md-6">
				<div class="bg-body border rounded-3 p-3 h-100">
					<h2 class="h5 fw-bold">{$t('connectCreatorTitle')}</h2>
					<p class="text-muted mb-3">{$t('creatorRole')}</p>
					<a class="btn btn-outline-primary" href="https://www.linkedin.com" rel="noreferrer" target="_blank">
						{$t('connectOnLinkedIn')}
					</a>
				</div>
			</div>
		</div>
	</div>
</section>
