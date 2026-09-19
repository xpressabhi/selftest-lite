<script>
	import { t } from '$lib/client/i18n';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import FaqAccordion from '$lib/client/FaqAccordion.svelte';
	import { getFaqItems } from '$lib/data/faqs';

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
			icon: 'doc',
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
			icon: 'bolt',
		},
		{
			titleKey: 'aboutValueFocusTitle',
			bodyKey: 'aboutValueFocusBody',
			icon: 'focus',
		},
	];

	const teaserItems = getFaqItems(['what-is', 'is-free', 'sign-in', 'offline']);
</script>

<svelte:head>
	<title>{$t('aboutHeroTitle')} | selftest.in</title>
	<meta
		name="description"
		content="Learn how selftest.in helps learners practice with AI-generated quizzes and exam papers."
	/>
	<link rel="canonical" href="https://selftest.in/about" />
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
				<a class="btn btn-primary" href="/">{$t('aboutCtaButton')}</a>
				<a class="about-link" href="/faq">{$t('contactQuickHelpFaq')}</a>
			</div>
		</header>

		<section class="about-section">
			<h2 class="about-section-title">{$t('aboutMissionTitle')}</h2>
			<p class="about-mission">{$t('aboutMissionBody')}</p>

			<h3 class="about-subtitle">{$t('aboutWhyWorksTitle')}</h3>
			<div class="about-grid three">
				{#each whyItWorks as point (point.titleKey)}
					<div class="about-card">
						<h4 class="about-card-title">{$t(point.titleKey)}</h4>
						<p class="about-card-body">{$t(point.bodyKey)}</p>
					</div>
				{/each}
			</div>
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
							{#if item.icon === 'doc'}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
									<path
										d="M5 3h7l3 3v11H5V3z"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linejoin="round"
									/>
									<path d="M7.5 9h5M7.5 12h5" stroke="currentColor" stroke-width="1.6" />
								</svg>
							{:else if item.icon === 'list'}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
									<path
										d="M4 5.5h12M4 10h12M4 14.5h8"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
									/>
								</svg>
							{:else}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
									<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6" />
									<path
										d="M3 10h14M10 3c2 2.2 2 11.8 0 14M10 3c-2 2.2-2 11.8 0 14"
										stroke="currentColor"
										stroke-width="1.3"
									/>
								</svg>
							{/if}
						</span>
						<h3 class="about-card-title">{$t(item.titleKey)}</h3>
						<p class="about-card-body">{$t(item.bodyKey)}</p>
					</div>
				{/each}
			</div>
		</section>

		<section class="about-section">
			<div class="about-grid three">
				{#each values as value (value.titleKey)}
					<div class="about-card">
						<span class="about-icon" aria-hidden="true">
							{#if value.icon === 'shield'}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
									<path
										d="M10 3l6 2v5c0 3.4-2.4 5.9-6 7-3.6-1.1-6-3.6-6-7V5l6-2z"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linejoin="round"
									/>
								</svg>
							{:else if value.icon === 'bolt'}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
									<path
										d="M11 3L5.5 11H10l-1 6 5.5-8H10l1-6z"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
									<circle cx="10" cy="7.5" r="3" stroke="currentColor" stroke-width="1.6" />
									<path
										d="M4.5 16c.9-2.8 3-4.2 5.5-4.2s4.6 1.4 5.5 4.2"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
									/>
								</svg>
							{/if}
						</span>
						<h3 class="about-card-title">{$t(value.titleKey)}</h3>
						<p class="about-card-body">{$t(value.bodyKey)}</p>
					</div>
				{/each}
			</div>
			<p class="about-built">
				<strong>{$t('aboutBuiltTitle')}</strong>
				{$t('aboutBuiltBody')}
			</p>
		</section>

		<section class="about-section">
			<div class="about-faq-head">
				<h2 class="about-section-title">{$t('aboutFaqTeaserTitle')}</h2>
				<a class="about-link" href="/faq">{$t('contactQuickHelpFaq')}</a>
			</div>
			<FaqAccordion items={teaserItems} />
		</section>

		<CtaBanner titleKey="aboutCtaTitle" bodyKey="aboutCtaBody" href="/" />
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
		background: rgba(79, 70, 229, 0.12);
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

	.about-card {
		display: grid;
		gap: 0.35rem;
		align-content: start;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 0.9rem;
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
		border-radius: 0.6rem;
		background: rgba(79, 70, 229, 0.1);
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
		border-radius: 0.9rem;
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
		background: var(--brand-text);
		color: #fff;
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

		.about-grid.three {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.about-steps {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
