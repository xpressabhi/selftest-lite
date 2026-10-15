<script>
	import ResultReviewItem from './ResultReviewItem.svelte';

	let {
		questions,
		visualState = {},
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
		onBuildVisual,
		onOpenVisual,
	} = $props();
</script>

<div class="d-grid gap-3">
	{#each questions as { question, index } (`${index}-${question.question}`)}
		<ResultReviewItem
			{question}
			{index}
			visual={visualState[index]}
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
			{onBuildVisual}
			{onOpenVisual}
		/>
	{/each}
</div>
