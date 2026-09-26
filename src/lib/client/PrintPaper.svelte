<script>
	// Clean paper body for the /print page: the test exactly as the taker saw
	// it, with no score, answers, explanations or app chrome. The host owns
	// resolution and the toolbar; this component only renders the paper.
	import MarkdownContent from './MarkdownContent.svelte';
	import QuestionAssertionReasoning from './QuestionAssertionReasoning.svelte';
	import QuestionMatching from './QuestionMatching.svelte';
	import { formatDate } from './formatting.js';
	import { t } from './i18n';

	let { paper = null, language = 'english' } = $props();

	let questions = $derived(Array.isArray(paper?.questions) ? paper.questions : []);
	let sections = $derived(Array.isArray(paper?.sections) ? paper.sections : []);
	let examMeta = $derived(paper?.examMeta || null);

	let sectionByIndex = $derived.by(() => {
		const map = new Map();
		for (const section of sections) {
			for (const index of section.questionIndexes || []) {
				map.set(index, section);
			}
		}
		return map;
	});

	let examLine = $derived(
		[
			examMeta?.schoolName,
			examMeta?.examName,
			examMeta?.patternYear
				? $t('examPaperPatternMetaShort', { year: examMeta.patternYear })
				: null,
		]
			.filter(Boolean)
			.join(' · ')
	);

	let printedOn = $derived(
		formatDate(paper?.timestamp || paper?.createdAt, language, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		})
	);

	function sectionFor(index) {
		return sectionByIndex.get(index) || null;
	}

	function isSectionFirst(index) {
		const section = sectionFor(index);
		return Boolean(section && (section.questionIndexes || [])[0] === index);
	}
</script>

<article class="print-paper">
	<header class="print-head">
		<h1 class="print-topic">{paper?.topic || ''}</h1>
		{#if examLine}
			<p class="print-exam">{examLine}</p>
		{/if}
		<p class="print-meta">
			<span>{$t('questionsCountFormat', { count: questions.length })}</span>
			{#if examMeta?.durationMinutes}
				<span>{$t('practiceMinutes', { count: examMeta.durationMinutes })}</span>
			{/if}
			{#if printedOn}
				<span>{printedOn}</span>
			{/if}
		</p>
	</header>

	<ol class="print-questions">
		{#each questions as question, index (index)}
			{#if isSectionFirst(index)}
				<li class="print-section">
					<div class="print-section-head">
						<span class="print-section-label">
							{$t('sectionLabel', {
								index: sections.indexOf(sectionFor(index)) + 1,
								total: sections.length,
							})}
						</span>
						<span class="print-section-name">{sectionFor(index)?.name}</span>
					</div>
					{#if sectionFor(index)?.instructions}
						<p class="print-section-instructions">{sectionFor(index).instructions}</p>
					{/if}
				</li>
			{/if}
			<li class="print-question">
				<div class="print-question-body">
					<span class="print-question-no">{index + 1}.</span>
					<div class="print-question-main">
						{#if question.question}
							<div class="print-question-text">
								<MarkdownContent content={question.question} />
							</div>
						{/if}
						{#if question.format === 'matching'}
							<QuestionMatching {question} />
						{:else if question.format === 'assertion-reasoning'}
							<QuestionAssertionReasoning {question} />
						{/if}
						{#if (question.options || []).length > 0}
							<div class="print-options">
								{#each question.options as option, optionIndex (optionIndex)}
									<div class="print-option">
										<span class="print-option-letter" aria-hidden="true">
											{String.fromCharCode(65 + optionIndex)}.
										</span>
										<span class="print-option-text">
											<MarkdownContent content={option} links="text" tag="span" />
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ol>

	<footer class="print-foot">
		<span>selftest.in</span>
		{#if paper?.id}
			<span>{$t('testId')}: {paper.id}</span>
		{/if}
	</footer>
</article>

<style>
	/* The paper is intentionally theme-independent: it should read like paper
	   on screen (a preview of the printed sheet) and print black on white.
	   Re-pin the design tokens so format components (matching grid, markdown)
	   keep light styling even when the app is in dark mode. */
	.print-paper {
		--surface: #ffffff;
		--surface-muted: #f3f4f6;
		--text: #111827;
		--text-muted: #4b5563;
		--line: #d1d5db;
		--brand-text: #1d4ed8;
		--on-brand: #f8fafc;
		max-width: 820px;
		margin: 0 auto;
		padding: 30px 26px 44px;
		background: #fff;
		color: #111827;
	}

	.print-head {
		margin-bottom: 22px;
		padding-bottom: 14px;
		border-bottom: 2px solid #111827;
	}

	.print-topic {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.print-exam {
		margin: 6px 0 0;
		font-size: 0.92rem;
		color: #374151;
	}

	.print-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 10px 0 0;
		font-size: 0.82rem;
		color: #4b5563;
	}

	.print-questions {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.print-section {
		margin: 24px 0 16px;
		padding: 8px 12px;
		border-left: 3px solid #111827;
		background: #f3f4f6;
		break-inside: avoid;
		page-break-inside: avoid;
	}

	.print-section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
	}

	.print-section-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #4b5563;
	}

	.print-section-name {
		font-weight: 700;
	}

	.print-section-instructions {
		margin: 6px 0 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: #374151;
	}

	.print-question {
		margin: 0 0 20px;
		break-inside: avoid;
		page-break-inside: avoid;
	}

	.print-question-body {
		display: flex;
		gap: 8px;
	}

	.print-question-no {
		min-width: 26px;
		font-weight: 700;
	}

	.print-question-main {
		flex: 1;
		min-width: 0;
	}

	.print-question-text {
		font-size: 0.98rem;
		line-height: 1.5;
	}

	.print-options {
		display: grid;
		gap: 5px;
		margin-top: 9px;
	}

	.print-option {
		display: flex;
		gap: 8px;
		font-size: 0.94rem;
		line-height: 1.45;
	}

	.print-option-letter {
		min-width: 22px;
		font-weight: 600;
	}

	.print-option-text {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.print-foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 6px 16px;
		margin-top: 28px;
		padding-top: 10px;
		border-top: 1px solid #d1d5db;
		font-size: 0.75rem;
		color: #6b7280;
	}

	@media print {
		.print-paper {
			max-width: none;
			padding: 0;
		}

		.print-section {
			padding: 0 0 6px;
			border-left: 0;
			border-bottom: 1px solid #9ca3af;
			background: transparent;
		}

		.print-question,
		.print-section,
		.print-head {
			break-inside: avoid;
			page-break-inside: avoid;
		}
	}
</style>
