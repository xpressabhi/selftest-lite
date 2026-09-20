<script>
	import { t } from '$lib/client/i18n';
	import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
	import { jsonLdScript } from '$lib/shared/jsonLd';

	const hubJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: $t('practiceTitle'),
			description: $t('practiceHeroBody'),
			url: 'https://www.selftest.in/practice',
		})
	);
</script>

<svelte:head>
	<title>{$t('practiceTitle')} | selftest.in</title>
	<meta name="description" content={$t('practiceHeroBody')} />
	<meta name="robots" content="index, follow, max-image-preview:large" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={`${$t('practiceTitle')} | selftest.in`} />
	<meta property="og:description" content={$t('practiceHeroBody')} />
	<meta name="twitter:title" content={`${$t('practiceTitle')} | selftest.in`} />
	<meta name="twitter:description" content={$t('practiceHeroBody')} />
	{@html hubJsonLd}
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="practice-hub">
		<header class="practice-hub-hero">
			<h1 class="practice-hub-title">{$t('practiceTitle')}</h1>
			<p class="practice-hub-sub">{$t('practiceHeroBody')}</p>
		</header>
		<div class="practice-grid">
			{#each OBJECTIVE_ONLY_EXAMS as exam (exam.id)}
				<a class="practice-card" href={`/practice/${exam.id}`}>
					<strong>{exam.name}</strong>
					<span
						>{exam.stream} · {exam.fullLengthQuestions ||
							exam.defaultNumQuestions}
						{$t('practiceQuestions')}</span
					>
				</a>
			{/each}
		</div>
	</div>
</section>

<style>
	.practice-hub {
		max-width: 64rem;
		margin: 0 auto;
		display: grid;
		gap: 1.5rem;
	}

	.practice-hub-hero {
		text-align: center;
	}

	.practice-hub-title {
		margin: 0 0 0.35rem;
		font-size: 1.9rem;
		font-weight: 700;
	}

	.practice-hub-sub {
		margin: 0 auto;
		max-width: 40rem;
		color: var(--text-muted);
	}

	.practice-grid {
		display: grid;
		gap: 0.75rem;
	}

	.practice-card {
		display: grid;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--line);
		border-radius: 0.9rem;
		background: var(--surface);
		color: inherit;
		text-decoration: none;
	}

	.practice-card span {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	@media (min-width: 768px) {
		.practice-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
