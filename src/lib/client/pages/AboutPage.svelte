<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import FaqAccordion from '$lib/client/FaqAccordion.svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { getFaqItems } from '$lib/data/faqs';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { SITE_ORIGIN, localizedPath } from '$lib/shared/seo';

	const aboutJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'AboutPage',
			name: $t('aboutHeroTitle'),
			description: $t('aboutHeroBody'),
			url: `${SITE_ORIGIN}/about`,
			mainEntity: {
				'@type': 'Organization',
				name: 'selftest.in',
				url: SITE_ORIGIN,
			},
		})
	);

	const whyItWorks = [
		{ titleKey: 'aboutWhyWorksPoint1Title', bodyKey: 'aboutWhyWorksPoint1Body' },
		{ titleKey: 'aboutWhyWorksPoint2Title', bodyKey: 'aboutWhyWorksPoint2Body' },
		{ titleKey: 'aboutWhyWorksPoint3Title', bodyKey: 'aboutWhyWorksPoint3Body' },
	];

	const steps = [
		{ titleKey: 'aboutStep1Title', bodyKey: 'aboutStep1Body' },
		{ titleKey: 'aboutStep2Title', bodyKey: 'aboutStep2Body' },
		{ titleKey: 'aboutStep3Title', bodyKey: 'aboutStep3Body' },
	];

	const practice = [
		{
			titleKey: 'aboutPracticeAnyTitle',
			bodyKey: 'aboutPracticeAnyBody',
			icon: 'note',
		},
		{
			titleKey: 'aboutPracticeExamsTitle',
			bodyKey: 'aboutPracticeExamsBody',
			icon: 'list',
		},
		{
			titleKey: 'aboutPracticeLanguagesTitle',
			bodyKey: 'aboutPracticeLanguagesBody',
			icon: 'globe',
		},
	];

	const values = [
		{
			titleKey: 'aboutValuePrivacyTitle',
			bodyKey: 'aboutValuePrivacyBody',
			icon: 'shield',
		},
		{
			titleKey: 'aboutValueSpeedTitle',
			bodyKey: 'aboutValueSpeedBody',
			icon: 'zap',
		},
		{
			titleKey: 'aboutValueFocusTitle',
			bodyKey: 'aboutValueFocusBody',
			icon: 'target',
		},
	];

	const teaserItems = getFaqItems(['what-is', 'is-free', 'sign-in', 'offline']);
</script>

<SeoHead
	path={localizedPath('/about', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('aboutHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('aboutHeroBody')
		: 'Learn how selftest.in helps UPSC, SSC, Banking, Railway, NEET, JEE and board aspirants practice with AI-generated quizzes and exam papers in Hindi and English.'}
	ogDescription={$activeLanguage === 'hindi'
		? $t('aboutHeroBody')
		: 'AI-generated quizzes and full-length objective exam papers for Indian competitive exams in Hindi and English.'}
	twitterDescription={$activeLanguage === 'hindi'
		? $t('aboutHeroBody')
		: 'AI-generated quizzes and full-length objective exam papers for Indian competitive exams.'}
/>
<svelte:head>
	{@html aboutJsonLd}
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="about-wrap">
		<header class="about-hero">
			<h1 class="about-title">{$t('aboutHeroTitle')}</h1>
			<p class="about-lead">{$t('aboutHeroBody')}</p>
			<div class="about-badges">
				<span class="about-badge badge-free">{$t('aboutBadgeFree')}</span>
				<span class="about-badge">{$t('aboutBadgePrivacy')}</span>
			</div>
			<div class="about-actions">
				<a class="btn btn-primary" href={localizedPath('/', $activeLanguage)}>{$t('aboutCtaButton')}</a>
				<a class="about-link" href={localizedPath('/faq', $activeLanguage)}>{$t('contactQuickHelpFaq')}</a>
			</div>
		</header>

		<section class="about-section">
			<h2 class="about-section-title">{$t('aboutMissionTitle')}</h2>
			<p class="about-mission">{$t('aboutMissionBody')}</p>

			<h3 class="about-subtitle">{$t('aboutWhyWorksTitle')}</h3>
			<ul class="about-principles">
				{#each whyItWorks as point, index (point.titleKey)}
					<li class="about-principle">
						<span class="principle-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
						<p class="about-principle-title">{$t(point.titleKey)}</p>
						<p class="about-card-body">{$t(point.bodyKey)}</p>
					</li>
				{/each}
			</ul>
		</section>

		<section class="about-section">
			<h2 class="about-section-title">{$t('aboutHowItWorksTitle')}</h2>
			<ol class="about-steps">
				{#each steps as step, index (step.titleKey)}
					<li class="about-step">
						<span class="step-number" aria-hidden="true">{index + 1}</span>
						<div>
							<h3 class="about-card-title">{$t(step.titleKey)}</h3>
							<p class="about-card-body">{$t(step.bodyKey)}</p>
						</div>
					</li>
				{/each}
			</ol>
		</section>

		<section class="about-section">
			<h2 class="about-section-title">{$t('aboutPracticeTitle')}</h2>
			<div class="about-grid three">
				{#each practice as item (item.titleKey)}
					<div class="about-card">
						<span class="about-icon" aria-hidden="true">
							<Icon name={item.icon} />
						</span>
						<h3 class="about-card-title">{$t(item.titleKey)}</h3>
						<p class="about-card-body">{$t(item.bodyKey)}</p>
					</div>
				{/each}
			</div>
		</section>

		<section class="about-section">
			<ul class="about-values">
				{#each values as value (value.titleKey)}
					<li class="about-value">
						<span class="about-icon" aria-hidden="true">
							<Icon name={value.icon} />
						</span>
						<div>
							<p class="about-value-title">{$t(value.titleKey)}</p>
							<p class="about-card-body">{$t(value.bodyKey)}</p>
						</div>
					</li>
				{/each}
			</ul>
			<p class="about-built">
				<strong>{$t('aboutBuiltTitle')}</strong>
				{$t('aboutBuiltBody')}
			</p>
		</section>

		<section class="about-section">
			<div class="about-faq-head">
				<h2 class="about-section-title">{$t('aboutFaqTeaserTitle')}</h2>
				<a class="about-link" href={localizedPath('/faq', $activeLanguage)}>{$t('contactQuickHelpFaq')}</a>
			</div>
			<FaqAccordion items={teaserItems} />
		</section>

		<CtaBanner titleKey="aboutCtaTitle" bodyKey="aboutCtaBody" href={localizedPath('/', $activeLanguage)} />
	</div>
</section>

<style>
	.about-wrap {
		max-width: 64rem;
		margin: 0 auto;
		display: grid;
		gap: 2.25rem;
	}

	.about-hero {
		display: grid;
		gap: 0.75rem;
	}

	.about-title {
		margin: 0;
		font-size: 1.9rem;
		line-height: 1.15;
		font-weight: 700;
	}

	.about-lead {
		margin: 0;
		max-width: 46rem;
		color: var(--text-muted);
		font-size: 1.1rem;
		line-height: 1.6;
	}

	.about-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.about-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.about-badge.badge-free {
		border-color: transparent;
		background: color-mix(in srgb, var(--color-brand-600) 12%, transparent);
		color: var(--brand-text);
	}

	.about-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		margin-top: 0.25rem;
	}

	.about-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		color: var(--brand-text);
		font-weight: 600;
		text-decoration: none;
	}

	.about-link:hover {
		text-decoration: underline;
	}

	.about-section {
		display: grid;
		gap: 0.9rem;
	}

	.about-section-title {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 700;
	}

	.about-mission {
		margin: 0;
		max-width: 52rem;
		color: var(--text-muted);
		line-height: 1.7;
	}

	.about-subtitle {
		margin: 0.5rem 0 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.about-grid {
		display: grid;
		gap: 0.9rem;
	}

	.about-principles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1rem 1.75rem;
	}

	.about-principle {
		display: grid;
		gap: 0.3rem;
		align-content: start;
		padding-top: 0.75rem;
		border-top: 2px solid color-mix(in srgb, var(--color-brand-600) 30%, transparent);
	}

	.principle-number {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--brand-text);
	}

	.about-principle-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.about-card {
		display: grid;
		gap: 0.35rem;
		align-content: start;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.about-card-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.about-card-body {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.about-icon {
		display: inline-flex;
		width: 2.25rem;
		height: 2.25rem;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--color-brand-600) 10%, transparent);
		color: var(--brand-text);
	}

	.about-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.9rem;
	}

	.about-step {
		display: flex;
		gap: 0.9rem;
		align-items: flex-start;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.step-number {
		display: inline-flex;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: var(--color-brand-600);
		color: var(--on-brand);
		font-weight: 700;
	}

	.about-values {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1.1rem;
	}

	.about-value {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.about-value-title {
		margin: 0 0 0.15rem;
		font-size: 1rem;
		font-weight: 700;
	}

	.about-built {
		margin: 0.25rem 0 0;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.about-built strong {
		color: var(--text);
	}

	.about-faq-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	@media (min-width: 768px) {
		.about-title {
			font-size: 2.25rem;
		}

		.about-principles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.about-grid.three {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.about-values {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.about-steps {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
