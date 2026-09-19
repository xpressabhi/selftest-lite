<script>
	import { t } from '$lib/client/i18n';
	import { language } from '$lib/client/preferences';

	const posts = [
		{
			slug: 'how-to-study-effectively',
			title: 'blogPost1Title',
			excerpt: 'blogPost1Excerpt',
			category: 'blogPost1Category',
			readTime: 'blogPost1ReadTime',
			date: '2024-11-24',
		},
		{
			slug: 'overcoming-exam-anxiety',
			title: 'blogPost2Title',
			excerpt: 'blogPost2Excerpt',
			category: 'blogPost2Category',
			readTime: 'blogPost2ReadTime',
			date: '2024-11-20',
		},
		{
			slug: 'spaced-repetition-explained',
			title: 'blogPost3Title',
			excerpt: 'blogPost3Excerpt',
			category: 'blogPost3Category',
			readTime: 'blogPost3ReadTime',
			date: '2024-11-15',
		},
		{
			slug: 'best-prompts-for-learning',
			title: 'blogPost4Title',
			excerpt: 'blogPost4Excerpt',
			category: 'blogPost4Category',
			readTime: 'blogPost4ReadTime',
			date: '2024-11-10',
		},
	];

	const dateFormatter = $derived(
		new Intl.DateTimeFormat($language === 'hindi' ? 'hi-IN' : 'en-IN', {
			dateStyle: 'medium',
		})
	);
</script>

<svelte:head>
	<title>{$t('blog')} | selftest.in</title>
	<meta
		name="description"
		content="Study tips, active recall guides, spaced repetition, and AI quiz generation advice from selftest.in."
	/>
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="text-center mb-4">
		<h1 class="h2 fw-bold">{$t('blog')}</h1>
		<p class="text-muted">{$t('blogPost1Excerpt')}</p>
	</div>
	<div class="row g-3">
		{#each posts as post (post.slug)}
			<article class="col-md-6 col-lg-4">
				<div class="blog-card bg-body border rounded-3 p-3 h-100">
					<div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
						<span class="badge text-bg-primary">{$t(post.category)}</span>
						<span class="small text-muted"
							>{dateFormatter.format(new Date(`${post.date}T12:00:00`))}</span
						>
					</div>
					<h2 class="h5 fw-bold">
						<a class="stretched-link text-decoration-none" href={`/blog/${post.slug}`}
							>{$t(post.title)}</a
						>
					</h2>
					<p class="text-muted">{$t(post.excerpt)}</p>
					<p class="small text-muted mb-0">{$t(post.readTime)}</p>
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
	.blog-card {
		position: relative;
	}

	.stretched-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}
</style>
