<script>
	import ResultReviewItem from './ResultReviewItem.svelte';

	let {
		topic = '',
		questions,
		userAnswers,
		expanded,
		bookmarkPulse,
		bookmarkedQuestionKeys,
		reportSent,
		reportTarget,
		loadingExplanation,
		explanationError,
		questionKey,
		onToggleExpanded,
		onToggleBookmark,
		onReportQuestion,
		onSubmitReport,
		onFetchExplanation,
	} = $props();
</script>

<div class="d-grid gap-3">
	{#each questions as { question, index } (`${index}-${question.question}`)}
		<ResultReviewItem
			{question}
			{index}
			{topic}
			{userAnswers}
			{expanded}
			{bookmarkPulse}
			{bookmarkedQuestionKeys}
			{reportSent}
			{reportTarget}
			{loadingExplanation}
			{explanationError}
			{questionKey}
			{onToggleExpanded}
			{onToggleBookmark}
			{onReportQuestion}
			{onSubmitReport}
			{onFetchExplanation}
		/>
	{/each}
</div>
