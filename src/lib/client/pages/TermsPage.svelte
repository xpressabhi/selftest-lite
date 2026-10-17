<script>
	import { activeLanguage, t } from '#lib/client/i18n.js';
	import SeoHead from '#lib/client/SeoHead.svelte';
	import { localizedPath } from '#lib/shared/seo.js';

	// Kept deliberately close to the product reality: no payment is taken, the
	// early-access features can be granted or revoked, and AI content is
	// best-effort with an in-app report path. Contact is one tap from here.
	const sections = [
		['termsSectionUseTitle', 'termsSectionUseBody'],
		['termsSectionAccountsTitle', 'termsSectionAccountsBody'],
		['termsSectionContentTitle', 'termsSectionContentBody'],
		['termsSectionPremiumTitle', 'termsSectionPremiumBody'],
		['termsSectionChangesTitle', 'termsSectionChangesBody'],
		['termsSectionLawTitle', 'termsSectionLawBody'],
	];
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
			<p class="legal-updated">{$t('termsLastUpdated')}</p>
		</header>
		<div class="legal-grid">
			{#each sections as section (section[0])}
				<article class="legal-card">
					<h2 class="legal-card-title">{$t(section[0])}</h2>
					<p class="legal-card-body">{$t(section[1])}</p>
				</article>
			{/each}
		</div>
		<div class="d-flex flex-wrap gap-2">
			<a class="btn btn-primary" href={localizedPath('/contact', $activeLanguage)}>
				{$t('privacyContactButton')}
			</a>
			<a class="btn btn-outline-secondary" href={localizedPath('/privacy', $activeLanguage)}>
				{$t('termsPrivacyLink')}
			</a>
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

	.legal-updated {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.85rem;
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
