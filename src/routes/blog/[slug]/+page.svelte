<script>
	import { t } from '$lib/client/i18n';
	import { language } from '$lib/client/preferences';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import { formatBlogDate, getBlogCategory } from '$lib/data/blogPosts';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { SITE_ORIGIN } from '$lib/shared/seo';

	let { data } = $props();

	const category = $derived(getBlogCategory(data.post.categoryId));

	const postJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'BlogPosting',
			headline: $t(data.post.titleKey),
			description: $t(data.post.excerptKey),
			articleBody: (data.post.bodyKeys || []).map((key) => $t(key)).join('\n\n'),
			image: `${SITE_ORIGIN}/og-cover.png`,
			datePublished: data.post.date,
			dateModified: data.post.modified || data.post.date,
			inLanguage: $language === 'hindi' ? 'hi-IN' : 'en-IN',
			mainEntityOfPage: `${SITE_ORIGIN}/blog/${data.slug}`,
			author: { '@type': 'Organization', name: 'selftest.in', url: SITE_ORIGIN },
			publisher: {
				'@type': 'Organization',
				name: 'selftest.in',
				logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icons/512.png` },
			},
		})
	);

	const formattedDate = $derived(formatBlogDate(data.post.date, $language));
</script>

<SeoHead
	path={`/blog/${data.post.slug}`}
	type="article"
	title={`${$t(data.post.titleKey)} | selftest.in`}
	description={$t(data.post.excerptKey)}
/>
<svelte:head>
	{@html postJsonLd}
</svelte:head>

<article class="container py-4 py-md-5">
	<div class="post-wrap">
		<nav class="post-back" aria-label={$t('blogHeroTitle')}>
			<a class="post-back-link" href="/blog">← {$t('blog')}</a>
		</nav>

		<header class="post-header">
			<div class="post-meta">
				{#if category}
					<span class="post-badge">{$t(category.labelKey)}</span>
				{/if}
				<span class="post-meta-text">{$t(data.post.readTimeKey)}</span>
			</div>
			<h1 class="post-title">{$t(data.post.titleKey)}</h1>
			<p class="post-excerpt">{$t(data.post.excerptKey)}</p>
			<p class="post-date">{formattedDate}</p>
		</header>

		<section class="post-points">
			<h2 class="post-points-title">{$t('blogKeyPointsTitle')}</h2>
			<ul class="post-list">
				{#each data.post.pointKeys as pointKey (pointKey)}
					<li class="post-point">
						<span class="post-check" aria-hidden="true">
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path
									d="M3.5 8.5l3 3 6-7"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
						<span>{$t(pointKey)}</span>
					</li>
				{/each}
			</ul>
		</section>

		{#if data.post.bodyKeys?.length}
			<div class="post-body">
				{#each data.post.bodyKeys as bodyKey (bodyKey)}
					<p>{$t(bodyKey)}</p>
				{/each}
			</div>
		{/if}

		<CtaBanner
			titleKey="blogPracticeCtaTitle"
			bodyKey="blogPracticeCtaBody"
			buttonKey="aboutCtaButton"
			href="/"
			compact
		/>

		{#if data.related.length > 0}
			<section class="post-related">
				<h2 class="post-related-title">{$t('blogMorePosts')}</h2>
				<div class="post-related-grid">
					{#each data.related as post (post.slug)}
						<article class="post-related-card">
							<h3 class="post-related-card-title">
								<a class="post-link" href={`/blog/${post.slug}`}>{$t(post.titleKey)}</a>
							</h3>
							<p class="post-related-excerpt">{$t(post.excerptKey)}</p>
						</article>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</article>

<style>
	.post-wrap {
		max-width: 46rem;
		margin: 0 auto;
		display: grid;
		gap: 1.5rem;
	}

	.post-back {
		margin: 0;
	}

	.post-back-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		color: var(--brand-text);
		font-weight: 600;
		text-decoration: none;
	}

	.post-back-link:hover {
		text-decoration: underline;
	}

	.post-header {
		display: grid;
		gap: 0.6rem;
	}

	.post-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.post-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.7rem;
		border-radius: 999px;
		background: var(--brand-text);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.post-meta-text {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.post-title {
		margin: 0;
		font-size: 1.8rem;
		line-height: 1.2;
		font-weight: 700;
	}

	.post-excerpt {
		margin: 0;
		color: var(--text-muted);
		font-size: 1.05rem;
		line-height: 1.65;
	}

	.post-date {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.post-points {
		display: grid;
		gap: 0.75rem;
		padding: 1.1rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: var(--surface);
	}

	.post-body {
		display: grid;
		gap: 1rem;
		line-height: 1.75;
	}

	.post-body p {
		margin: 0;
	}

	.post-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.75rem;
	}

	.post-point {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		line-height: 1.65;
	}

	.post-check {
		display: inline-flex;
		width: 1.35rem;
		height: 1.35rem;
		flex-shrink: 0;
		margin-top: 0.15rem;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(79, 70, 229, 0.12);
		color: var(--brand-text);
	}
	.post-points-title {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.post-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.75rem;
	}

	.post-point {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		line-height: 1.65;
	}

	.post-check {
		display: inline-flex;
		width: 1.35rem;
		height: 1.35rem;
		flex-shrink: 0;
		margin-top: 0.15rem;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(79, 70, 229, 0.12);
		color: var(--brand-text);
	}

	.post-related {
		display: grid;
		gap: 0.75rem;
	}

	.post-related-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
	}

	.post-related-grid {
		display: grid;
		gap: 0.75rem;
	}

	.post-related-card {
		position: relative;
		display: grid;
		gap: 0.3rem;
		padding: 0.9rem;
		border: 1px solid var(--line);
		border-radius: 0.9rem;
		background: var(--surface);
	}

	.post-related-card-title {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.35;
	}

	.post-link {
		color: inherit;
		text-decoration: none;
	}

	.post-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.post-related-excerpt {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.55;
	}

	@media (min-width: 768px) {
		.post-title {
			font-size: 2.1rem;
		}

		.post-points {
			padding: 1.5rem;
		}

		.post-related-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
