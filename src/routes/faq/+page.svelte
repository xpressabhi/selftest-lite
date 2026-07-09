<script>
	import { t } from '$lib/client/i18n';

	const questions = [
		['faqQWhatIs', 'faqAWhatIs1', 'faqAWhatIsHighlight', 'faqAWhatIs2'],
		['faqQIsFree', 'faqAIsFree'],
		['faqQStoreData', 'faqAStoreData'],
		['faqQSaveQuizzes', 'faqASaveQuizzes'],
		['faqQAiGeneration', 'faqAAiGeneration'],
	];
</script>

<svelte:head>
	<title>{$t('faqHeroTitle')} | selftest.in</title>
	<meta name="description" content="Frequently asked questions about selftest.in quizzes, privacy, sync, and AI generation." />
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto" style="max-width: 820px;">
		<h1 class="h2 fw-bold">{$t('faqHeroTitle')}</h1>
		<p class="text-muted mb-4">{$t('faqHeroBody')}</p>
		<div class="accordion d-grid gap-3">
			{#each questions as item (item[0])}
				<article class="bg-body border rounded-3 p-3">
					<h2 class="h5 fw-bold">{$t(item[0])}</h2>
					{#if item.length === 4}
						<p class="mb-0">{$t(item[1])}<strong>{$t(item[2])}</strong>{$t(item[3])}</p>
					{:else}
						<p class="mb-0 text-muted">{$t(item[1])}</p>
					{/if}
				</article>
			{/each}
		</div>
		<div class="mt-4">
			<span class="text-muted">{$t('faqStillHaveQuestions')}</span>
			<a class="ms-2" href="/contact">{$t('faqContactUs')}</a>
		</div>
	</div>
</section>
