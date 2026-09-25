<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import FaqAccordion from '$lib/client/FaqAccordion.svelte';
	import { FAQ_ITEMS, FAQ_SECTIONS } from '$lib/data/faqs';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { localizedPath } from '$lib/shared/seo';

	const faqJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: FAQ_ITEMS.map((item) => ({
				'@type': 'Question',
				name: $t(item.questionKey),
				acceptedAnswer: {
					'@type': 'Answer',
					text: item.answerKeys.map((key) => $t(key)).join(''),
				},
			})),
		})
	);
</script>

<SeoHead
	path={localizedPath('/faq', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('faqHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('faqHeroBody')
		: 'Frequently asked questions about selftest.in AI quizzes, UPSC/SSC/Banking/Railway exam papers, privacy, sync, and generation in Hindi and English.'}
	ogDescription={$activeLanguage === 'hindi'
		? $t('faqHeroBody')
		: 'How selftest.in AI quiz generation, exam papers, pricing, privacy and offline mode work.'}
	twitterDescription={$activeLanguage === 'hindi'
		? $t('faqHeroBody')
		: 'FAQ about AI quizzes, exam papers, privacy, sync and generation.'}
/>
<svelte:head>
	{@html faqJsonLd}
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="faq-wrap">
		<header class="faq-hero">
			<h1 class="faq-title">{$t('faqHeroTitle')}</h1>
			<p class="faq-subtitle">{$t('faqHeroBody')}</p>
		</header>

		<nav class="faq-nav" aria-label={$t('faq')}>
			{#each FAQ_SECTIONS as section (section.id)}
				<a class="faq-chip" href={`#section-${section.id}`}>{$t(section.titleKey)}</a>
			{/each}
		</nav>

		<div class="faq-sections">
			{#each FAQ_SECTIONS as section (section.id)}
				<section class="faq-section" id={`section-${section.id}`}>
					<h2 class="faq-section-title">{$t(section.titleKey)}</h2>
					<FaqAccordion items={section.items} />
				</section>
			{/each}
		</div>

		<CtaBanner
			titleKey="faqStillHaveQuestions"
			bodyKey="contactHeroBody"
			buttonKey="faqContactUs"
			href={localizedPath('/contact', $activeLanguage)}
		/>
	</div>
</section>

<style>
	.faq-wrap {
		max-width: 52rem;
		margin: 0 auto;
		display: grid;
		gap: 1.5rem;
	}

	.faq-hero {
		text-align: center;
	}

	.faq-title {
		margin: 0 0 0.35rem;
		font-size: 1.5rem;
		line-height: 1.2;
		font-weight: 700;
	}

	.faq-subtitle {
		margin: 0;
		color: var(--text-muted);
	}

	.faq-nav {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.faq-chip {
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
		text-decoration: none;
		transition: border-color 0.15s ease-out;
	}

	.faq-chip:hover {
		border-color: var(--brand-text);
		color: var(--brand-text);
	}

	.faq-sections {
		display: grid;
		gap: 2rem;
	}

	.faq-section {
		scroll-margin-top: 5rem;
	}

	.faq-section-title {
		margin: 0 0 0.75rem;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-muted);
	}
</style>
