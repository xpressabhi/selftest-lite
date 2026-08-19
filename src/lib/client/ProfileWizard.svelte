<script>
	import { t } from './i18n';
	import { saveProfile } from './profile';
	import { track } from './telemetry';
	import { INDIAN_EXAMS } from '$lib/data/indianExams';
	import { createDefaultProfile, normalizeProfile } from '$lib/shared/userProfile';

	let { initial = null, onclose, onafterfinish } = $props();

	const CLASS_OPTIONS = $derived([
		{ value: 'class-8', label: 'Class 8' },
		{ value: 'class-9', label: 'Class 9' },
		{ value: 'class-10', label: 'Class 10' },
		{ value: 'class-11', label: 'Class 11' },
		{ value: 'class-12', label: 'Class 12' },
		{ value: 'college', label: $t('profileWizardClassCollege') },
		{ value: 'working-professional', label: $t('profileWizardClassProfessional') },
		{ value: 'other', label: $t('profileWizardClassOther') },
	]);

	const PROFESSION_OPTIONS = $derived([
		{ value: 'software-engineering', label: $t('professionSoftwareEngineering') },
		{ value: 'engineering-non-it', label: $t('professionEngineeringNonIt') },
		{ value: 'banking-finance', label: $t('professionBankingFinance') },
		{ value: 'healthcare', label: $t('professionHealthcare') },
		{ value: 'teaching', label: $t('professionTeaching') },
		{ value: 'government', label: $t('professionGovernment') },
		{ value: 'law', label: $t('professionLaw') },
		{ value: 'business', label: $t('professionBusiness') },
		{ value: 'marketing-sales', label: $t('professionMarketingSales') },
		{ value: 'other', label: $t('professionOther') },
	]);

	const SUBJECT_SUGGESTIONS = [
		'Physics',
		'Chemistry',
		'Mathematics',
		'Biology',
		'English',
		'History',
		'Geography',
		'Civics',
		'Computer Science',
		'Reasoning',
		'Quantitative Aptitude',
		'General Awareness',
	];

	const PROFESSIONAL_SUBJECT_SUGGESTIONS = [
		'Computer Science',
		'Quantitative Aptitude',
		'Reasoning',
		'English',
		'General Awareness',
		'Data Structures & Algorithms',
		'System Design',
		'Business Communication',
	];

	let draft = $state((() => normalizeProfile(initial) || createDefaultProfile())());
	let step = $state(0);
	let subjectInput = $state('');
	let focusInput = $state('');
	let saving = $state(false);

	const TOTAL_STEPS = 4;

	let examQuery = $state('');
	const filteredExams = $derived.by(() => {
		const query = examQuery.trim().toLowerCase();
		if (!query) {
			return [];
		}
		return INDIAN_EXAMS.filter(
			(exam) =>
				exam.name.toLowerCase().includes(query) ||
				(exam.shortName || '').toLowerCase().includes(query)
		).slice(0, 8);
	});

	function closeModal() {
		onclose?.();
	}

	function toggleSubject(subject) {
		const current = draft.subjects || [];
		const index = current.findIndex((item) => item.toLowerCase() === subject.toLowerCase());
		if (index >= 0) {
			draft.subjects = current.filter((_, itemIndex) => itemIndex !== index);
		} else if (current.length < 12) {
			draft.subjects = [...current, subject];
		}
	}

	function addSubjectFromInput() {
		const value = subjectInput.trim().slice(0, 200);
		if (!value) {
			return;
		}
		toggleSubject(value);
		subjectInput = '';
	}

	function toggleFocus(topic) {
		const current = draft.declaredFocus || [];
		const index = current.findIndex((item) => item.toLowerCase() === topic.toLowerCase());
		if (index >= 0) {
			draft.declaredFocus = current.filter((_, itemIndex) => itemIndex !== index);
		} else if (current.length < 10) {
			draft.declaredFocus = [...current, topic];
		}
	}

	function addFocusFromInput() {
		const value = focusInput.trim().slice(0, 80);
		if (!value) {
			return;
		}
		toggleFocus(value);
		focusInput = '';
	}

	function selectExam(exam) {
		draft.examTarget = { examId: exam.id, name: exam.name };
		examQuery = exam.name;
	}

	function clearExam() {
		draft.examTarget = null;
		examQuery = '';
	}

	function canAdvance() {
		if (step === 0) {
			return true; // class is optional
		}
		if (step === 2) {
			return true;
		}
		return true;
	}

	async function handleNext() {
		if (step < TOTAL_STEPS - 1) {
			step += 1;
			return;
		}
		saving = true;
		try {
			const saved = await saveProfile({
				...draft,
				setupComplete: true,
			});
			track('profile:save', { step: 'wizard', setupComplete: true });
			onafterfinish?.(saved);
			closeModal();
		} catch (error) {
			console.error('Failed to save profile from wizard:', error);
		} finally {
			saving = false;
		}
	}

	function handleSkip() {
		if (step < TOTAL_STEPS - 1) {
			step += 1;
			return;
		}
		closeModal();
	}
</script>

<div
	class="profile-wizard-overlay"
	role="dialog"
	aria-modal="true"
	aria-label={$t('profileWizardTitle')}
>
	<div class="profile-wizard">
		<button
			class="wizard-close"
			type="button"
			aria-label={$t('profileWizardDismissAria')}
			onclick={closeModal}
		>
			×
		</button>
		<div class="wizard-header">
			<h2 class="wizard-title">{$t('profileWizardTitle')}</h2>
			<p class="wizard-subtitle">{$t('profileWizardSubtitle')}</p>
		</div>

		<div class="wizard-progress" aria-hidden="true">
			{#each Array.from({ length: TOTAL_STEPS }, (_, index) => index) as stepIndex (stepIndex)}
				<span class="wizard-progress-step" class:active={stepIndex <= step}></span>
			{/each}
		</div>

		{#if step === 0}
			<section class="wizard-body">
				<h3 class="wizard-section-title">{$t('profileWizardClassTitle')}</h3>
				<p class="wizard-hint">{$t('profileWizardClassHint')}</p>
				<div class="chip-grid">
					{#each CLASS_OPTIONS as option (option.value)}
						<button
							type="button"
							class="chip"
							class:selected={draft.class === option.value}
							onclick={() => (draft.class = option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
				{#if draft.class === 'working-professional'}
					<h3 class="wizard-section-title">{$t('profileWizardProfessionTitle')}</h3>
					<p class="wizard-hint">{$t('profileWizardProfessionHint')}</p>
					<div class="chip-grid">
						{#each PROFESSION_OPTIONS as option (option.value)}
							<button
								type="button"
								class="chip"
								class:selected={draft.profession === option.value}
								onclick={() => (draft.profession = option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				{/if}
				<h3 class="wizard-section-title">{$t('profileWizardExamTitle')}</h3>
				<p class="wizard-hint">{$t('profileWizardExamHint')}</p>
				<input
					class="form-control"
					type="text"
					placeholder={$t('profileWizardSearchExam')}
					aria-label={$t('profileWizardSearchExam')}
					bind:value={examQuery}
					oninput={() => {
						if (draft.examTarget && examQuery !== draft.examTarget.name) {
							draft.examTarget = null;
						}
					}}
				/>
				{#if filteredExams.length > 0}
					<ul class="exam-suggestions">
						{#each filteredExams as exam (exam.id)}
							<li>
								<button type="button" onclick={() => selectExam(exam)}>
									{exam.name}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if draft.examTarget}
					<button type="button" class="selected-exam" onclick={clearExam}>
						{draft.examTarget.name} <span aria-hidden="true">×</span>
					</button>
				{/if}
			</section>
		{:else if step === 1}
			<section class="wizard-body">
				<h3 class="wizard-section-title">{$t('profileWizardSubjectsTitle')}</h3>
				<p class="wizard-hint">{$t('profileWizardSubjectsHint')}</p>
				<div class="chip-grid">
					{#each draft.class === 'working-professional' ? PROFESSIONAL_SUBJECT_SUGGESTIONS : SUBJECT_SUGGESTIONS as subject (subject)}
						<button
							type="button"
							class="chip"
							class:selected={draft.subjects.some(
								(item) => item.toLowerCase() === subject.toLowerCase()
							)}
							onclick={() => toggleSubject(subject)}
						>
							{subject}
						</button>
					{/each}
				</div>
				<div class="add-row">
					<input
						class="form-control"
						type="text"
						placeholder={$t('profileWizardAddSubjectPlaceholder')}
						aria-label={$t('profileWizardAddSubjectPlaceholder')}
						bind:value={subjectInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								addSubjectFromInput();
							}
						}}
					/>
					<button
						type="button"
						class="btn btn-outline-primary"
						onclick={addSubjectFromInput}
					>
						{$t('profileWizardAdd')}
					</button>
				</div>
			</section>
		{:else if step === 2}
			<section class="wizard-body">
				<h3 class="wizard-section-title">{$t('profileWizardPrefsTitle')}</h3>
				<div class="form-group">
					<label class="form-label" for="wizard-language"
						>{$t('profileWizardLanguageLabel')}</label
					>
					<select
						id="wizard-language"
						class="form-select"
						bind:value={draft.preferences.language}
					>
						<option value="">{$t('profileWizardLanguageDefault')}</option>
						<option value="english">English</option>
						<option value="hindi">हिन्दी</option>
					</select>
				</div>
				<div class="form-group">
					<label class="form-label" for="wizard-comfort"
						>{$t('profileWizardComfortLabel')}</label
					>
					<select
						id="wizard-comfort"
						class="form-select"
						bind:value={draft.preferences.difficultyComfort}
					>
						<option value="">{$t('profileWizardComfortDefault')}</option>
						<option value="beginner">{$t('beginner')}</option>
						<option value="intermediate">{$t('intermediate')}</option>
						<option value="advanced">{$t('advanced')}</option>
						<option value="expert">{$t('expert')}</option>
					</select>
				</div>
				<p class="wizard-hint">{$t('profileWizardPrefsHint')}</p>
			</section>
		{:else}
			<section class="wizard-body">
				<h3 class="wizard-section-title">{$t('profileWizardFocusTitle')}</h3>
				<p class="wizard-hint">{$t('profileWizardFocusHint')}</p>
				{#if draft.declaredFocus.length > 0}
					<div class="chip-grid">
						{#each draft.declaredFocus as topic (topic)}
							<button
								type="button"
								class="chip selected"
								onclick={() => toggleFocus(topic)}
							>
								{topic} <span aria-hidden="true">×</span>
							</button>
						{/each}
					</div>
				{/if}
				<div class="add-row">
					<input
						class="form-control"
						type="text"
						placeholder={$t('profileWizardAddFocusPlaceholder')}
						aria-label={$t('profileWizardAddFocusPlaceholder')}
						bind:value={focusInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								addFocusFromInput();
							}
						}}
					/>
					<button
						type="button"
						class="btn btn-outline-primary"
						onclick={addFocusFromInput}
					>
						{$t('profileWizardAdd')}
					</button>
				</div>
			</section>
		{/if}

		<div class="wizard-footer">
			<button type="button" class="btn btn-outline-secondary" onclick={handleSkip}>
				{$t('profileWizardSkip')}
			</button>
			<div class="wizard-footer-actions">
				{#if step > 0}
					<button
						type="button"
						class="btn btn-outline-secondary"
						onclick={() => (step -= 1)}
					>
						{$t('profileWizardBack')}
					</button>
				{/if}
				<button
					type="button"
					class="btn btn-primary"
					disabled={!canAdvance() || saving}
					onclick={handleNext}
				>
					{saving
						? $t('profileSaving')
						: step < TOTAL_STEPS - 1
							? $t('profileWizardNext')
							: $t('profileWizardFinish')}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.profile-wizard-overlay {
		position: fixed;
		inset: 0;
		z-index: 2000;
		display: grid;
		place-items: center;
		padding: 16px;
		background: color-mix(in srgb, #000 55%, transparent);
	}

	.profile-wizard {
		position: relative;
		width: 100%;
		max-width: 460px;
		max-height: min(620px, 90vh);
		overflow-y: auto;
		padding: 24px 20px 16px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface);
		box-shadow: 0 20px 60px color-mix(in srgb, #000 35%, transparent);
	}

	.wizard-close {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		font-size: 1.3rem;
	}

	.wizard-header {
		padding-right: 36px;
	}

	.wizard-title {
		margin: 0 0 4px;
		font-size: 1.2rem;
		font-weight: 800;
	}

	.wizard-subtitle {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.wizard-progress {
		display: flex;
		gap: 6px;
		margin: 16px 0 4px;
	}

	.wizard-progress-step {
		height: 4px;
		flex: 1;
		border-radius: 4px;
		background: var(--line);
		transition: background 0.2s;
	}

	.wizard-progress-step.active {
		background: var(--color-brand-600);
	}

	.wizard-body {
		padding: 12px 0;
	}

	.wizard-section-title {
		margin: 16px 0 4px;
		font-size: 0.95rem;
		font-weight: 700;
	}

	.wizard-section-title:first-child {
		margin-top: 0;
	}

	.wizard-hint {
		margin: 0 0 10px;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.chip-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 8px;
	}

	.chip {
		min-height: 44px;
		padding: 8px 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.chip.selected {
		border-color: var(--color-brand-600);
		background: color-mix(in srgb, var(--color-brand-600) 14%, transparent);
		color: var(--color-brand-600);
	}

	.exam-suggestions {
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
	}

	.exam-suggestions button {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		text-align: left;
	}

	.exam-suggestions button:hover {
		background: var(--surface-muted);
	}

	.exam-suggestions li:last-child button {
		border-bottom: 0;
	}

	.selected-exam {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		min-height: 44px;
		padding: 8px 14px;
		border: 1px solid var(--color-brand-600);
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-brand-600) 14%, transparent);
		color: var(--color-brand-600);
		font-weight: 600;
	}

	.add-row {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	.add-row .form-control {
		flex: 1;
		min-width: 0;
	}

	.form-group {
		margin-bottom: 14px;
	}

	.form-label {
		display: block;
		margin-bottom: 6px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.form-select {
		width: 100%;
		min-height: 44px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-muted);
		color: var(--text);
	}

	.wizard-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}

	.wizard-footer-actions {
		display: flex;
		gap: 8px;
	}

	.wizard-footer .btn {
		min-height: 44px;
	}
</style>
