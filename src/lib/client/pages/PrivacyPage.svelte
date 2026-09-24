<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { localizedPath } from '$lib/shared/seo';

	const sections = [
		['privacySection1Title', 'privacySection1Body'],
		['privacySection2Title', 'privacySection2Body'],
		['privacySection3Title', 'privacySection3Body'],
		['privacySection4Title', 'privacySection4Body'],
		['privacySection5Title', 'privacySection5Body'],
		['privacySection6Title', 'privacySection6Body'],
		['privacySection7Title', 'privacySection7Body'],
	];
</script>

<SeoHead
	path={localizedPath('/privacy', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('privacyHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('privacyHeroBody')
		: 'Privacy policy for selftest.in learning data, local storage, analytics, and contact information.'}
	ogDescription={$activeLanguage === 'hindi'
		? $t('privacyHeroBody')
		: 'How selftest.in handles learning data, local storage, analytics and contact information.'}
	twitterDescription={$activeLanguage === 'hindi'
		? $t('privacyHeroBody')
		: 'How selftest.in handles learning data, local storage and analytics.'}
/>

<section class="container py-4 py-md-5">
	<div class="legal-wrap">
		<header class="legal-hero">
			<h1 class="legal-title">{$t('privacyHeroTitle')}</h1>
			<p class="legal-lead">{$t('privacyHeroBody')}</p>
			<p class="legal-updated">{$t('privacyLastUpdated')}</p>
		</header>
		<div class="legal-grid">
			{#each sections as section (section[0])}
				<article class="legal-card">
					<h2 class="legal-card-title">{$t(section[0])}</h2>
					<p class="legal-card-body">{$t(section[1])}</p>
				</article>
			{/each}
		</div>
		<a class="btn btn-primary legal-action" href={localizedPath('/contact', $activeLanguage)}>
			{$t('privacyContactButton')}
		</a>
	</div>
</section>

<style>
	.legal-wrap {
		max-width: 46rem;
		margin: 0 auto;
		display: grid;
		gap: 1.5rem;
	}

	.legal-hero {
		display: grid;
		gap: 0.5rem;
	}

	.legal-title {
		margin: 0;
		font-size: 1.9rem;
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
		margin: 0;
		color: var(--text-muted);
		line-height: 1.65;
	}

	.legal-action {
		justify-self: start;
		text-decoration: none;
	}

	@media (min-width: 768px) {
		.legal-title {
			font-size: 2.25rem;
		}

		.legal-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.legal-card:nth-child(n + 6) {
			grid-column: 1 / -1;
		}
	}
</style>
