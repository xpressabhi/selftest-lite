<script>
	import { t } from '$lib/client/i18n';
	import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';

	let {
		topic = '',
		numQuestions = 10,
		testType = 'multiple-choice',
		difficulty = 'intermediate',
		language = 'english',
		examId = '',
		isFullExam = false,
		parsed = false,
		parsingFailed = false,
		ongenerate = () => {},
		oneditchip = () => {},
		status = 'idle',
	} = $props();

	let showDifficultyPicker = $state(false);
	let showFormatPicker = $state(false);
	let showQuestionsPicker = $state(false);
	let showLanguagePicker = $state(false);
	let showExamPicker = $state(false);

	let selectedExam = $derived(getIndianExamById(examId));

	const FORMATS = [
		{ value: 'multiple-choice', label: $t('multipleChoice'), icon: '📊', desc: $t('multipleChoice') },
		{ value: 'true-false', label: $t('trueFalse'), icon: '✅', desc: $t('trueFalse') },
		{ value: 'coding', label: $t('codingProblems'), icon: '💻', desc: $t('codingProblems') },
		{ value: 'speed-challenge', label: $t('speedChallenge'), icon: '⚡', desc: $t('speedChallenge') },
	];

	const DIFFICULTIES = [
		{ value: 'beginner', label: $t('beginner'), emoji: '🌱' },
		{ value: 'intermediate', label: $t('intermediate'), emoji: '🔥' },
		{ value: 'advanced', label: $t('advanced'), emoji: '💎' },
		{ value: 'expert', label: $t('expert'), emoji: '👑' },
	];

	const DIFFICULTY_ICON = Object.fromEntries(DIFFICULTIES.map(d => [d.value, d.emoji]));
	const DIFFICULTY_LABEL = Object.fromEntries(DIFFICULTIES.map(d => [d.value, d.label]));

	const FORMAT_ICON = Object.fromEntries(FORMATS.map(f => [f.value, f.icon]));
	const FORMAT_LABEL = Object.fromEntries(FORMATS.map(f => [f.value, f.label]));

	function handleGenerate() {
		showDifficultyPicker = false;
		showFormatPicker = false;
		showQuestionsPicker = false;
		showLanguagePicker = false;
		ongenerate();
	}

	function pickDifficulty(d) {
		oneditchip('difficulty', d);
		showDifficultyPicker = false;
	}

	function pickFormat(f) {
		oneditchip('testType', f);
		showFormatPicker = false;
	}

	function pickQuestions(n) {
		const clamped = Math.max(1, Math.min(50, Number(n) || 10));
		oneditchip('numQuestions', clamped);
		showQuestionsPicker = false;
	}

	function pickLanguage(l) {
		oneditchip('language', l);
		showLanguagePicker = false;
	}

	function pickExam(eid) {
		oneditchip('examId', eid);
		showExamPicker = false;
	}

	function closeAllPickers() {
		showDifficultyPicker = false;
		showFormatPicker = false;
		showQuestionsPicker = false;
		showLanguagePicker = false;
		showExamPicker = false;
	}

	function handlePickerClick(picker) {
		closeAllPickers();
		if (picker === 'difficulty') showDifficultyPicker = true;
		if (picker === 'format') showFormatPicker = true;
		if (picker === 'questions') showQuestionsPicker = true;
		if (picker === 'language') showLanguagePicker = true;
		if (picker === 'exam') showExamPicker = true;
	}

	function handleChipKeydown(e, picker) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handlePickerClick(picker);
		}
	}

	function handleOptionKeydown(e, action) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			action();
		}
	}

	const EMPTY = $derived(!topic && !parsingFailed);
	const GENERATING = $derived(status === 'loading');
</script>

<div class="preview-card" class:empty={EMPTY} class:parsing-failed={parsingFailed}>
	<div class="preview-header">
		<h2 class="preview-title">{$t('yourTestPreview')}</h2>
		{#if parsed}
			<span class="preview-badge parsed">{$t('smartIntentParsed')}</span>
		{:else if parsingFailed}
			<span class="preview-badge failed">{$t('intentParseFailed')}</span>
		{/if}
	</div>

	{#if EMPTY}
		<div class="preview-empty">
			<span class="preview-empty-icon">✨</span>
			<p>{$t('previewEmptyHint')}</p>
		</div>
	{:else}
		<div class="preview-body">
			<div class="preview-topic-row">
				<div class="preview-topic-icon" aria-hidden="true">
					{isFullExam && selectedExam ? '🏛️' : '📚'}
				</div>
				<div class="preview-topic-text">
					<div class="preview-topic-main">{topic || $t('untitledTest')}</div>
					{#if selectedExam}
						<div class="preview-topic-sub">
							{selectedExam.stream || ''} · {$t('questionShort')} {selectedExam.defaultNumQuestions || selectedExam.fullLengthQuestions} · {selectedExam.durationMinutes}{$t('minuteShort')}
						</div>
					{/if}
				</div>
			</div>

			<div class="preview-chips">
				<button
					class="preview-chip chip-questions"
					class:active={showQuestionsPicker}
					onclick={() => handlePickerClick('questions')}
					onkeydown={(e) => handleChipKeydown(e, 'questions')}
					type="button"
					aria-label={$t('previewQuestions')}
				>
					<span class="chip-icon">📝</span>
					<span class="chip-label">{numQuestions} {$t('qsShort')}</span>
				</button>

				<button
					class="preview-chip chip-format"
					class:active={showFormatPicker}
					onclick={() => handlePickerClick('format')}
					onkeydown={(e) => handleChipKeydown(e, 'format')}
					type="button"
					aria-label={$t('previewFormat')}
				>
					<span class="chip-icon">{FORMAT_ICON[testType] || '📊'}</span>
					<span class="chip-label">{FORMAT_LABEL[testType] || testType}</span>
				</button>

				<button
					class="preview-chip chip-difficulty"
					class:active={showDifficultyPicker}
					onclick={() => handlePickerClick('difficulty')}
					onkeydown={(e) => handleChipKeydown(e, 'difficulty')}
					type="button"
					aria-label={$t('previewDifficulty')}
				>
					<span class="chip-icon">{DIFFICULTY_ICON[difficulty] || '🔥'}</span>
					<span class="chip-label">{DIFFICULTY_LABEL[difficulty] || difficulty}</span>
				</button>

				<button
					class="preview-chip chip-language"
					class:active={showLanguagePicker}
					onclick={() => handlePickerClick('language')}
					onkeydown={(e) => handleChipKeydown(e, 'language')}
					type="button"
					aria-label={$t('previewLanguage')}
				>
					<span class="chip-icon">{language === 'hindi' ? '🇮🇳' : '🇬🇧'}</span>
					<span class="chip-label">{language === 'hindi' ? $t('hindiLabel') : $t('englishLabel')}</span>
				</button>

				{#if isFullExam && selectedExam}
					<button
						class="preview-chip chip-exam"
						class:active={showExamPicker}
						onclick={() => handlePickerClick('exam')}
						onkeydown={(e) => handleChipKeydown(e, 'exam')}
						type="button"
						aria-label={$t('previewExam')}
					>
						<span class="chip-icon">🎯</span>
						<span class="chip-label">{selectedExam.name}</span>
					</button>
				{/if}
			</div>
		</div>

		{#if showDifficultyPicker}
			<div class="chip-picker difficulty-picker">
				{#each DIFFICULTIES as d (d.value)}
					<button
						class="picker-option"
						class:selected={difficulty === d.value}
						type="button"
						onclick={() => pickDifficulty(d.value)}
						onkeydown={(e) => handleOptionKeydown(e, () => pickDifficulty(d.value))}
					>
						<span class="picker-emoji">{d.emoji}</span>
						<span class="picker-label">{d.label}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if showFormatPicker}
			<div class="chip-picker format-picker">
				{#each FORMATS as f (f.value)}
					<button
						class="picker-option"
						class:selected={testType === f.value}
						type="button"
						onclick={() => pickFormat(f.value)}
						onkeydown={(e) => handleOptionKeydown(e, () => pickFormat(f.value))}
					>
						<span class="picker-emoji">{f.icon}</span>
						<span class="picker-label">{f.label}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if showQuestionsPicker}
			<div class="chip-picker questions-picker">
				<div class="picker-stepper">
					<button type="button" class="stepper-btn" onclick={() => pickQuestions(numQuestions - 5)} aria-label="Fewer questions">−</button>
					<span class="stepper-value">{numQuestions}</span>
					<button type="button" class="stepper-btn" onclick={() => pickQuestions(numQuestions + 5)} aria-label="More questions">+</button>
				</div>
				<div class="picker-presets">
					{#each [5, 10, 15, 20, 25, 30] as n (n)}
						<button
							class="preset-btn"
							class:active={numQuestions === n}
							type="button"
							onclick={() => pickQuestions(n)}
							onkeydown={(e) => handleOptionKeydown(e, () => pickQuestions(n))}
						>
							{n}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if showLanguagePicker}
			<div class="chip-picker language-picker">
				<button
					class="picker-option"
					class:selected={language === 'english'}
					type="button"
					onclick={() => pickLanguage('english')}
					onkeydown={(e) => handleOptionKeydown(e, () => pickLanguage('english'))}
				>
					<span class="picker-emoji">🇬🇧</span>
					<span class="picker-label">{$t('englishLabel')}</span>
				</button>
				<button
					class="picker-option"
					class:selected={language === 'hindi'}
					type="button"
					onclick={() => pickLanguage('hindi')}
					onkeydown={(e) => handleOptionKeydown(e, () => pickLanguage('hindi'))}
				>
					<span class="picker-emoji">🇮🇳</span>
					<span class="picker-label">{$t('hindiLabel')}</span>
				</button>
			</div>
		{/if}

		{#if showExamPicker}
			<div class="chip-picker exam-picker">
				<div class="exam-picker-list">
					{#each OBJECTIVE_ONLY_EXAMS.slice(0, 20) as exam (exam.id)}
						<button
							class="exam-picker-row"
							class:selected={examId === exam.id}
							type="button"
							onclick={() => pickExam(exam.id)}
							onkeydown={(e) => handleOptionKeydown(e, () => pickExam(exam.id))}
						>
							<span class="exam-picker-name">{exam.name}</span>
							<span class="exam-picker-meta">{exam.stream || ''}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	<div class="preview-footer">
		<button
			class="generate-btn"
			class:ai-shimmer={GENERATING}
			disabled={GENERATING || (!topic && !parsingFailed)}
			onclick={handleGenerate}
			type="button"
		>
			{#if GENERATING}
				<span class="thinking-dots" aria-label={$t('generating')}>
					<span></span><span></span><span></span>
				</span>
			{:else}
				{$t('previewGenerate')}
				<span class="generate-time">{$t('previewGeneratingTime')}</span>
			{/if}
		</button>
		{#if !EMPTY}
			<p class="preview-reassurance">{$t('previewReassurance')}</p>
		{/if}
	</div>
</div>

<style>
	.preview-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 20px 24px;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
		position: relative;
		overflow: hidden;
	}

	.preview-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.3));
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.preview-card:not(.empty)::before {
		opacity: 1;
	}

	.preview-card:not(.empty):hover {
		border-color: rgba(var(--brand-rgb), 0.3);
	}

	.preview-card.empty {
		text-align: center;
		padding: 32px 24px;
	}

	.preview-card.parsing-failed::before {
		background: linear-gradient(90deg, #f59e0b, rgba(245, 158, 11, 0.3));
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.preview-title {
		font-size: 0.85rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin: 0;
	}

	.preview-badge {
		font-size: 0.72rem;
		padding: 3px 10px;
		border-radius: 8px;
		font-weight: 600;
	}

	.preview-badge.parsed {
		background: rgba(var(--brand-rgb), 0.1);
		color: rgb(var(--brand-rgb));
	}

	.preview-badge.failed {
		background: rgba(245, 158, 11, 0.1);
		color: #b45309;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px 0;
	}

	.preview-empty-icon {
		font-size: 2rem;
		opacity: 0.5;
	}

	.preview-empty p {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.preview-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.preview-topic-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.preview-topic-icon {
		font-size: 1.5rem;
		line-height: 1;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.preview-topic-text {
		min-width: 0;
	}

	.preview-topic-main {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1.4;
		word-break: break-word;
	}

	.preview-topic-sub {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.preview-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		position: relative;
	}

	.preview-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;
		min-height: 44px;
	}

	.preview-chip:hover {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.04);
		transform: translateY(-1px);
	}

	.preview-chip.active {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.08);
		box-shadow: 0 0 0 2px rgba(var(--brand-rgb), 0.15);
	}

	.chip-icon {
		font-size: 0.95rem;
		line-height: 1;
	}

	.chip-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
	}

	.chip-picker {
		padding: 12px 0 4px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		animation: slide-down 0.2s ease;
	}

	@keyframes slide-down {
		from { opacity: 0; transform: translateY(-6px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.picker-option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
		min-height: 44px;
	}

	.picker-option:hover {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.04);
	}

	.picker-option.selected {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.1);
		color: rgb(var(--brand-rgb));
		font-weight: 600;
	}

	.picker-emoji {
		font-size: 1.1rem;
		line-height: 1;
	}

	.picker-stepper {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 0;
	}

	.stepper-btn {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		font-size: 1.3rem;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.stepper-btn:hover {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.06);
	}

	.stepper-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		min-width: 40px;
		text-align: center;
	}

	.picker-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.preset-btn {
		padding: 8px 16px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
		min-height: 44px;
		min-width: 44px;
	}

	.preset-btn:hover {
		border-color: rgb(var(--brand-rgb));
		color: rgb(var(--brand-rgb));
	}

	.preset-btn.active {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.1);
		color: rgb(var(--brand-rgb));
		font-weight: 600;
	}

	.questions-picker {
		flex-direction: column;
	}

	.exam-picker-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		max-height: 200px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.exam-picker-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		font-size: 0.82rem;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s ease, background 0.15s ease;
		min-height: 44px;
		flex: 1 0 auto;
		min-width: 160px;
	}

	.exam-picker-row:hover {
		border-color: rgb(var(--brand-rgb));
	}

	.exam-picker-row.selected {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.08);
	}

	.exam-picker-name {
		font-weight: 600;
	}

	.exam-picker-meta {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.preview-footer {
		margin-top: 18px;
		text-align: center;
	}

	.generate-btn {
		width: 100%;
		padding: 14px 24px;
		border-radius: 14px;
		border: 0;
		background: rgb(var(--brand-rgb));
		color: #fff;
		font-size: 1.05rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		transition: background 0.2s ease, transform 0.12s ease, opacity 0.15s ease;
		min-height: 52px;
	}

	.generate-btn:hover:not(:disabled) {
		background: rgba(var(--brand-rgb), 0.88);
		transform: translateY(-1px);
	}

	.generate-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.generate-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.generate-time {
		font-size: 0.75rem;
		font-weight: 400;
		opacity: 0.7;
	}

	.preview-reassurance {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 8px 0 0;
	}

	@media (max-width: 480px) {
		.preview-card {
			padding: 16px 16px;
		}

		.preview-card.empty {
			padding: 24px 16px;
		}

		.chip-label {
			max-width: 100px;
		}

		.preview-chips {
			gap: 6px;
		}

		.preview-chip {
			padding: 6px 10px;
		}
	}
</style>
