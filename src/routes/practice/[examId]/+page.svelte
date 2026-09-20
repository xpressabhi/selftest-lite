<script>
	import { t } from '$lib/client/i18n';
	import CtaBanner from '$lib/client/CtaBanner.svelte';
	import { jsonLdScript } from '$lib/shared/jsonLd';

	let { data } = $props();

	const exam = $derived(data.exam);
	const pageTitle = $derived(`${exam.name} ${$t('practiceH1Suffix')} | selftest.in`);
	const pageDescription = $derived(
		`${exam.name} (${exam.stream}): free AI-generated mock tests and sectional quizzes. ${exam.syllabus?.slice(0, 4).join(', ') || ''}. Practice in English and Hindi.`
	);

	const practiceJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'LearningResource',
			name: `${exam.name} Mock Tests & Practice Papers`,
			description: pageDescription,
			url: `https://selftest.in/practice/${exam.id}`,
			inLanguage: ['en-IN', 'hi-IN'],
			teaches: exam.syllabus || [],
			educationalLevel: exam.group || exam.stream,
			provider: { '@type': 'Organization', name: 'selftest.in', url: 'https://selftest.in' },
		})
	);

	const breadcrumbJsonLd = $derived(
		jsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://selftest.in/' },
				{
					'@type': 'ListItem',
					position: 2,
					name: $t('practiceTitle'),
					item: 'https://selftest.in/practice',
				},
				{
					'@type': 'ListItem',
					position: 3,
					name: exam.name,
					item: `https://selftest.in/practice/${exam.id}`,
				},
			],
		})
	);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<meta name="robots" content="index, follow, max-image-preview:large" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	{@html practiceJsonLd}
	{@html breadcrumbJsonLd}
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="practice-wrap">
		<nav class="practice-back" aria-label={$t('practiceTitle')}>
			<a class="practice-back-link" href="/practice">← {$t('practiceAllExams')}</a>
		</nav>

		<header class="practice-hero">
			<h1 class="practice-title">{exam.name} {$t('practiceH1Suffix')}</h1>
			<p class="practice-lead">
				{$t('practiceIntro', { name: exam.name, stream: exam.stream })}
			</p>
			<a class="btn btn-primary" href={`/?exam=${exam.id}`}>
				{$t('practiceCta', { name: exam.name })}
			</a>
		</header>

		<section class="practice-section" aria-label={$t('practicePatternTitle')}>
			<h2 class="practice-section-title">{$t('practicePatternTitle')}</h2>
			<dl class="practice-pattern">
				<div>
					<dt>{$t('practiceQuestions')}</dt>
					<dd>{exam.fullLengthQuestions || exam.defaultNumQuestions}</dd>
				</div>
				<div>
					<dt>{$t('practiceDuration')}</dt>
					<dd>
						{exam.durationMinutes
							? $t('practiceMinutes', { count: exam.durationMinutes })
							: '—'}
					</dd>
				</div>
				<div>
					<dt>{$t('practiceDifficulty')}</dt>
					<dd>{exam.defaultDifficulty || 'intermediate'}</dd>
				</div>
				<div>
					<dt>{$t('practiceLanguages')}</dt>
					<dd>English + Hindi</dd>
				</div>
			</dl>
		</section>

		{#if exam.syllabus?.length}
			<section class="practice-section" aria-label={$t('practiceSyllabusTitle')}>
				<h2 class="practice-section-title">{$t('practiceSyllabusTitle')}</h2>
				<ul class="practice-list">
					{#each exam.syllabus as unit (unit)}
						<li>{unit}</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="practice-section" aria-label={$t('practiceStepsTitle')}>
			<h2 class="practice-section-title">{$t('practiceStepsTitle')}</h2>
			<ol class="practice-list">
				<li>{$t('practiceStep1')}</li>
				<li>{$t('practiceStep2')}</li>
				<li>{$t('practiceStep3')}</li>
			</ol>
		</section>

		{#if data.related.length > 0}
			<section class="practice-section" aria-label={$t('practiceRelatedTitle')}>
				<h2 class="practice-section-title">{$t('practiceRelatedTitle')}</h2>
				<div class="practice-related">
					{#each data.related as item (item.id)}
						<a class="practice-card" href={`/practice/${item.id}`}>
							<strong>{item.name}</strong>
							<span>{item.stream}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<CtaBanner
			titleKey="blogPracticeCtaTitle"
			bodyKey="blogPracticeCtaBody"
			buttonKey="aboutCtaButton"
			href={`/?exam=${exam.id}`}
			compact
		/>
	</div>
</section>

<style>
	.practice-wrap {
		max-width: 56rem;
		margin: 0 auto;
		display: grid;
		gap: 1.75rem;
	}

	.practice-back-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		color: var(--brand-text);
		font-weight: 600;
		text-decoration: none;
	}

	.practice-hero {
		display: grid;
		gap: 0.75rem;
	}

	.practice-title {
		margin: 0;
		font-size: 1.9rem;
		line-height: 1.15;
		font-weight: 700;
	}

	.practice-lead {
		margin: 0;
		max-width: 44rem;
		color: var(--text-muted);
		font-size: 1.05rem;
		line-height: 1.65;
	}

	.practice-section {
		display: grid;
		gap: 0.75rem;
	}

	.practice-section-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
	}

	.practice-pattern {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0;
		padding: 0;
	}

	.practice-pattern div {
		padding: 0.9rem;
		border: 1px solid var(--line);
		border-radius: 0.9rem;
		background: var(--surface);
	}

	.practice-pattern dt {
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.practice-pattern dd {
		margin: 0.15rem 0 0;
		font-size: 1.05rem;
		font-weight: 700;
	}

	.practice-list {
		margin: 0;
		padding-left: 1.25rem;
		display: grid;
		gap: 0.45rem;
		color: var(--text-muted);
		line-height: 1.65;
	}

	.practice-related {
		display: grid;
		gap: 0.75rem;
	}

	.practice-card {
		display: grid;
		gap: 0.15rem;
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
		.practice-title {
			font-size: 2.25rem;
		}

		.practice-pattern {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.practice-related {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
