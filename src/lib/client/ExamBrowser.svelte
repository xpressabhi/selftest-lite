<script>
	import { t } from '$lib/client/i18n';
	let {
		examSearchQuery = '',
		examGroupFilter = 'all',
		showBookmarkedExamsOnly = false,
		bookmarkedExamIds = [],
		selectedExamId = '',
		onexamchange = () => {},
		onbookmarktoggle = () => {},
		visibleExams = [],
	} = $props();

	let expanded = $state(false);

	const EXAM_GROUP_FILTERS = ['all', 'A', 'B', 'C', 'D'];
	const DISPLAY_EXAMS = $derived(visibleExams.slice(0, 24));

	function selectExam(examId) {
		onexamchange('examId', examId);
	}

	function toggleBookmark(examId) {
		onbookmarktoggle(examId);
	}
</script>

<div class="exam-browser">
	<button class="browser-toggle" type="button" onclick={() => (expanded = !expanded)}>
		<span class="toggle-icon" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
		<span class="toggle-label">{$t('browseAllExams')}</span>
		{#if selectedExamId}
			<span class="toggle-count">✓ {$t('examSelected')}</span>
		{/if}
	</button>

	{#if expanded}
		<div class="browser-body">
			<div class="exam-filters">
				<input
					class="exam-search-input"
					type="text"
					value={examSearchQuery}
					oninput={(e) => onexamchange('examSearchQuery', e.target.value)}
					placeholder={$t('searchExamStreamSyllabus')}
				/>
				<select
					class="exam-group-select"
					value={examGroupFilter}
					onchange={(e) => onexamchange('examGroupFilter', e.target.value)}
				>
					{#each EXAM_GROUP_FILTERS as group (group)}
						<option value={group}>
							{group === 'all' ? $t('allGroups') : `${$t('group')} ${group}`}
						</option>
					{/each}
				</select>
				<label class="bookmark-filter">
					<input
						type="checkbox"
						checked={showBookmarkedExamsOnly}
						onchange={(e) => onexamchange('showBookmarkedExamsOnly', e.target.checked)}
					/>
					<span>{$t('bookmarkedOnly')}</span>
				</label>
			</div>

			<div class="exam-list">
				{#each DISPLAY_EXAMS as exam (exam.id)}
					<div
						class="exam-row"
						class:selected={selectedExamId === exam.id}
						role="button"
						tabindex="0"
						onclick={() => selectExam(exam.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectExam(exam.id);
							}
						}}
					>
						<div class="exam-info">
							<span class="exam-name">{exam.name}</span>
							<span class="exam-meta">
								{exam.stream || ''} · {$t('questionShort')}
								{exam.defaultNumQuestions || exam.fullLengthQuestions} · {exam.durationMinutes}{$t(
									'minuteShort'
								)}
							</span>
						</div>
						<button
							class="exam-bookmark-btn"
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								toggleBookmark(exam.id);
							}}
							aria-label={$t('bookmarkExam')}
						>
							{bookmarkedExamIds.includes(exam.id) ? '★' : '☆'}
						</button>
					</div>
				{/each}
				{#if DISPLAY_EXAMS.length === 0}
					<p class="exam-empty">{$t('noTestsFound')}</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.exam-browser {
		margin-top: 8px;
	}

	.browser-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 0;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s ease;
		min-height: 44px;
	}

	.browser-toggle:hover {
		color: var(--text);
	}

	.toggle-icon {
		font-size: 0.8rem;
		width: 16px;
		text-align: center;
	}

	.toggle-count {
		font-size: 0.72rem;
		color: rgb(var(--brand-rgb));
		margin-left: auto;
	}

	.browser-body {
		animation: slide-in 0.2s ease;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.exam-filters {
		display: flex;
		gap: 8px;
		margin-bottom: 10px;
		flex-wrap: wrap;
		align-items: center;
	}

	.exam-search-input {
		flex: 1;
		min-width: 160px;
		padding: 10px 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		font-size: 16px;
		min-height: 44px;
	}

	.exam-search-input::placeholder {
		color: var(--text-muted);
	}

	.exam-group-select {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		font-size: 16px;
		min-height: 44px;
	}

	.bookmark-filter {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
	}

	.exam-list {
		max-height: 320px;
		overflow-y: auto;
		border: 1px solid var(--line);
		border-radius: 12px;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}

	.exam-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: transparent;
		width: 100%;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s ease;
		min-height: 52px;
	}

	.exam-row:last-child {
		border-bottom: 0;
	}

	.exam-row:hover {
		background: var(--surface-muted);
	}

	.exam-row.selected {
		background: rgba(var(--brand-rgb), 0.08);
	}

	.exam-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 12px;
	}

	.exam-name {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.exam-meta {
		font-size: 0.72rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.exam-bookmark-btn {
		border: 0;
		background: transparent;
		color: inherit;
		font-size: 1.2rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 52px;
	}

	.exam-empty {
		padding: 16px;
		text-align: center;
		font-size: 0.82rem;
		color: var(--text-muted);
		margin: 0;
	}
</style>
