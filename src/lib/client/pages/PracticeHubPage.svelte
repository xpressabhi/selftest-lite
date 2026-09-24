<script>
	import { onMount } from 'svelte';
	import { activeLanguage, t } from '$lib/client/i18n';
	import Icon from '$lib/client/Icon.svelte';
	import { OBJECTIVE_ONLY_EXAMS, localizedStream } from '$lib/data/indianExams';
	import { requestPersonalize } from '$lib/client/personalize';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { SITE_ORIGIN, localizedPath } from '$lib/shared/seo';

	let promotedExamId = $state(null);
	let orderedExams = $derived(
		promotedExamId
			? [
					...OBJECTIVE_ONLY_EXAMS.filter((exam) => exam.id === promotedExamId),
					...OBJECTIVE_ONLY_EXAMS.filter((exam) => exam.id !== promotedExamId),
				]
			: OBJECTIVE_ONLY_EXAMS
	);

	onMount(() => {
		// Practice promote (fail-open, once): move the Jev-picked exam to the
		// top; the full grid stays intact below it.
		void requestPersonalize('practice', {
			ids: OBJECTIVE_ONLY_EXAMS.map((exam) => exam.id),
		}).then((decision) => {
			if (!decision?.applied || !decision.action || decision.action === 'none') return;
			if (OBJECTIVE_ONLY_EXAMS.some((exam) => exam.id === decision.action)) {
				promotedExamId = decision.action;
			}
		});
	});

	const hubJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: $t('practiceTitle'),
			description: $t('practiceHeroBody'),
			url: `${SITE_ORIGIN}${localizedPath('/practice', $activeLanguage)}`,
		})
	);
</script>

<SeoHead
	path={localizedPath('/practice', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('practiceTitle')} | selftest.in`}
	description={$t('practiceHeroBody')}
/>
<svelte:head>
	{@html hubJsonLd}
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="practice-hub">
		<header class="practice-hub-hero">
			<h1 class="practice-hub-title">{$t('practiceTitle')}</h1>
			<p class="practice-hub-sub">{$t('practiceHeroBody')}</p>
		</header>
		<div class="practice-grid">
			{#each orderedExams as exam (exam.id)}
				<a class="practice-card" href={localizedPath(`/practice/${exam.id}`, $activeLanguage)}>
					<span class="practice-card-copy">
						<strong>{exam.name}</strong>
						<span class="practice-card-meta">
							{localizedStream(exam.stream, $activeLanguage)} · {exam.fullLengthQuestions ||
								exam.defaultNumQuestions}
							{$t('practiceQuestions')}
						</span>
					</span>
					<span class="practice-card-chevron" aria-hidden="true">
						<Icon name="chevron-right" size={18} />
					</span>
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
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.9rem 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		color: inherit;
		text-decoration: none;
		transition:
			border-color 0.15s ease-out,
			background-color 0.15s ease-out,
			transform 0.12s ease-out;
	}

	.practice-card:hover {
		border-color: var(--brand-text);
		background: var(--surface-muted);
	}

	.practice-card:active {
		transform: translateY(1px);
	}

	.practice-card-copy {
		display: grid;
		gap: 0.2rem;
	}

	.practice-card-meta {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.practice-card-chevron {
		color: var(--text-muted);
		transition: color 0.15s ease-out;
	}

	.practice-card:hover .practice-card-chevron {
		color: var(--brand-text);
	}

	@media (min-width: 768px) {
		.practice-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.practice-card:first-child {
			grid-column: 1 / -1;
			padding: 1.25rem 1.25rem;
		}

		.practice-card:first-child strong {
			font-size: 1.15rem;
		}
	}
</style>
