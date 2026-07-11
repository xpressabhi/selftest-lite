<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import {
		getBookmarkedExamIds,
		getBookmarkedQuizPresets,
		getQuestionBookmarks,
		saveBookmarkedExamIds,
		saveBookmarkedQuizPresets,
		saveQuestionBookmarks,
	} from '$lib/client/storage';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import { getIndianExamById } from '$lib/data/indianExams';

	let examIds = $state([]);
	let presets = $state([]);
	let questionBookmarks = $state([]);

	let exams = $derived(
		examIds
			.map((examId) => getIndianExamById(examId))
			.filter((exam) => exam && typeof exam === 'object'),
	);

	onMount(() => {
		examIds = getBookmarkedExamIds();
		presets = getBookmarkedQuizPresets();
		questionBookmarks = getQuestionBookmarks();
	});

	function removeExam(examId) {
		if (!confirm($t('removeBookmarkConfirm'))) {
			return;
		}
		examIds = examIds.filter((id) => id !== examId);
		saveBookmarkedExamIds(examIds);
	}

	function removePreset(presetId) {
		if (!confirm($t('removeBookmarkConfirm'))) {
			return;
		}
		presets = presets.filter((preset) => preset.id !== presetId);
		saveBookmarkedQuizPresets(presets);
	}

	function removeQuestionBookmark(bookmark) {
		if (!confirm($t('removeBookmarkConfirm'))) {
			return;
		}
		questionBookmarks = questionBookmarks.filter(
			(item) => item.question !== bookmark.question || item.answer !== bookmark.answer,
		);
		saveQuestionBookmarks(questionBookmarks);
	}
</script>

<svelte:head>
	<title>{$t('bookmarks')} | selftest.in</title>
	<meta name="description" content="Open or manage saved selftest.in exams and quiz presets." />
</svelte:head>

<section class="container py-4">
	<div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
		<div>
			<h1 class="h3 fw-bold mb-1">{$t('bookmarks')}</h1>
			<p class="text-muted mb-0">{$t('useBookmarksOrChooseMode')}</p>
		</div>
		<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
	</div>

	<div class="row g-3">
		<section class="col-lg-6">
			<div class="bg-body border rounded-3 p-3 h-100">
				<h2 class="h5 fw-bold">{$t('bookmarkedExams')}</h2>
				{#if exams.length === 0}
					<p class="text-muted mb-0">{$t('noBookmarkedExams')}</p>
				{:else}
					<div class="list-group list-group-flush">
						{#each exams as exam (exam.id)}
							<div class="list-group-item px-0 d-flex align-items-center justify-content-between gap-3">
								<div>
									<div class="fw-semibold">{exam.name}</div>
									<div class="small text-muted">{exam.stream} · {exam.durationMinutes} {$t('minuteShort')}</div>
								</div>
								<div class="d-flex gap-2">
									<button class="btn btn-sm btn-outline-primary" type="button" onclick={() => goto(`/?exam=${exam.id}`)}>
										{$t('select')}
									</button>
									<button class="btn btn-sm btn-outline-danger" type="button" onclick={() => removeExam(exam.id)}>
										{$t('removeBookmark')}
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<section class="col-lg-6">
			<div class="bg-body border rounded-3 p-3 h-100">
				<h2 class="h5 fw-bold">{$t('bookmarkedQuizPresets')}</h2>
				{#if presets.length === 0}
					<p class="text-muted mb-0">{$t('noBookmarkedQuizPresets')}</p>
				{:else}
					<div class="list-group list-group-flush">
						{#each presets as preset (preset.id)}
							<div class="list-group-item px-0 d-flex align-items-center justify-content-between gap-3">
								<div>
									<div class="fw-semibold">{preset.label || preset.topicSeed || $t('quizPractice')}</div>
									<div class="small text-muted">
										{preset.numQuestions || 10} {$t('questions')} · {preset.difficulty || $t('intermediate')}
									</div>
								</div>
								<button class="btn btn-sm btn-outline-danger" type="button" onclick={() => removePreset(preset.id)}>
									{$t('removeBookmark')}
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>

	<section class="bg-body border rounded-3 p-3 mt-3">
		<h2 class="h5 fw-bold">{$t('bookmarkQuestion')}</h2>
		{#if questionBookmarks.length === 0}
			<p class="text-muted mb-0">{$t('noBookmarksYet')}</p>
		{:else}
			<div class="d-grid gap-3">
				{#each questionBookmarks as bookmark (`${bookmark.question}-${bookmark.answer}`)}
					<article class="border rounded-3 p-3">
						<div class="d-flex align-items-start justify-content-between gap-3">
							<div>
								<p class="small text-muted mb-1">{bookmark.topic || $t('quizPractice')}</p>
								<MarkdownContent content={bookmark.question} />
							</div>
							<button class="btn btn-sm btn-outline-danger" type="button" onclick={() => removeQuestionBookmark(bookmark)}>
								{$t('removeBookmark')}
							</button>
						</div>
						<p class="small text-success mt-2 mb-0">
							<strong>{$t('correctAnswer')}:</strong> {bookmark.answer}
						</p>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</section>
