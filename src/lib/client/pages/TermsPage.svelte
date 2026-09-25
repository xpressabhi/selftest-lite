<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { localizedPath } from '$lib/shared/seo';
</script>

<SeoHead
	path={localizedPath('/terms', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('termsHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('termsHeroBody')
		: 'Terms of service for using selftest.in.'}
	ogDescription={$activeLanguage === 'hindi'
		? $t('termsHeroBody')
		: 'Terms of service for using selftest.in AI quizzes and exam papers.'}
/>

<section class="app-container py-4 py-md-5">
	<div class="legal-wrap">
		<header class="legal-hero">
			<h1 class="legal-title">{$t('termsHeroTitle')}</h1>
			<p class="legal-lead measure">{$t('termsHeroBody')}</p>
		</header>
		<div class="legal-grid">
			<article class="legal-card">
				<h2 class="legal-card-title">{$t('termsSectionUseTitle')}</h2>
				<p class="legal-card-body">{$t('termsSectionUseBody')}</p>
			</article>
			<article class="legal-card">
				<h2 class="legal-card-title">{$t('termsSectionLiabilityTitle')}</h2>
				<p class="legal-card-body">{$t('termsSectionLiabilityBody')}</p>
			</article>
		</div>
	</div>
</section>

<style>
	.legal-wrap {
		display: grid;
		gap: 1.5rem;
	}

	.legal-hero {
		display: grid;
		gap: 0.5rem;
	}

	.legal-title {
		margin: 0;
		font-size: 1.5rem;
		line-height: 1.15;
		font-weight: 700;
	}

	.legal-lead {
		margin: 0;
		color: var(--text-muted);
		font-size: 1.05rem;
		line-height: 1.65;
	}

	.legal-grid {
		display: grid;
		gap: 1rem;
	}

	.legal-card {
		display: grid;
		gap: 0.5rem;
		align-content: start;
		padding: 1.1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.legal-card-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
	}

	.legal-card-body {
		max-width: 68ch;
		margin: 0;
		color: var(--text-muted);
		line-height: 1.65;
	}

	@media (min-width: 768px) {
		.legal-title {
			font-size: 1.875rem;
		}

		.legal-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
