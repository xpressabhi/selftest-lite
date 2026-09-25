<script>
	import { onMount } from 'svelte';
	import { activeLanguage, t } from '$lib/client/i18n';
	import { track } from '$lib/client/telemetry';
	import {
		getBookmarkedExamIds,
		getBookmarkedQuizPresets,
		getQuestionBookmarks,
		saveBookmarkedExamIds,
		saveBookmarkedQuizPresets,
		saveQuestionBookmarks,
	} from '$lib/client/storage';
	import Icon from '$lib/client/Icon.svelte';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import { hydrateUserState } from '$lib/client/sync';
	import { getIndianExamById, localizedStream } from '$lib/data/indianExams';

	let examIds = $state([]);
	let presets = $state([]);
	let questionBookmarks = $state([]);

	let exams = $derived(
		examIds
			.map((examId) => getIndianExamById(examId))
			.filter((exam) => exam && typeof exam === 'object')
	);

	onMount(() => {
		track('bookmarks:view');
		examIds = getBookmarkedExamIds();
		presets = getBookmarkedQuizPresets();
		questionBookmarks = getQuestionBookmarks();
		// Pull bookmarks saved on other devices / before login.
		void hydrateUserState().then(() => {
			examIds = getBookmarkedExamIds();
			presets = getBookmarkedQuizPresets();
			questionBookmarks = getQuestionBookmarks();
		});
	});

	function removeExam(examId) {
		if (!confirm($t('removeBookmarkConfirm'))) {
			return;
		}
		examIds = examIds.filter((id) => id !== examId);
		saveBookmarkedExamIds(examIds);
		track('bookmark:remove-exam', { examId });
	}

	function removePreset(presetId) {
		if (!confirm($t('removeBookmarkConfirm'))) {
			return;
		}
		presets = presets.filter((preset) => preset.id !== presetId);
		saveBookmarkedQuizPresets(presets);
		track('bookmark:remove-preset', { presetId });
	}

	function removeQuestionBookmark(bookmark) {
		if (!confirm($t('removeBookmarkConfirm'))) {
			return;
		}
		questionBookmarks = questionBookmarks.filter(
			(item) => item.question !== bookmark.question || item.answer !== bookmark.answer
		);
		saveQuestionBookmarks(questionBookmarks);
		track('bookmark:remove-question');
	}
</script>

<svelte:head>
	<title>{$t('bookmarks')} | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="container py-4">
	<header class="page-head">
		<div>
			<h1 class="text-page mb-1">{$t('bookmarks')}</h1>
			<p class="text-muted mb-0">{$t('useBookmarksOrChooseMode')}</p>
		</div>
		<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
	</header>

	<div class="bookmark-grid">
		<section class="bm-section">
			<header class="bm-head">
				<h2 class="bm-title">{$t('bookmarkedExams')}</h2>
				<span class="bm-count">{exams.length}</span>
			</header>
			{#if exams.length === 0}
				<p class="bm-empty">{$t('noBookmarkedExams')}</p>
			{:else}
				{#each exams as exam (exam.id)}
					<div class="bm-item">
						<a class="bm-row" href={`/?exam=${exam.id}`}>
							<span class="bm-main">
								<span class="bm-name">{exam.name}</span>
								<span class="bm-meta">
									{localizedStream(exam.stream, $activeLanguage)} ·
									{exam.durationMinutes}
									{$t('minuteShort')}
								</span>
							</span>
							<Icon name="chevron-right" size={18} />
						</a>
						<button
							class="bm-remove"
							type="button"
							aria-label={`${$t('removeBookmark')}: ${exam.name}`}
							onclick={() => removeExam(exam.id)}
						>
							<Icon name="trash" size={18} />
						</button>
					</div>
				{/each}
			{/if}
		</section>

		<section class="bm-section">
			<header class="bm-head">
				<h2 class="bm-title">{$t('bookmarkedQuizPresets')}</h2>
				<span class="bm-count">{presets.length}</span>
			</header>
			{#if presets.length === 0}
				<p class="bm-empty">{$t('noBookmarkedQuizPresets')}</p>
			{:else}
				{#each presets as preset (preset.id)}
					<div class="bm-item">
						<div class="bm-row is-static">
							<span class="bm-main">
								<span class="bm-name">
									{preset.label || preset.topicSeed || $t('quizPractice')}
								</span>
								<span class="bm-meta">
									{preset.numQuestions || 10}
									{$t('questions')} · {preset.difficulty || $t('intermediate')}
								</span>
							</span>
						</div>
						<button
							class="bm-remove"
							type="button"
							aria-label={`${$t('removeBookmark')}: ${
								preset.label || preset.topicSeed || $t('quizPractice')
							}`}
							onclick={() => removePreset(preset.id)}
						>
							<Icon name="trash" size={18} />
						</button>
					</div>
				{/each}
			{/if}
		</section>
	</div>

	<section class="bm-section questions-section">
		<header class="bm-head">
			<h2 class="bm-title">{$t('bookmarkedQuestions')}</h2>
			<span class="bm-count">{questionBookmarks.length}</span>
		</header>
		{#if questionBookmarks.length === 0}
			<p class="bm-empty">{$t('noBookmarksYet')}</p>
		{:else}
			<div class="q-list">
				{#each questionBookmarks as bookmark (`${bookmark.question}-${bookmark.answer}`)}
					<article class="q-card">
						<div class="q-head">
							<span class="q-topic">{bookmark.topic || $t('quizPractice')}</span>
							<button
								class="bm-remove"
								type="button"
								aria-label={`${$t('removeBookmark')}: ${
									bookmark.topic || $t('quizPractice')
								}`}
								onclick={() => removeQuestionBookmark(bookmark)}
							>
								<Icon name="trash" size={18} />
							</button>
						</div>
						<div class="q-body">
							<MarkdownContent content={bookmark.question} />
						</div>
						<div class="q-answer">
							<span class="q-answer-label">{$t('correctAnswer')}</span>
							<MarkdownContent content={bookmark.answer} />
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</section>

<style>
	.page-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}

	.bookmark-grid {
		display: grid;
		gap: 16px;
	}

	.bm-section {
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		overflow: hidden;
	}

	.bm-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
	}

	.bm-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.bm-count {
		color: var(--text-muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.bm-empty {
		margin: 0;
		padding: 16px;
		color: var(--text-muted);
		font-size: 0.88rem;
	}

	.bm-item {
		display: flex;
		align-items: center;
	}

	.bm-item + .bm-item {
		border-top: 1px solid var(--line);
	}

	.bm-row {
		display: flex;
		min-width: 0;
		flex: 1 1 auto;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 4px 12px 16px;
		color: inherit;
		text-decoration: none;
	}

	.bm-row:not(.is-static):hover {
		background: var(--surface-muted);
	}

	.bm-row:focus-visible {
		outline-offset: -2px;
	}

	.bm-row > :global(svg) {
		flex: 0 0 auto;
		color: var(--text-muted);
	}

	.bm-main {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 2px;
	}

	.bm-name {
		font-weight: 600;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.bm-meta {
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.bm-remove {
		display: grid;
		width: 44px;
		height: 44px;
		flex: 0 0 auto;
		margin-right: 8px;
		place-items: center;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background var(--motion-fast) var(--ease-out),
			color var(--motion-fast) var(--ease-out);
	}

	.bm-remove:hover,
	.bm-remove:focus-visible {
		background: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
	}

	.questions-section {
		margin-top: 16px;
	}

	.q-list {
		display: grid;
		gap: 12px;
		padding: 16px;
	}

	.q-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.q-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.q-topic {
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 600;
	}

	.q-head .bm-remove {
		margin-right: -8px;
	}

	.q-body {
		line-height: 1.6;
		overflow-wrap: anywhere;
	}

	.q-answer {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--ok) 8%, transparent);
	}

	.q-answer-label {
		color: var(--ok);
		font-size: 0.75rem;
		font-weight: 700;
	}

	@media (min-width: 1024px) {
		.bookmark-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}

		.q-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
		}
	}
</style>
