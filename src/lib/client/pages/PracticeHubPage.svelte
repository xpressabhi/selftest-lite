<script>
	import { onMount } from 'svelte';
	import { activeLanguage, t } from '$lib/client/i18n';
	import Icon from '$lib/client/Icon.svelte';
	import {
		getIndianExamById,
		groupExamsByCategory,
		localizedStream,
		searchExams
	} from '$lib/data/indianExams';
	import { requestPersonalize } from '$lib/client/personalize';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import SeoHead from '$lib/client/SeoHead.svelte';
	import { SITE_ORIGIN, localizedPath } from '$lib/shared/seo';
	import { MAX_SEARCH_CHARS, sanitizeInputText } from '$lib/shared/inputLimits';

	// Grouping is registry-driven and static; search is the only client state.
	// With an empty query the page renders every card in SSR HTML, so crawlers
	// and no-JS visitors see the full catalog.
	const categories = groupExamsByCategory();

	let promotedExamId = $state(null);
	let query = $state('');

	const trimmedQuery = $derived(query.trim());
	const searching = $derived(trimmedQuery.length > 0);
	const searchResults = $derived(searching ? searchExams(trimmedQuery) : []);
	const promotedExam = $derived(promotedExamId ? getIndianExamById(promotedExamId) : null);

	onMount(() => {
		// Practice promote (fail-open, once): pin the Jev-picked exam above the
		// categories; it is removed from its own section to avoid duplicates.
		void requestPersonalize('practice', {
			ids: categories.flatMap((category) => category.exams.map((exam) => exam.id))
		}).then((decision) => {
			if (!decision?.applied || !decision.action || decision.action === 'none') return;
			if (getIndianExamById(decision.action)) {
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
			url: `${SITE_ORIGIN}${localizedPath('/practice', $activeLanguage)}`
		})
	);
</script>

{#snippet examCard(exam, highlighted = false)}
	<a
		class="practice-card"
		class:is-recommended={highlighted}
		href={localizedPath(`/practice/${exam.id}`, $activeLanguage)}
	>
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
{/snippet}

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

		<div class="practice-search">
			<span class="practice-search-icon" aria-hidden="true">
				<Icon name="search" size={18} />
			</span>
			<label class="visually-hidden" for="practice-search">{$t('practiceSearchLabel')}</label>
			<input
				id="practice-search"
				class="practice-search-input"
				type="text"
				autocomplete="off"
				placeholder={$t('practiceSearchPlaceholder')}
				maxlength={MAX_SEARCH_CHARS}
				bind:value={query}
				oninput={(event) => {
					query = sanitizeInputText(event.currentTarget.value, MAX_SEARCH_CHARS);
				}}
			/>
			{#if query}
				<button
					type="button"
					class="practice-search-clear"
					aria-label={$t('practiceSearchClear')}
					onclick={() => (query = '')}
				>
					<Icon name="close" size={16} />
				</button>
			{/if}
		</div>

		{#if searching}
			<p class="practice-search-count" aria-live="polite">
				{$t('practiceSearchResults', { count: searchResults.length })}
			</p>
			{#if searchResults.length > 0}
				<div class="practice-grid">
					{#each searchResults as exam (exam.id)}
						{@render examCard(exam)}
					{/each}
				</div>
			{:else}
				<div class="practice-search-empty">
					<p class="practice-search-empty-title">
						{$t('practiceSearchEmptyTitle', { query: trimmedQuery })}
					</p>
					<p class="practice-search-empty-hint">{$t('practiceSearchEmptyHint')}</p>
				</div>
			{/if}
		{:else}
			<nav class="practice-jump" aria-label={$t('practiceJumpLabel')}>
				{#each categories as category (category.id)}
					<a class="practice-chip" href={`#practice-cat-${category.id}`}>
						{$t(category.labelKey)}
					</a>
				{/each}
			</nav>

			{#if promotedExam}
				<section class="practice-recommended" aria-label={$t('practiceRecommendedTitle')}>
					<p class="practice-recommended-label">{$t('practiceRecommendedTitle')}</p>
					<div class="practice-grid">
						{@render examCard(promotedExam, true)}
					</div>
				</section>
			{/if}

			{#each categories as category (category.id)}
				{@const visibleExams = category.exams.filter((exam) => exam.id !== promotedExamId)}
				{#if visibleExams.length > 0}
					<section class="practice-category" id={`practice-cat-${category.id}`}>
						<h2 class="practice-category-title">{$t(category.labelKey)}</h2>
						<div class="practice-grid">
							{#each visibleExams as exam (exam.id)}
								{@render examCard(exam)}
							{/each}
						</div>
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</section>

<style>
	.practice-hub {
		max-width: 56rem;
		margin: 0 auto;
		display: grid;
		gap: 1.25rem;
	}

	.practice-hub-hero {
		text-align: center;
	}

	.practice-hub-title {
		margin: 0 0 0.35rem;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.practice-hub-sub {
		margin: 0 auto;
		max-width: 40rem;
		color: var(--text-muted);
	}

	.practice-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 48px;
		padding: 0 0.25rem 0 0.85rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		transition:
			border-color 0.15s ease-out,
			box-shadow 0.15s ease-out;
	}

	.practice-search:focus-within {
		border-color: var(--brand-text);
		box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
	}

	.practice-search-icon {
		display: inline-flex;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.practice-search-input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		/* 16px keeps iOS Safari from zooming the page on focus. */
		font-size: 1rem;
		min-height: 46px;
	}

	.practice-search-input::placeholder {
		color: var(--text-muted);
	}

	.practice-search-clear {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
	}

	.practice-search-clear:hover {
		background: var(--surface-muted);
		color: var(--text);
	}

	.practice-search-count {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.practice-search-empty {
		border: 1px dashed var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		padding: 2rem 1rem;
		text-align: center;
	}

	.practice-search-empty-title {
		margin: 0 0 0.35rem;
		font-weight: 600;
	}

	.practice-search-empty-hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.practice-jump {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
		scrollbar-width: none;
	}

	.practice-jump::-webkit-scrollbar {
		display: none;
	}

	.practice-chip {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 1rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: inherit;
		font-size: 0.9rem;
		white-space: nowrap;
		text-decoration: none;
		transition:
			border-color 0.15s ease-out,
			background-color 0.15s ease-out;
	}

	.practice-chip:hover {
		border-color: var(--brand-text);
		background: var(--surface-muted);
	}

	.practice-recommended {
		display: grid;
		gap: 0.5rem;
	}

	.practice-recommended-label {
		margin: 0;
		color: var(--brand-text);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.practice-category {
		display: grid;
		gap: 0.75rem;
		scroll-margin-top: 84px;
	}

	.practice-category-title {
		margin: 0.5rem 0 0;
		font-size: 1.15rem;
		font-weight: 700;
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

	.practice-card.is-recommended {
		border-color: var(--brand-text);
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
	}
</style>
