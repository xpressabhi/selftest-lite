<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { SITE_ORIGIN, localizedPath } from '$lib/shared/seo';

	const contactJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'ContactPage',
			name: $t('contactHeroTitle'),
			description: $t('contactHeroBody'),
			url: `${SITE_ORIGIN}/contact`,
			mainEntity: {
				'@type': 'Person',
				name: 'Abhishek Maurya',
				email: 'mailto:akm.nitt@gmail.com',
				url: 'https://xpressabhi.github.io/',
				jobTitle: 'AI Engineer',
				sameAs: ['https://github.com/xpressabhi', 'https://www.linkedin.com/in/akm85/'],
			},
		})
	);

	const tips = ['contactTip1', 'contactTip2', 'contactTip3'];
</script>

<SeoHead
	path={localizedPath('/contact', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('contactHeroTitle')} | selftest.in`}
	description={$activeLanguage === 'hindi'
		? $t('contactHeroBody')
		: 'Contact selftest.in for feedback, questions, and support.'}
/>
<svelte:head>
	{@html contactJsonLd}
</svelte:head>

<section class="app-container py-4 py-md-5">
	<div class="contact-wrap">
		<header class="contact-hero">
			<h1 class="contact-title">{$t('contactHeroTitle')}</h1>
			<p class="contact-lead">{$t('contactHeroBody')}</p>
		</header>

		<div class="contact-grid">
			<article class="contact-card">
				<h2 class="contact-card-title">{$t('contactInfoTitle')}</h2>
				<p class="contact-card-body">{$t('contactInfoBody')}</p>
				<a class="btn btn-primary contact-action" href="mailto:akm.nitt@gmail.com">
					akm.nitt@gmail.com
				</a>
			</article>

			<article class="contact-card">
				<h2 class="contact-card-title">{$t('contactCommunityTitle')}</h2>
				<p class="contact-card-body">{$t('contactCommunityBody')}</p>
				<a
					class="btn btn-outline-primary contact-action"
					href="https://x.com/selftest_in"
					target="_blank"
					rel="noopener noreferrer"
				>
					{$t('connectOnX')}
				</a>
			</article>

			<article class="contact-card contact-card-wide">
				<h2 class="contact-card-title">{$t('contactBuilderTitle')}</h2>
				<p class="contact-card-body">{$t('contactBuilderBody')}</p>
				<ul class="contact-social">
					<li>
						<a
							class="contact-pill"
							href="https://xpressabhi.github.io/"
							target="_blank"
							rel="noopener noreferrer"
						>
							{$t('contactBuilderPortfolio')}
						</a>
					</li>
					<li>
						<a
							class="contact-pill"
							href="https://github.com/xpressabhi"
							target="_blank"
							rel="noopener noreferrer"
						>
							{$t('contactBuilderGithub')}
						</a>
					</li>
					<li>
						<a
							class="contact-pill"
							href="https://www.linkedin.com/in/akm85/"
							target="_blank"
							rel="noopener noreferrer"
						>
							{$t('contactBuilderLinkedin')}
						</a>
					</li>
				</ul>
			</article>
		</div>

		<section class="contact-help">
			<div class="contact-help-group">
				<h2 class="contact-section-title">{$t('contactTipsTitle')}</h2>
				<ul class="contact-tips">
					{#each tips as tipKey (tipKey)}
						<li class="contact-tip">
							<span class="tip-check" aria-hidden="true">
								<Icon name="check" size={14} />
							</span>
							<span>{$t(tipKey)}</span>
						</li>
					{/each}
				</ul>
			</div>

			<div class="contact-help-group">
				<h2 class="contact-section-title">{$t('contactQuickHelpTitle')}</h2>
				<ul class="contact-quick">
					<li>
						<a class="contact-pill" href={localizedPath('/faq', $activeLanguage)}>
							{$t('contactQuickHelpFaq')}
						</a>
					</li>
					<li>
						<a class="contact-pill" href={localizedPath('/privacy', $activeLanguage)}>
							{$t('contactQuickHelpPrivacy')}
						</a>
					</li>
					<li>
						<a class="contact-pill" href={`${localizedPath('/faq', $activeLanguage)}#q-wrong-answer`}>
							{$t('contactQuickHelpReport')}
						</a>
					</li>
				</ul>
			</div>
		</section>

		<CtaBanner
			titleKey="aboutCtaTitle"
			bodyKey="aboutCtaBody"
			buttonKey="aboutCtaButton"
			href={localizedPath('/', $activeLanguage)}
			compact
		/>
	</div>
</section>

<style>
	.contact-wrap {
		max-width: 56rem;
		margin: 0 auto;
		display: grid;
		gap: 1.75rem;
	}

	.contact-hero {
		text-align: center;
	}

	.contact-title {
		margin: 0 0 0.35rem;
		font-size: 1.5rem;
		line-height: 1.15;
		font-weight: 700;
	}

	.contact-lead {
		margin: 0 auto;
		max-width: 38rem;
		color: var(--text-muted);
		font-size: 1.05rem;
		line-height: 1.6;
	}

	.contact-grid {
		display: grid;
		gap: 1rem;
	}

	.contact-card {
		display: grid;
		gap: 0.5rem;
		align-content: start;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.contact-card-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
	}

	.contact-card-body {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.contact-card-wide {
		grid-column: 1 / -1;
	}

	.contact-social,
	.contact-quick {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.contact-help {
		display: grid;
		gap: 1.25rem;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.contact-help-group {
		display: grid;
		gap: 0.75rem;
	}

	.contact-help-group + .contact-help-group {
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}

	.contact-pill {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			border-color 0.15s ease-out,
			background-color 0.15s ease-out,
			color 0.15s ease-out,
			transform 0.12s ease-out;
	}

	.contact-pill:hover {
		border-color: var(--brand-text);
		background: color-mix(in srgb, var(--color-brand-600) 8%, var(--surface));
		color: var(--brand-text);
	}

	.contact-pill:active {
		transform: translateY(1px);
	}

	.contact-action {
		justify-self: start;
		margin-top: 0.25rem;
		text-decoration: none;
	}

	.contact-section-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
	}

	.contact-tips {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.65rem;
	}

	.contact-tip {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.tip-check {
		display: inline-flex;
		width: 1.35rem;
		height: 1.35rem;
		flex-shrink: 0;
		margin-top: 0.15rem;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-brand-600) 12%, transparent);
		color: var(--brand-text);
	}

	@media (min-width: 768px) {
		.contact-title {
			font-size: 1.875rem;
		}

		.contact-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.contact-card {
			padding: 1.5rem;
		}
	}
</style>
