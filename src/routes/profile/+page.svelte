<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import { loginWithGoogleCredential, user } from '$lib/client/auth';
	import GoogleSignInButton from '$lib/client/GoogleSignInButton.svelte';
	import {
		fetchProfile,
		fetchProfileInsights,
		profileInsights,
		resetProfile,
		saveProfile,
	} from '$lib/client/profile';
	import { track } from '$lib/client/telemetry';
	import { INDIAN_EXAMS } from '$lib/data/indianExams';
	import { createDefaultProfile } from '$lib/shared/userProfile';

	const CLASS_OPTIONS = $derived([
		{ value: 'class-8', label: 'Class 8' },
		{ value: 'class-9', label: 'Class 9' },
		{ value: 'class-10', label: 'Class 10' },
		{ value: 'class-11', label: 'Class 11' },
		{ value: 'class-12', label: 'Class 12' },
		{ value: 'college', label: $t('profileWizardClassCollege') },
		{ value: 'other', label: $t('profileWizardClassOther') },
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

	let loaded = $state(false);
	let lastUserId = $state(null);
	let saving = $state(false);
	let isSigningIn = $state(false);
	let signInError = $state('');
	let savedToast = $state(false);
	let examQuery = $state('');
	let subjectInput = $state('');
	let focusInput = $state('');
	let draft = $state(createDefaultProfile());

	const filteredExams = $derived.by(() => {
		const query = examQuery.trim().toLowerCase();
		if (!query) {
			return [];
		}
		return INDIAN_EXAMS.filter(
			(exam) =>
				exam.name.toLowerCase().includes(query) ||
				(exam.shortName || '').toLowerCase().includes(query),
		).slice(0, 8);
	});

	onMount(async () => {
		const nextProfile = await fetchProfile();
		await fetchProfileInsights();
		if (nextProfile) {
			draft = structuredClone(nextProfile);
			if (nextProfile.examTarget?.name) {
				examQuery = nextProfile.examTarget.name;
			}
		}
		loaded = true;
		return () => {
			// No-op: page-scoped state.
		};
	});

	$effect(() => {
		const userId = $user?.id || null;
		if (userId === lastUserId) {
			return;
		}
		lastUserId = userId;
		void fetchProfile().then((nextProfile) => {
			if (nextProfile) {
				draft = structuredClone(nextProfile);
				if (nextProfile.examTarget?.name) {
					examQuery = nextProfile.examTarget.name;
				}
			}
			loaded = true;
		});
		void fetchProfileInsights();
	});

	function toggleInList(listKey, value) {
		const current = draft[listKey] || [];
		const index = current.findIndex(
			(item) => item.toLowerCase() === value.toLowerCase(),
		);
		if (index >= 0) {
			draft[listKey] = current.filter((_, itemIndex) => itemIndex !== index);
		} else {
			draft[listKey] = [...current, value];
		}
	}

	function addSubject() {
		const value = subjectInput.trim().slice(0, 200);
		if (value) {
			toggleInList('subjects', value);
			subjectInput = '';
		}
	}

	function addFocus() {
		const value = focusInput.trim().slice(0, 80);
		if (value) {
			toggleInList('declaredFocus', value);
			focusInput = '';
		}
	}

	function selectExam(exam) {
		draft.examTarget = { examId: exam.id, name: exam.name };
		examQuery = exam.name;
	}

	function clearExam() {
		draft.examTarget = null;
		examQuery = '';
	}

	async function handleGoogleCredential(credential) {
		isSigningIn = true;
		signInError = '';
		try {
			await loginWithGoogleCredential(credential);
			track('auth:google-sign-in');
			const nextProfile = await fetchProfile();
			await fetchProfileInsights();
			if (nextProfile) {
				draft = structuredClone(nextProfile);
				if (nextProfile.examTarget?.name) {
					examQuery = nextProfile.examTarget.name;
				}
			}
		} catch (error) {
			console.error('Google sign-in failed:', error);
			signInError = error?.message || $t('signInFailed');
		} finally {
			isSigningIn = false;
		}
	}

	async function handleSave() {
		saving = true;
		const saved = await saveProfile({ ...draft, setupComplete: true });
		saving = false;
		track('profile:save', { step: 'profile-page' });
		if (saved) {
			draft = structuredClone(saved);
			savedToast = true;
			window.setTimeout(() => (savedToast = false), 2500);
			void fetchProfileInsights();
		}
	}

	async function handleReset() {
		if (!window.confirm($t('profileResetConfirm'))) {
			return;
		}
		await resetProfile();
		track('profile:reset', {});
		draft = createDefaultProfile();
		examQuery = '';
		savedToast = true;
		window.setTimeout(() => (savedToast = false), 2500);
	}

	async function handlePersonalizedChange() {
		await handleSave();
		if (!draft.preferences.personalized) {
			track('profile:opt-out', {});
		}
	}

	const signals = $derived($profileInsights?.signals || null);
	const percent = $derived((value) =>
		typeof value === 'number' ? `${Math.round(value * 100)}%` : '—',
	);
</script>

<svelte:head>
	<title>{$t('profilePageTitle')} | selftest.in</title>
</svelte:head>

<section class="container py-4 py-md-5" style="padding-top: calc(1.5rem + env(safe-area-inset-top, 0px));">
	<div class="mx-auto profile-wrap">
		<h1 class="h3 fw-bold mb-3">{$t('profilePageTitle')}</h1>

		{#if !$user}
			<div class="card p-4 text-center">
				<p class="text-muted mb-3">{$t('profilePageSignInHint')}</p>
				{#if signInError}
					<div class="alert alert-danger small mb-3" role="alert">{signInError}</div>
				{/if}
				<div class="d-flex justify-content-center">
					<GoogleSignInButton oncredential={handleGoogleCredential} disabled={isSigningIn} />
				</div>
				<p class="text-muted small mt-3 mb-0">{$t('signInAnonymousNote')}</p>
			</div>
		{:else if loaded}
			<div class="d-flex flex-column gap-3">
				{#if savedToast}
					<div class="alert alert-success mb-0" role="status">{$t('profileSaved')}</div>
				{/if}

				<section class="card p-4">
					<h2 class="h5 fw-bold mb-3">{$t('profileSectionLearner')}</h2>
					<div class="row g-3">
						<div class="col-12 col-sm-6">
							<label class="form-label fw-semibold" for="profile-class">{$t('profileWizardClassTitle')}</label>
							<select
								id="profile-class"
								class="form-select"
								bind:value={draft.class}
							>
								<option value="">{$t('profileWizardLanguageDefault')}</option>
								{#each CLASS_OPTIONS as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
						<div class="col-12 col-sm-6">
							<label class="form-label fw-semibold" for="profile-exam">{$t('profileWizardExamTitle')}</label>
							<input
								id="profile-exam"
								class="form-control"
								type="text"
								placeholder={$t('profileWizardSearchExam')}
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
											<button type="button" class="suggestion-button" onclick={() => selectExam(exam)}>
												{exam.name}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
							{#if draft.examTarget}
								<button type="button" class="chip-selected mt-2" onclick={clearExam}>
									{draft.examTarget.name} <span aria-hidden="true">×</span>
								</button>
							{/if}
						</div>
						<div class="col-12">
							<span class="form-label fw-semibold d-block">{$t('profileWizardSubjectsTitle')}</span>
							<div class="chip-grid">
								{#each SUBJECT_SUGGESTIONS as subject (subject)}
									<button
										type="button"
										class="chip"
										class:selected={draft.subjects.some(
											(item) => item.toLowerCase() === subject.toLowerCase(),
										)}
										onclick={() => toggleInList('subjects', subject)}
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
									bind:value={subjectInput}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											addSubject();
										}
									}}
								/>
								<button type="button" class="btn btn-outline-primary" onclick={addSubject}>
									{$t('profileWizardAdd')}
								</button>
							</div>
						</div>
						<div class="col-12 col-sm-6">
							<label class="form-label fw-semibold" for="profile-language">{$t('profileWizardLanguageLabel')}</label>
							<select id="profile-language" class="form-select" bind:value={draft.preferences.language}>
								<option value="">{$t('profileWizardLanguageDefault')}</option>
								<option value="english">English</option>
								<option value="hindi">हिन्दी</option>
							</select>
						</div>
						<div class="col-12 col-sm-6">
							<label class="form-label fw-semibold" for="profile-comfort">{$t('profileWizardComfortLabel')}</label>
							<select id="profile-comfort" class="form-select" bind:value={draft.preferences.difficultyComfort}>
								<option value="">{$t('profileWizardComfortDefault')}</option>
								<option value="beginner">{$t('beginner')}</option>
								<option value="intermediate">{$t('intermediate')}</option>
								<option value="advanced">{$t('advanced')}</option>
								<option value="expert">{$t('expert')}</option>
							</select>
						</div>
					</div>
				</section>

				<section class="card p-4">
					<h2 class="h5 fw-bold mb-1">{$t('profileSectionFocus')}</h2>
					<p class="text-muted small mb-3">{$t('profileSaveHint')}</p>
					{#if draft.declaredFocus.length > 0}
						<div class="chip-grid mb-2">
							{#each draft.declaredFocus as topic (topic)}
								<button type="button" class="chip selected" onclick={() => toggleInList('declaredFocus', topic)}>
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
							bind:value={focusInput}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									addFocus();
								}
							}}
						/>
						<button type="button" class="btn btn-outline-primary" onclick={addFocus}>
							{$t('profileWizardAdd')}
						</button>
					</div>
				</section>

				<section class="card p-4">
					<h2 class="h5 fw-bold mb-3">{$t('profileSectionInsights')}</h2>
					{#if !signals || signals.testsTaken === 0}
						<p class="text-muted small mb-0">{$t('profileInsightsEmpty')}</p>
					{:else}
						<p class="text-muted small">
							{$t('profileInsightsTestsTaken', { count: signals.testsTaken })}
							{#if typeof signals.overallAccuracy === 'number'}
								· {$t('profileInsightsOverallAccuracy', { percent: percent(signals.overallAccuracy) })}
							{/if}
						</p>
						<div class="row g-3 mt-1">
							<div class="col-12 col-sm-6">
								<h3 class="h6 fw-bold text-danger">{$t('profileWeakTopics')}</h3>
								{#if signals.weakTopics.length === 0}
									<p class="text-muted small">—</p>
								{:else}
									<ul class="insight-list">
										{#each signals.weakTopics as topic (topic.topic)}
											<li>
												<span class="fw-semibold">{topic.topic}</span>
												<span class="text-muted small">
													{$t('profileTopicAccuracy', {
														percent: percent(topic.accuracy),
														count: topic.attempts,
													})}
												</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
							<div class="col-12 col-sm-6">
								<h3 class="h6 fw-bold text-success">{$t('profileStrongTopics')}</h3>
								{#if signals.strongTopics.length === 0}
									<p class="text-muted small">—</p>
								{:else}
									<ul class="insight-list">
										{#each signals.strongTopics as topic (topic.topic)}
											<li>
												<span class="fw-semibold">{topic.topic}</span>
												<span class="text-muted small">
													{$t('profileTopicAccuracy', {
														percent: percent(topic.accuracy),
														count: topic.attempts,
													})}
												</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
				</section>

				<section class="card p-4">
					<div class="d-flex align-items-center justify-content-between gap-3">
						<div>
							<h2 class="h6 fw-bold mb-1">{$t('profilePersonalizationLabel')}</h2>
							<p class="text-muted small mb-0">{$t('profilePersonalizationHint')}</p>
						</div>
						<label class="switch" aria-label={$t('profilePersonalizationLabel')}>
							<input
								type="checkbox"
								checked={draft.preferences.personalized}
								onchange={() => {
									draft.preferences.personalized = event.target.checked;
									void handlePersonalizedChange();
								}}
							/>
							<span class="switch-slider"></span>
						</label>
					</div>
				</section>

				<div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
					<button type="button" class="btn btn-primary" disabled={saving} onclick={handleSave}>
						{saving ? $t('profileSaving') : $t('profileSaveButton')}
					</button>
					<button type="button" class="btn btn-outline-danger" onclick={handleReset}>
						{$t('profileResetButton')}
					</button>
				</div>
			</div>
		{:else}
			<p class="text-muted">…</p>
		{/if}
	</div>
</section>

<style>
	.profile-wrap {
		max-width: 640px;
	}

	.chip-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
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

	.chip-selected {
		display: inline-flex;
		align-items: center;
		gap: 8px;
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

	.exam-suggestions {
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
	}

	.exam-suggestions li {
		border-bottom: 1px solid var(--line);
	}

	.exam-suggestions li:last-child {
		border-bottom: 0;
	}

	.suggestion-button {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		border: 0;
		background: var(--surface);
		color: var(--text);
		text-align: left;
	}

	.suggestion-button:hover {
		background: var(--surface-muted);
	}

	.insight-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.insight-list li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}

	.switch {
		position: relative;
		display: inline-block;
		width: 52px;
		height: 30px;
		flex: 0 0 auto;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.switch-slider {
		position: absolute;
		inset: 0;
		border-radius: 999px;
		background: var(--line);
		transition: background 0.2s;
	}

	.switch-slider::before {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.2s;
	}

	.switch input:checked + .switch-slider {
		background: var(--color-brand-600);
	}

	.switch input:checked + .switch-slider::before {
		transform: translateX(22px);
	}
</style>
