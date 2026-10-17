<script>
	// A stale or mistyped exam id must not dead-end on the generic error page:
	// this boundary offers the catalog and the home composer instead.
	import { t } from '#lib/client/i18n.js';
</script>

<svelte:head>
	<title>{$t('practiceNotFoundTitle')} | selftest.in</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="app-container py-5 text-center">
	<h1 class="text-page mb-2">{$t('practiceNotFoundTitle')}</h1>
	<p class="text-muted mb-4">{$t('practiceNotFoundBody')}</p>
	<div class="d-flex flex-wrap justify-content-center gap-2">
		<a class="btn btn-primary" href="/practice">{$t('practiceAllExams')}</a>
		<a class="btn btn-outline-secondary" href="/">{$t('startNewTest')}</a>
	</div>
</section>
