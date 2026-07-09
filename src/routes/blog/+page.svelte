<script>
	import { t } from '$lib/client/i18n';

	const posts = [
		['how-to-study-effectively', 'blogPost1Title', 'blogPost1Excerpt', 'blogPost1Category', 'blogPost1ReadTime', 'blogPost1Date'],
		['overcoming-exam-anxiety', 'blogPost2Title', 'blogPost2Excerpt', 'blogPost2Category', 'blogPost2ReadTime', 'blogPost2Date'],
		['spaced-repetition-explained', 'blogPost3Title', 'blogPost3Excerpt', 'blogPost3Category', 'blogPost3ReadTime', 'blogPost3Date'],
		['best-prompts-for-learning', 'blogPost4Title', 'blogPost4Excerpt', 'blogPost4Category', 'blogPost4ReadTime', 'blogPost4Date'],
	];
</script>

<svelte:head>
	<title>{$t('blog')} | selftest.in</title>
	<meta name="description" content="Study tips, active recall guides, spaced repetition, and AI quiz generation advice from selftest.in." />
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="text-center mb-4">
		<h1 class="h2 fw-bold">{$t('blog')}</h1>
		<p class="text-muted">{$t('blogPost1Excerpt')}</p>
	</div>
	<div class="row g-3">
		{#each posts as post (post[0])}
			<article class="col-md-6 col-lg-4">
				<div class="bg-body border rounded-3 p-3 h-100">
					<div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
						<span class="badge text-bg-primary">{$t(post[3])}</span>
						<span class="small text-muted">{$t(post[5])}</span>
					</div>
					<h2 class="h5 fw-bold">
						<a class="stretched-link text-decoration-none" href={`/blog/${post[0]}`}>{$t(post[1])}</a>
					</h2>
					<p class="text-muted">{$t(post[2])}</p>
					<p class="small text-muted mb-0">{$t(post[4])}</p>
				</div>
			</article>
		{/each}
	</div>
</section>
