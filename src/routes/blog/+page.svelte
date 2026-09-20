<script>
	import { t } from '$lib/client/i18n';
	import { language } from '$lib/client/preferences';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import {
		BLOG_CATEGORIES,
		BLOG_POSTS_BY_DATE,
		formatBlogDate,
		getBlogCategory,
	} from '$lib/data/blogPosts';
	import { jsonLdScript } from '$lib/shared/jsonLd';

	let activeCategory = $state('all');

	const filtered = $derived(
		activeCategory === 'all'
			? BLOG_POSTS_BY_DATE
			: BLOG_POSTS_BY_DATE.filter((post) => post.categoryId === activeCategory)
	);
	const featured = $derived(filtered[0] ?? null);
	const rest = $derived(filtered.slice(1));

	const blogJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'Blog',
			name: $t('blogHeroTitle'),
			description: $t('blogHeroBody'),
			url: 'https://www.selftest.in/blog',
			blogPost: BLOG_POSTS_BY_DATE.map((post) => ({
				'@type': 'BlogPosting',
				headline: $t(post.titleKey),
				url: `https://www.selftest.in/blog/${post.slug}`,
				datePublished: post.date,
			})),
		})
	);

	function formatDate(isoDate) {
		return formatBlogDate(isoDate, $language);
	}

	function categoryLabel(post) {
		const category = getBlogCategory(post.categoryId);
		return category ? $t(category.labelKey) : '';
	}
</script>

<svelte:head>
	<title>{$t('blog')} | selftest.in</title>
	<meta
		name="description"
		content="Study tips, active recall guides, spaced repetition, board exam plans and SSC/Banking/Railway mock-test strategy from selftest.in."
	/>
	<meta name="robots" content="index, follow, max-image-preview:large" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={`${$t('blog')} | selftest.in`} />
	<meta
		property="og:description"
		content="Study tips, active recall, spaced repetition and AI quiz strategy for Indian exams."
	/>
	<meta name="twitter:title" content={`${$t('blog')} | selftest.in`} />
	<meta
		name="twitter:description"
		content="Study tips and AI quiz strategy for Indian competitive and board exams."
	/>
	{@html blogJsonLd}
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="blog-wrap">
		<header class="blog-hero">
			<h1 class="blog-title">{$t('blogHeroTitle')}</h1>
			<p class="blog-subtitle">{$t('blogHeroBody')}</p>
		</header>

		<div class="blog-filters" role="group" aria-label={$t('blogHeroTitle')}>
			<button
				type="button"
				class="blog-chip"
				class:active={activeCategory === 'all'}
				aria-pressed={activeCategory === 'all'}
				onclick={() => (activeCategory = 'all')}
			>
				{$t('blogFilterAll')}
			</button>
			{#each BLOG_CATEGORIES as category (category.id)}
				<button
					type="button"
					class="blog-chip"
					class:active={activeCategory === category.id}
					aria-pressed={activeCategory === category.id}
					onclick={() => (activeCategory = category.id)}
				>
					{$t(category.labelKey)}
				</button>
			{/each}
		</div>

		{#if featured}
			<article class="blog-featured">
				<div class="blog-featured-body">
					<div class="blog-meta">
						<span class="blog-badge">{$t(getBlogCategory(featured.categoryId).labelKey)}</span>
						<span class="blog-meta-text">
							{formatDate(featured.date)} · {$t(featured.readTimeKey)}
						</span>
					</div>
					<h2 class="blog-featured-title">
						<a class="blog-link" href={`/blog/${featured.slug}`}>{$t(featured.titleKey)}</a>
					</h2>
					<p class="blog-excerpt">{$t(featured.excerptKey)}</p>
				</div>
			</article>
		{/if}

		{#if rest.length > 0}
			<div class="blog-grid">
				{#each rest as post (post.slug)}
					<article class="blog-card">
						<div class="blog-meta">
							<span class="blog-badge">{categoryLabel(post)}</span>
							<span class="blog-meta-text">{formatDate(post.date)} · {$t(post.readTimeKey)}</span>
						</div>
						<h2 class="blog-card-title">
							<a class="blog-link" href={`/blog/${post.slug}`}>{$t(post.titleKey)}</a>
						</h2>
						<p class="blog-excerpt">{$t(post.excerptKey)}</p>
					</article>
				{/each}
			</div>
		{/if}

		<p class="blog-more">
			{$t('blogMorePosts')}
			<a class="blog-inline-link" href="/faq">{$t('contactQuickHelpFaq')}</a>
		</p>

		<CtaBanner
			titleKey="blogPracticeCtaTitle"
			bodyKey="blogPracticeCtaBody"
			buttonKey="aboutCtaButton"
			href="/"
		/>
	</div>
</section>

<style>
	.blog-wrap {
		max-width: 64rem;
		margin: 0 auto;
		display: grid;
		gap: 1.5rem;
	}

	.blog-hero {
		text-align: center;
	}

	.blog-title {
		margin: 0 0 0.35rem;
		font-size: 1.9rem;
		line-height: 1.15;
		font-weight: 700;
	}

	.blog-subtitle {
		margin: 0 auto;
		max-width: 40rem;
		color: var(--text-muted);
	}

	.blog-filters {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.blog-chip {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}

	.blog-chip:hover {
		border-color: var(--brand-text);
		color: var(--brand-text);
	}

	.blog-chip.active {
		border-color: transparent;
		background: var(--brand-text);
		color: #fff;
	}

	.blog-featured {
		position: relative;
		padding: 1.3rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background:
			linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(129, 140, 248, 0.04)),
			var(--surface);
	}

	.blog-featured-body {
		display: grid;
		gap: 0.5rem;
	}

	.blog-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.blog-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.65rem;
		border-radius: 999px;
		background: var(--brand-text);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.blog-meta-text {
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.blog-featured-title {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.3;
		font-weight: 700;
	}

	.blog-card {
		position: relative;
		display: grid;
		gap: 0.5rem;
		align-content: start;
		padding: 1.1rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: var(--surface);
		transition: border-color 0.15s ease-out;
	}

	.blog-card:hover {
		border-color: var(--brand-text);
	}

	.blog-card-title {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.35;
		font-weight: 700;
	}

	.blog-link {
		color: inherit;
		text-decoration: none;
	}

	.blog-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.blog-excerpt {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.blog-grid {
		display: grid;
		gap: 1rem;
	}

	.blog-more {
		margin: 0;
		color: var(--text-muted);
	}

	.blog-inline-link {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: var(--brand-text);
		font-weight: 600;
	}

	@media (min-width: 768px) {
		.blog-title {
			font-size: 2.25rem;
		}

		.blog-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.blog-featured {
			padding: 1.75rem;
		}

		.blog-featured-title {
			font-size: 1.6rem;
		}
	}

	@media (min-width: 1024px) {
		.blog-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
