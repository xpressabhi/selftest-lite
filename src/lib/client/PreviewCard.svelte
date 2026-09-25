<script>
	import { t } from '$lib/client/i18n';
	import Icon from '$lib/client/Icon.svelte';
	import { track } from '$lib/client/telemetry';
	import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';
	import {
		MAX_SEARCH_CHARS,
		MAX_TOPIC_CHARS,
		sanitizeInputText
	} from '$lib/shared/inputLimits';

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
		draft = false,
		checking = false,
		settling = false,
		density = 'full',
		changedFields = [],
		ongenerate = () => {},
		oneditchip = () => {},
		status = 'idle',
	} = $props();

	/** Which spec picker is open: 'difficulty' | 'format' | 'questions' | 'language' | 'exam'. */
	let openPicker = $state(null);
	let examPickerQuery = $state('');
	let cardRef = $state(null);

	let selectedExam = $derived(getIndianExamById(examId));

	const anyPickerOpen = $derived(openPicker !== null);

	const filteredPickerExams = $derived.by(() => {
		const query = examPickerQuery.trim().toLowerCase();
		if (!query) return OBJECTIVE_ONLY_EXAMS;
		return OBJECTIVE_ONLY_EXAMS.filter((exam) =>
			[exam.name, exam.stream, exam.group, ...(exam.syllabus || [])]
				.join(' ')
				.toLowerCase()
				.includes(query)
		);
	});

	$effect(() => {
		if (!anyPickerOpen || typeof document === 'undefined') return;
		const handlePointerDown = (event) => {
			if (cardRef && !cardRef.contains(event.target)) {
				dismissPickers();
			}
		};
		document.addEventListener('pointerdown', handlePointerDown);
		return () => document.removeEventListener('pointerdown', handlePointerDown);
	});

	const FORMATS = $derived.by(() => [
		{
			value: 'multiple-choice',
			label: $t('multipleChoice'),
			icon: 'chart',
			desc: $t('multipleChoice'),
		},
		{ value: 'true-false', label: $t('trueFalse'), icon: 'check', desc: $t('trueFalse') },
		{ value: 'coding', label: $t('codingProblems'), icon: 'code', desc: $t('codingProblems') },
		{
			value: 'speed-challenge',
			label: $t('speedChallenge'),
			icon: 'zap',
			desc: $t('speedChallenge'),
		},
		{
			value: 'matching',
			label: $t('matchingColumns'),
			icon: 'link',
			desc: $t('matchingColumns'),
		},
		{
			value: 'assertion-reasoning',
			label: $t('assertionReasoning'),
			icon: 'scale',
			desc: $t('assertionReasoning'),
		},
	]);

	const DIFFICULTIES = $derived.by(() => [
		{ value: 'beginner', label: $t('beginner'), icon: 'leaf' },
		{ value: 'intermediate', label: $t('intermediate'), icon: 'flame' },
		{ value: 'advanced', label: $t('advanced'), icon: 'gem' },
		{ value: 'expert', label: $t('expert'), icon: 'crown' },
	]);

	const DIFFICULTY_LABEL = $derived(
		Object.fromEntries(DIFFICULTIES.map((d) => [d.value, d.label]))
	);

	const FORMAT_LABEL = $derived(Object.fromEntries(FORMATS.map((f) => [f.value, f.label])));

	function handleGenerate() {
		closeAllPickers();
		ongenerate();
	}

	function pickDifficulty(d) {
		oneditchip('difficulty', d);
		openPicker = null;
	}

	function pickFormat(f) {
		oneditchip('testType', f);
		openPicker = null;
	}

	function pickQuestions(n) {
		// Matches the server cap (1..200) so full-length mocks are selectable.
		const clamped = Math.max(1, Math.min(200, Number(n) || 10));
		oneditchip('numQuestions', clamped);
		openPicker = null;
	}

	function pickLanguage(l) {
		oneditchip('language', l);
		openPicker = null;
	}

	function pickExam(eid) {
		oneditchip('examId', eid);
		openPicker = null;
	}

	function closeAllPickers() {
		openPicker = null;
		examPickerQuery = '';
	}

	/** Escape / outside click while a picker is open. */
	function dismissPickers() {
		if (anyPickerOpen) {
			track('preview:edit-toggle', { open: false });
		}
		closeAllPickers();
	}

	/** Parameter tiles toggle their picker; the event keeps plan-edit usage tracked. */
	function handlePickerClick(picker) {
		const wasOpen = openPicker === picker;
		closeAllPickers();
		if (wasOpen) {
			track('preview:edit-toggle', { open: false });
			return;
		}
		openPicker = picker;
		track('preview:edit-toggle', { open: true });
	}

	let editingTopic = $state(false);
	let topicDraft = $state('');
	let topicInputRef = $state(null);

	$effect(() => {
		if (editingTopic && topicInputRef) {
			topicInputRef.focus();
		}
	});

	function startTopicEdit() {
		topicDraft = topic;
		editingTopic = true;
	}

	function commitTopicEdit() {
		const nextTopic = topicDraft.trim();
		editingTopic = false;
		if (nextTopic && nextTopic !== topic) {
			oneditchip('topic', nextTopic);
		}
	}

	function cancelTopicEdit() {
		editingTopic = false;
	}

	function handleTopicKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitTopicEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelTopicEdit();
		}
	}

	const EMPTY = $derived(!topic && !parsingFailed);
	const GENERATING = $derived(status === 'loading');
	const showNote = $derived(!checking && !parsingFailed && parsed && !draft);
	const examSubline = $derived(
		selectedExam
			? `${selectedExam.name}${selectedExam.stream ? ` · ${selectedExam.stream}` : ''} · ${
					selectedExam.defaultNumQuestions || selectedExam.fullLengthQuestions
				} ${$t('questionShort')} · ${selectedExam.durationMinutes}${$t('minuteShort')}`
			: ''
	);
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		if (anyPickerOpen) {
			event.preventDefault();
			dismissPickers();
		} else if (editingTopic) {
			event.preventDefault();
			cancelTopicEdit();
		}
	}}
/>

<div
	class="preview-card"
	class:empty={EMPTY}
	class:parsing-failed={parsingFailed}
	class:settling
	class:tier-full={density === 'full'}
	class:tier-dense={density === 'dense'}
	class:tier-micro={density === 'micro'}
	bind:this={cardRef}
>
	<div class="preview-top">
		<span class="preview-eyebrow">{$t('yourTestPreview')}</span>
		{#if checking}
			<span class="status-pill is-checking">
				<span class="status-dot" aria-hidden="true"></span>
				{$t('plannerPreviewChecking')}
			</span>
		{:else if draft}
			<span class="status-pill is-draft">{$t('plannerPreviewDraft')}</span>
		{:else if parsed}
			<span class="status-pill is-ready">
				<svg class="status-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12.5l4.5 4.5L19 7.5"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{$t('previewStatusReady')}
			</span>
		{:else if parsingFailed}
			<span class="status-pill is-failed">
				<svg class="status-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 4.5L21 20H3L12 4.5z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
					<path
						d="M12 10v4.5M12 17.2v.3"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				{$t('previewStatusFailed')}
			</span>
		{/if}
	</div>

	{#if EMPTY}
		<div class="preview-empty">
			<span class="preview-empty-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linejoin="round"
					/>
					<path
						d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"
						fill="currentColor"
					/>
				</svg>
			</span>
			<p>{$t('previewEmptyHint')}</p>
		</div>
	{:else}
		<div class="preview-body">
			<div class="preview-topic-row">
				<div class="preview-topic-icon" aria-hidden="true">
					{#if isFullExam && selectedExam}
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M4 21h16M6 21V8l6-4 6 4v13"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linejoin="round"
							/>
							<path
								d="M9.5 21v-4h5v4"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linejoin="round"
							/>
							<path
								d="M9.5 11h1.5M13 11h1.5M9.5 14h1.5M13 14h1.5"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
							/>
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linejoin="round"
							/>
							<path
								d="M8 7.5h7M8 11h5"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
							/>
						</svg>
					{/if}
				</div>
				<div class="preview-topic-text">
					{#if editingTopic}
						<div class="topic-edit-row">
							<input
								class="topic-edit-input"
								bind:value={topicDraft}
								bind:this={topicInputRef}
								maxlength={MAX_TOPIC_CHARS}
								oninput={(event) =>
									(topicDraft = sanitizeInputText(
										event.currentTarget.value,
										MAX_TOPIC_CHARS
									))}
								onkeydown={handleTopicKeydown}
								aria-label={$t('plannerEditTopic')}
								autocomplete="off"
							/>
							<button
								class="topic-edit-apply"
								type="button"
								onclick={commitTopicEdit}
							>
								{$t('plannerApplyTopic')}
							</button>
						</div>
					{:else}
						<button
							class="preview-topic-main"
							type="button"
							onclick={startTopicEdit}
							title={$t('plannerEditTopic')}
							aria-label={`${$t('plannerEditTopic')}: ${topic || $t('untitledTest')}`}
						>
							<span class="preview-topic-label">{topic || $t('untitledTest')}</span>
							<svg
								class="topic-edit-icon"
								viewBox="0 0 24 24"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					{/if}
					{#if isFullExam && selectedExam}
						<div class="preview-topic-sub" title={examSubline}>
							{examSubline}
						</div>
					{/if}
					{#if parsingFailed}
						<p class="preview-note is-warning">{$t('intentParseFailed')}</p>
					{:else if settling}
						<p class="preview-note is-refining">{$t('plannerSettlingNote')}</p>
					{:else if showNote}
						<p class="preview-note">{$t('smartIntentParsed')}</p>
					{/if}
				</div>
			</div>

			<div class="preview-specs">
				<button
					class="spec-tile"
					class:active={openPicker === 'questions'}
					class:changed={changedFields.includes('numQuestions')}
					type="button"
					aria-expanded={openPicker === 'questions'}
					aria-controls="preview-picker-panel"
					aria-label={`${$t('previewQuestions')}: ${numQuestions}`}
					onclick={() => handlePickerClick('questions')}
				>
					<span class="spec-value">{numQuestions}</span>
					<span class="spec-label">
						{$t('previewQuestions')}
						<svg class="spec-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 9.5l6 6 6-6"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
				</button>

				<button
					class="spec-tile"
					class:active={openPicker === 'format'}
					class:changed={changedFields.includes('testType')}
					type="button"
					aria-expanded={openPicker === 'format'}
					aria-controls="preview-picker-panel"
					aria-label={`${$t('previewFormat')}: ${FORMAT_LABEL[testType] || testType}`}
					onclick={() => handlePickerClick('format')}
				>
					<span class="spec-value">{FORMAT_LABEL[testType] || testType}</span>
					<span class="spec-label">
						{$t('previewFormat')}
						<svg class="spec-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 9.5l6 6 6-6"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
				</button>

				<button
					class="spec-tile"
					class:active={openPicker === 'difficulty'}
					class:changed={changedFields.includes('difficulty')}
					type="button"
					aria-expanded={openPicker === 'difficulty'}
					aria-controls="preview-picker-panel"
					aria-label={`${$t('previewDifficulty')}: ${DIFFICULTY_LABEL[difficulty] || difficulty}`}
					onclick={() => handlePickerClick('difficulty')}
				>
					<span class="spec-value">{DIFFICULTY_LABEL[difficulty] || difficulty}</span>
					<span class="spec-label">
						{$t('previewDifficulty')}
						<svg class="spec-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 9.5l6 6 6-6"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
				</button>

				<button
					class="spec-tile"
					class:active={openPicker === 'language'}
					class:changed={changedFields.includes('language')}
					type="button"
					aria-expanded={openPicker === 'language'}
					aria-controls="preview-picker-panel"
					aria-label={`${$t('previewLanguage')}: ${
						language === 'hindi' ? $t('hindiLabel') : $t('englishLabel')
					}`}
					onclick={() => handlePickerClick('language')}
				>
					<span class="spec-value"
						>{language === 'hindi' ? $t('hindiLabel') : $t('englishLabel')}</span
					>
					<span class="spec-label">
						{$t('previewLanguage')}
						<svg class="spec-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 9.5l6 6 6-6"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
				</button>

				{#if isFullExam && selectedExam}
					<button
						class="spec-tile spec-tile-exam"
						class:active={openPicker === 'exam'}
						class:changed={changedFields.includes('examId')}
						type="button"
						aria-expanded={openPicker === 'exam'}
						aria-controls="preview-picker-panel"
						aria-label={`${$t('previewExam')}: ${selectedExam.name}`}
						onclick={() => handlePickerClick('exam')}
					>
						<span class="spec-value">{selectedExam.name}</span>
						<span class="spec-label">
							{$t('previewExam')}
							<svg
								class="spec-caret"
								viewBox="0 0 24 24"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M6 9.5l6 6 6-6"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
					</button>
				{/if}
			</div>

			{#if anyPickerOpen}
				<div class="picker-panel" id="preview-picker-panel">
					{#if openPicker === 'questions'}
						<div class="picker-block questions-picker">
							<div class="picker-stepper">
								<button
									type="button"
									class="stepper-btn"
									onclick={() => pickQuestions(numQuestions - 5)}
									aria-label={$t('fewerQuestions')}><Icon name="minus" size={18} /></button
								>
								<span class="stepper-value">{numQuestions}</span>
								<button
									type="button"
									class="stepper-btn"
									onclick={() => pickQuestions(numQuestions + 5)}
									aria-label={$t('moreQuestions')}><Icon name="plus" size={18} /></button
								>
							</div>
							<div class="picker-presets">
								{#each [5, 10, 15, 20, 25, 30] as n (n)}
									<button
										class="preset-btn"
										class:active={numQuestions === n}
										type="button"
										onclick={() => pickQuestions(n)}
									>
										{n}
									</button>
								{/each}
								{#if isFullExam && (selectedExam?.fullLengthQuestions || 0) > 30}
									<button
										class="preset-btn preset-full"
										class:active={numQuestions ===
											Math.min(selectedExam.fullLengthQuestions, 200)}
										type="button"
										onclick={() =>
											pickQuestions(Math.min(selectedExam.fullLengthQuestions, 200))}
									>
										{Math.min(selectedExam.fullLengthQuestions, 200)}
									</button>
								{/if}
							</div>
						</div>
					{/if}

					{#if openPicker === 'format'}
						<div class="picker-options format-picker">
							{#each FORMATS as f (f.value)}
								<button
									class="picker-option"
									class:selected={testType === f.value}
									type="button"
									aria-pressed={testType === f.value}
									onclick={() => pickFormat(f.value)}
								>
									<span class="picker-emoji" aria-hidden="true">
										<Icon name={f.icon} size={18} />
									</span>
									<span class="picker-label">{f.label}</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if openPicker === 'difficulty'}
						<div class="picker-options difficulty-picker">
							{#each DIFFICULTIES as d (d.value)}
								<button
									class="picker-option"
									class:selected={difficulty === d.value}
									type="button"
									aria-pressed={difficulty === d.value}
									onclick={() => pickDifficulty(d.value)}
								>
									<span class="picker-emoji" aria-hidden="true">
										<Icon name={d.icon} size={18} />
									</span>
									<span class="picker-label">{d.label}</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if openPicker === 'language'}
						<div class="picker-options language-picker">
							<button
								class="picker-option"
								class:selected={language === 'english'}
								type="button"
								aria-pressed={language === 'english'}
								onclick={() => pickLanguage('english')}
							>
								<span class="picker-emoji" aria-hidden="true">
									<Icon name="globe" size={18} />
								</span>
								<span class="picker-label">{$t('englishLabel')}</span>
							</button>
							<button
								class="picker-option"
								class:selected={language === 'hindi'}
								type="button"
								aria-pressed={language === 'hindi'}
								onclick={() => pickLanguage('hindi')}
							>
								<span class="picker-emoji" aria-hidden="true">
									<Icon name="globe" size={18} />
								</span>
								<span class="picker-label">{$t('hindiLabel')}</span>
							</button>
						</div>
					{/if}

					{#if openPicker === 'exam'}
						<div class="picker-block exam-picker">
							<input
								class="exam-picker-search"
								type="search"
								name="examSearch"
								autocomplete="off"
								spellcheck="false"
								maxlength={MAX_SEARCH_CHARS}
								oninput={(event) =>
									(examPickerQuery = sanitizeInputText(
										event.currentTarget.value,
										MAX_SEARCH_CHARS
									))}
								placeholder={$t('profileWizardSearchExam')}
								aria-label={$t('profileWizardSearchExam')}
								bind:value={examPickerQuery}
							/>
							<div class="exam-picker-list">
								{#each filteredPickerExams as exam (exam.id)}
									<button
										class="exam-picker-row"
										class:selected={examId === exam.id}
										type="button"
										aria-pressed={examId === exam.id}
										onclick={() => pickExam(exam.id)}
									>
										<span class="exam-picker-name">{exam.name}</span>
										<span class="exam-picker-meta">{exam.stream || ''}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="preview-footer">
			<button
				class="generate-btn"
				disabled={GENERATING || !topic || checking}
				onclick={handleGenerate}
				type="button"
			>
				{#if GENERATING}
					<span class="thinking-dots" role="status" aria-label={$t('generating')}>
						<span></span><span></span><span></span>
					</span>
				{:else}
					<span>{$t('previewGenerate')}</span>
					<span class="generate-time">{$t('previewGeneratingTime')}</span>
				{/if}
			</button>
		</div>
		<p class="preview-reassurance">{$t('previewReassurance')}</p>
	{/if}
</div>

<style>
	.preview-card {
		position: relative;
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		padding: 14px 14px 12px;
		transition: border-color 0.2s ease;
	}

	@media (min-width: 480px) {
		.preview-card {
			padding: 18px 20px 14px;
		}
	}

	.preview-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 12px;
	}

	.preview-eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid transparent;
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.status-icon {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	.status-pill.is-draft {
		background: var(--surface-muted);
		border-color: var(--line);
		color: var(--text-muted);
	}

	.status-pill.is-checking {
		background: rgba(var(--brand-rgb), 0.08);
		color: rgb(var(--brand-text-rgb));
	}

	.status-pill.is-ready {
		background: color-mix(in srgb, var(--ok) 12%, transparent);
		color: var(--ok);
	}

	.status-pill.is-failed {
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 16px 8px 8px;
		text-align: center;
	}

	.preview-empty-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-surface);
		background: rgba(var(--brand-rgb), 0.08);
		color: rgb(var(--brand-text-rgb));
	}

	.preview-empty-icon svg {
		width: 22px;
		height: 22px;
	}

	.preview-empty p {
		margin: 0;
		max-width: 34ch;
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text-muted);
	}

	.preview-topic-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.preview-topic-icon {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-surface);
		background: rgba(var(--brand-rgb), 0.08);
		color: rgb(var(--brand-text-rgb));
	}

	.preview-topic-icon svg {
		width: 20px;
		height: 20px;
	}

	.preview-topic-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.preview-topic-main {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		max-width: 100%;
		min-height: 44px;
		padding: 4px 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: 1.02rem;
		font-weight: 700;
		line-height: 1.25;
		text-align: left;
		cursor: pointer;
	}

	.preview-topic-label {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.topic-edit-icon {
		flex-shrink: 0;
		width: 13px;
		height: 13px;
		opacity: 0.4;
		transition: opacity 0.15s ease;
	}

	.preview-topic-main:hover .topic-edit-icon,
	.preview-topic-main:focus-visible .topic-edit-icon {
		opacity: 0.85;
	}

	.preview-topic-sub {
		font-size: 0.76rem;
		line-height: 1.35;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview-note {
		margin: 2px 0 0;
		font-size: 0.74rem;
		line-height: 1.4;
		color: var(--text-muted);
	}

	.preview-note.is-warning {
		color: var(--warn);
	}

	.topic-edit-row {
		display: flex;
		gap: 6px;
	}

	.topic-edit-input {
		flex: 1;
		min-width: 0;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface-muted);
		color: var(--text);
		/* 16px keeps iOS Safari from zooming the page when the field is focused. */
		font-size: 1rem;
	}

	.topic-edit-input:focus-visible {
		outline: 2px solid var(--brand-text);
		outline-offset: 1px;
	}

	.topic-edit-apply {
		flex-shrink: 0;
		min-height: 44px;
		padding: 0 14px;
		border: 0;
		border-radius: var(--radius-control);
		background: rgb(var(--brand-rgb));
		color: var(--on-brand);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}

	.preview-specs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 14px;
	}

	@media (min-width: 560px) {
		.preview-specs {
			grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
		}
	}

	.spec-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		min-height: 58px;
		padding: 9px 11px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface-muted);
		color: var(--text);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			transform 0.1s ease;
	}

	.spec-tile:hover {
		border-color: rgba(var(--brand-rgb), 0.5);
	}

	.spec-tile:active {
		transform: scale(0.985);
	}

	.spec-tile.active {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.06);
	}

	.spec-value {
		font-size: 0.86rem;
		font-weight: 700;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.spec-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.spec-caret {
		width: 10px;
		height: 10px;
		opacity: 0.55;
		transition: transform 0.15s ease;
	}

	.spec-tile.active .spec-caret {
		transform: rotate(180deg);
	}

	.spec-tile.active .spec-label {
		color: rgb(var(--brand-text-rgb));
	}

	.spec-tile-exam {
		grid-column: 1 / -1;
	}

	@media (min-width: 560px) {
		.spec-tile-exam {
			grid-column: auto;
		}
	}

	.picker-panel {
		margin-top: 10px;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
		animation: picker-in 0.14s ease;
	}

	@keyframes picker-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.picker-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.picker-options {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.picker-option {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 7px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			color 0.15s ease;
	}

	.picker-option:hover {
		border-color: rgba(var(--brand-rgb), 0.45);
	}

	.picker-option.selected {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.07);
		color: rgb(var(--brand-text-rgb));
	}

	.picker-emoji {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.picker-option.selected .picker-emoji {
		color: rgb(var(--brand-text-rgb));
	}

	.picker-label {
		white-space: nowrap;
	}

	.picker-stepper {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.stepper-btn {
		width: 44px;
		height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}

	.stepper-btn:hover {
		border-color: rgb(var(--brand-rgb));
		color: rgb(var(--brand-text-rgb));
	}

	.stepper-value {
		min-width: 2.4ch;
		text-align: center;
		font-size: 1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.picker-presets {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 6px;
	}

	.preset-btn {
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.preset-btn:hover {
		border-color: rgba(var(--brand-rgb), 0.45);
	}

	.preset-btn.active {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.07);
		color: rgb(var(--brand-text-rgb));
	}

	.exam-picker-search {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		/* 16px keeps iOS Safari from zooming the page when the field is focused. */
		font-size: 1rem;
	}

	.exam-picker-search:focus-visible {
		outline: 2px solid var(--brand-text);
		outline-offset: 1px;
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
		flex: 1 0 auto;
		flex-direction: column;
		gap: 2px;
		min-width: 160px;
		min-height: 44px;
		padding: 8px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font-size: 0.82rem;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.exam-picker-row:hover {
		border-color: rgba(var(--brand-rgb), 0.45);
	}

	.exam-picker-row.selected {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.07);
	}

	.exam-picker-name {
		font-weight: 700;
	}

	.exam-picker-meta {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.preview-footer {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}

	.generate-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 16px;
		border: 0;
		border-radius: var(--radius-control);
		background: rgb(var(--brand-rgb));
		color: var(--on-brand);
		font-size: 0.92rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.2s ease,
			transform 0.15s ease,
			opacity 0.15s ease;
	}

	.generate-btn:hover:not(:disabled) {
		background: rgba(var(--brand-rgb), 0.88);
	}

	.generate-btn:active:not(:disabled) {
		transform: scale(0.985);
	}

	.generate-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.generate-time {
		font-size: 0.72rem;
		font-weight: 600;
		opacity: 0.8;
	}

	.preview-reassurance {
		margin: 8px 0 0;
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.thinking-dots {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.thinking-dots span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--on-brand);
		animation: thinking-bounce 1.2s ease-in-out infinite;
	}

	.thinking-dots span:nth-child(2) {
		animation-delay: 0.15s;
	}

	.thinking-dots span:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes thinking-bounce {
		0%,
		60%,
		100% {
			opacity: 0.35;
			transform: translateY(0);
		}
		30% {
			opacity: 1;
			transform: translateY(-3px);
		}
	}

	:global(html.data-saver) .thinking-dots span {
		animation: none;
		opacity: 0.7;
	}

	/* --- Settling (calm preview) --- */
	.preview-card.settling {
		border-style: dashed;
	}

	.preview-note.is-refining {
		color: rgb(var(--brand-text-rgb));
	}

	.spec-tile.changed {
		animation: tile-commit 600ms ease;
	}

	@keyframes tile-commit {
		0% {
			background: rgba(var(--brand-rgb), 0.16);
			border-color: rgb(var(--brand-rgb));
		}
		100% {
			background: var(--surface-muted);
			border-color: var(--line);
		}
	}

	:global(html.data-saver) .spec-tile.changed,
	:global(html.reduce-motion) .spec-tile.changed {
		animation: none;
	}

	/* --- Keyboard tiers: all four tiles stay, only the density changes. --- */
	.preview-card.tier-dense {
		padding: 10px 11px 9px;
		border-radius: var(--radius-overlay);
	}

	.preview-card.tier-dense .preview-top {
		margin-bottom: 7px;
	}

	.preview-card.tier-dense .preview-topic-icon {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-control);
	}

	.preview-card.tier-dense .preview-topic-icon svg {
		width: 17px;
		height: 17px;
	}

	.preview-card.tier-dense .preview-topic-main {
		font-size: 0.96rem;
	}

	.preview-card.tier-dense .preview-note {
		font-size: 0.7rem;
	}

	.preview-card.tier-dense .preview-specs {
		gap: 6px;
		margin-top: 9px;
	}

	.preview-card.tier-dense .spec-tile {
		min-height: 44px;
		padding: 6px 9px;
		border-radius: var(--radius-control);
	}

	.preview-card.tier-dense .spec-value {
		font-size: 0.78rem;
	}

	.preview-card.tier-dense .preview-footer {
		margin-top: 9px;
	}

	.preview-card.tier-dense .preview-reassurance,
	.preview-card.tier-micro .preview-reassurance {
		display: none;
	}

	.preview-card.tier-micro {
		padding: 8px 9px 8px;
		border-radius: var(--radius-overlay);
	}

	.preview-card.tier-micro .preview-topic-icon {
		display: none;
	}

	.preview-card.tier-micro .preview-topic-main {
		font-size: 0.92rem;
	}

	.preview-card.tier-micro .preview-specs {
		gap: 5px;
		margin-top: 8px;
	}

	.preview-card.tier-micro .spec-tile {
		min-height: 44px;
		padding: 5px 8px;
		border-radius: var(--radius-control);
	}

	.preview-card.tier-micro .spec-value {
		font-size: 0.74rem;
	}

	.preview-card.tier-micro .spec-label {
		display: none;
	}

	.preview-card.tier-micro .preview-footer {
		margin-top: 8px;
	}

	.preview-card.tier-micro .generate-time {
		display: none;
	}
</style>
