<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { activeLanguage, t } from '#lib/client/i18n.js';
	import { getClientHeaders } from '#lib/client/identity.js';
	import GoogleSignInButton from '#lib/client/GoogleSignInButton.svelte';
	import { saveCurrentPaper } from '#lib/client/storage.js';
	import { streamErrorToError } from '#lib/client/sse.js';
	import { readGenerationStream } from '#lib/client/generateStream.js';
	import { loginWithGoogleCredential } from '#lib/client/auth.js';
	import {
		createAccountWithPasskey,
		isPasskeySupported,
		passkeyErrorKey,
		signInWithPasskey,
	} from '#lib/client/passkeys.js';
	import { track } from '#lib/client/telemetry.js';

	const BOARDS = ['CBSE', 'ICSE', 'State Board'];
	const CLASS_LEVELS = ['6', '7', '8', '9', '10', '11', '12'];

	let access = $state(null);
	let mode = $state('board');
	let board = $state('CBSE');
	let classLevel = $state('10');
	let subject = $state('Science');
	let paperName = $state('');
	let school = $state('');
	let pattern = $state(null);
	let patternLoading = $state(false);
	let patternError = $state('');
	let selectedSection = $state('full');
	let generating = $state(false);
	let generateError = $state('');
	let passkeySupported = $state(false);
	let passkeyBusy = $state(false);
	let gateError = $state('');
	let generateStage = $state('');
	let generateController = null;
	let stageTimerA = null;
	let stageTimerB = null;
	let patternNotice = $state(false);
	let noticeTimer = null;

	const totalQuestions = $derived(
		(pattern?.sections || []).reduce((sum, section) => sum + (section.questionCount || 0), 0)
	);
	const selectedSectionObject = $derived(
		selectedSection === 'full'
			? null
			: (pattern?.sections || []).find((section) => section.id === selectedSection) || null
	);

	async function checkAccess() {
		access = null;
		try {
			const response = await fetch('/api/premium/access', {
				headers: getClientHeaders(),
				cache: 'no-store',
			});
			const data = await response.json().catch(() => ({}));
			access = response.ok ? data : { allowed: false, reason: 'unavailable' };
		} catch {
			access = { allowed: false, reason: 'unavailable' };
		}
	}

	onMount(() => {
		track('exam-paper:open');
		passkeySupported = isPasskeySupported();
		void checkAccess();
	});

	/** Both passkey paths reload so the gate re-reads premium access. */
	async function runGatePasskey(action) {
		passkeyBusy = true;
		gateError = '';
		try {
			await action();
			location.reload();
		} catch (error) {
			const key = passkeyErrorKey(error);
			if (key) {
				gateError = key;
			}
		} finally {
			passkeyBusy = false;
		}
	}

	function handleGatePasskeySignup() {
		return runGatePasskey(() => createAccountWithPasskey({ language: $activeLanguage }));
	}

	function handleGatePasskeySignIn() {
		return runGatePasskey(() => signInWithPasskey());
	}

	async function handleCredential(credential) {
		try {
			await loginWithGoogleCredential(credential);
			location.reload();
		} catch {
			gateError = 'examPaperGateSignInFailed';
		}
	}

	function patternParams() {
		if (mode === 'paper') {
			return { paper: paperName.trim() };
		}
		return { board, class: classLevel, subject };
	}

	async function fetchPattern(refresh = false) {
		if (patternLoading) {
			return;
		}
		patternLoading = true;
		patternError = '';
		try {
			const params = new URLSearchParams({
				...patternParams(),
				language: $activeLanguage === 'hindi' ? 'hindi' : 'english',
			});
			if (refresh) {
				params.set('refresh', '1');
			}
			const response = await fetch(`/api/exam/pattern?${params.toString()}`, {
				cache: 'no-store',
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || $t('examPaperPatternError'));
			}
			pattern = data.pattern;
			selectedSection = 'full';
			track('exam-paper:pattern', { sections: data.pattern?.sections?.length || 0 });
		} catch (error) {
			patternError = error.message || $t('examPaperPatternError');
			pattern = null;
		} finally {
			patternLoading = false;
		}
	}

	function switchMode(nextMode) {
		if (pattern) {
			patternNotice = true;
			if (noticeTimer !== null) {
				window.clearTimeout(noticeTimer);
			}
			noticeTimer = window.setTimeout(() => (patternNotice = false), 5000);
		}
		mode = nextMode;
		pattern = null;
	}

	function startStageTimers() {
		generateStage = $t('examPaperStagePlanning');
		stageTimerA = window.setTimeout(() => (generateStage = $t('examPaperStageWriting')), 6000);
		stageTimerB = window.setTimeout(
			() => (generateStage = $t('examPaperStageFinishing')),
			20000
		);
	}

	function clearStageTimers() {
		if (stageTimerA !== null) {
			window.clearTimeout(stageTimerA);
			stageTimerA = null;
		}
		if (stageTimerB !== null) {
			window.clearTimeout(stageTimerB);
			stageTimerB = null;
		}
		generateStage = '';
	}

	function cancelGenerate() {
		generateController?.abort();
	}

	onDestroy(() => {
		clearStageTimers();
		if (noticeTimer !== null) {
			window.clearTimeout(noticeTimer);
		}
	});

	async function generate() {
		if (generating || !pattern) {
			return;
		}
		generating = true;
		generateError = '';
		startStageTimers();
		const controller = new AbortController();
		generateController = controller;
		track('exam-paper:generate', { section: selectedSectionObject?.id || 'full' });
		try {
			const body = {
				testMode: 'full-exam',
				objectiveOnly: true,
				language: $activeLanguage === 'hindi' ? 'hindi' : 'english',
				testType: selectedSectionObject?.questionTypes?.[0] || 'multiple-choice',
				numQuestions:
					selectedSectionObject?.questionCount ||
					totalQuestions ||
					pattern.sections.length,
				difficulty: 'intermediate',
				durationMinutes: pattern.durationMinutes,
				paperName: mode === 'paper' ? paperName.trim() : null,
				board: mode === 'board' ? board : null,
				classLevel: mode === 'board' ? classLevel : null,
				subject: mode === 'board' ? subject : null,
				sectionFocus: selectedSectionObject?.id || null,
				school: school.trim() || null,
				explicit: ['difficulty', 'numQuestions', 'testType', 'durationMinutes'],
			};
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: { ...getClientHeaders(), Accept: 'text/event-stream' },
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				const error = new Error(data.error || $t('generationFailed'));
				error.code = data.code;
				throw error;
			}
			let finalPaper = null;
			await readGenerationStream(response, {
				onEvent: (event, data) => {
					if (event === 'done') {
						finalPaper = data;
					} else if (event === 'error') {
						throw streamErrorToError(data);
					}
				},
			});
			if (!finalPaper?.id) {
				throw new Error($t('generationFailed'));
			}
			saveCurrentPaper(finalPaper);
			await goto(`/test?id=${finalPaper.id}`);
		} catch (error) {
			if (error?.name === 'AbortError') {
				return;
			}
			generateError =
				error.code === 'PREMIUM_REQUIRED'
					? $t('examPaperPremiumRequired')
					: error.message || $t('generationFailed');
		} finally {
			generating = false;
			generateController = null;
			clearStageTimers();
		}
	}
</script>

<section class="app-container py-4 py-md-5 exam-paper-page">
	<h1 class="text-page mb-1">{$t('examPaperTitle')}</h1>
	<p class="text-muted small mb-4">{$t('examPaperSubtitle')}</p>

	{#if access === null}
		<p class="text-muted small">{$t('checkingAccess')}</p>
	{:else if !access.allowed && access.reason === 'unavailable'}
		<div class="exam-paper-gate bg-body border rounded-3 p-4">
			<h2 class="h6 fw-bold mb-2">{$t('examPaperUnavailableTitle')}</h2>
			<p class="text-muted small mb-3">{$t('examPaperUnavailableBody')}</p>
			<button class="btn btn-primary" type="button" onclick={() => checkAccess()}>
				{$t('tryAgain')}
			</button>
		</div>
	{:else if !access.allowed}
		<div class="exam-paper-gate bg-body border rounded-3 p-4">
			<h2 class="h6 fw-bold mb-2">{$t('examPaperGateTitle')}</h2>
			<p class="text-muted small mb-3">{$t('examPaperGateBody')}</p>
			{#if !access.signedIn}
				{#if passkeySupported}
					<div class="d-flex flex-column gap-2 mb-2">
						<button
							class="btn btn-primary exam-paper-passkey"
							type="button"
							disabled={passkeyBusy}
							onclick={handleGatePasskeySignup}
						>
							{$t('passkeyCreate')}
						</button>
						<button
							class="btn btn-outline-secondary exam-paper-passkey"
							type="button"
							disabled={passkeyBusy}
							onclick={handleGatePasskeySignIn}
						>
							{$t('passkeySignIn')}
						</button>
					</div>
					<p class="text-muted small mb-2">{$t('or')}</p>
				{/if}
				<GoogleSignInButton onCredential={handleCredential} />
			{/if}
			{#if gateError}
				<div class="alert alert-danger small mt-3 mb-0" role="alert">{$t(gateError)}</div>
			{/if}
		</div>
	{:else}
		<div class="exam-paper-form bg-body border rounded-3 p-3 p-md-4 mb-3">
			<div class="tab-row mb-3" role="tablist" aria-label={$t('examPaperTitle')}>
				<button
					class="btn btn-sm"
					class:btn-primary={mode === 'board'}
					class:btn-outline-secondary={mode !== 'board'}
					type="button"
					role="tab"
					aria-selected={mode === 'board'}
					onclick={() => switchMode('board')}
				>
					{$t('examPaperBoardTab')}
				</button>
				<button
					class="btn btn-sm"
					class:btn-primary={mode === 'paper'}
					class:btn-outline-secondary={mode !== 'paper'}
					type="button"
					role="tab"
					aria-selected={mode === 'paper'}
					onclick={() => switchMode('paper')}
				>
					{$t('examPaperNamedTab')}
				</button>
			</div>
			{#if patternNotice}
				<p class="text-muted small mb-3" role="status">{$t('examPaperPatternCleared')}</p>
			{/if}

			{#if mode === 'board'}
				<div class="row g-3">
					<div class="col-6 col-md-3">
						<label class="form-label small" for="exam-board"
							>{$t('examPaperBoard')}</label
						>
						<select id="exam-board" class="form-select" bind:value={board}>
							{#each BOARDS as option (option)}
								<option value={option}>{option}</option>
							{/each}
						</select>
					</div>
					<div class="col-6 col-md-3">
						<label class="form-label small" for="exam-class"
							>{$t('examPaperClass')}</label
						>
						<select id="exam-class" class="form-select" bind:value={classLevel}>
							{#each CLASS_LEVELS as option (option)}
								<option value={option}>{option}</option>
							{/each}
						</select>
					</div>
					<div class="col-12 col-md-3">
						<label class="form-label small" for="exam-subject"
							>{$t('examPaperSubject')}</label
						>
						<input
							id="exam-subject"
							class="form-control"
							type="text"
							maxlength="80"
							bind:value={subject}
						/>
					</div>
				</div>
			{:else}
				<div class="row g-3">
					<div class="col-12 col-md-6">
						<label class="form-label small" for="exam-paper-name">
							{$t('examPaperName')}
						</label>
						<input
							id="exam-paper-name"
							class="form-control"
							type="text"
							maxlength="120"
							placeholder={$t('examPaperNamePlaceholder')}
							bind:value={paperName}
						/>
					</div>
				</div>
			{/if}

			<div class="row g-3 mt-3">
				<div class="col-12 col-md-6">
					<label class="form-label small" for="exam-school">
						{$t('examPaperSchool')}
					</label>
					<input
						id="exam-school"
						class="form-control"
						type="text"
						maxlength="120"
						bind:value={school}
					/>
				</div>
			</div>

			<div class="d-flex flex-wrap gap-2 mt-3">
				<button
					class="btn btn-primary"
					type="button"
					disabled={patternLoading || (mode === 'paper' && !paperName.trim())}
					onclick={() => fetchPattern(false)}
				>
					{patternLoading ? $t('examPaperPatternLoading') : $t('examPaperLoadPattern')}
				</button>
				{#if pattern}
					<button
						class="btn btn-outline-secondary btn-sm"
						type="button"
						disabled={patternLoading}
						onclick={() => fetchPattern(true)}
					>
						{$t('examPaperRegenerate')}
					</button>
				{/if}
			</div>
			{#if patternError}
				<p class="text-danger small mt-2 mb-0">{patternError}</p>
			{/if}
		</div>

		{#if pattern}
			<div class="exam-paper-pattern bg-body border rounded-3 p-3 p-md-4 mb-3">
				<div class="d-flex flex-wrap align-items-baseline justify-content-between gap-2">
					<h2 class="h6 fw-bold mb-0">{$t('examPaperSectionsTitle')}</h2>
					<span class="text-muted small">
						{$t('examPaperPatternMeta', {
							minutes: pattern.durationMinutes,
							year: pattern.patternYear,
						})}
					</span>
				</div>
				<div class="pattern-sections mt-3">
					{#each pattern.sections as section (section.id)}
						<div class="pattern-section">
							<span class="pattern-section-name">{section.name}</span>
							<span class="pattern-section-meta text-muted">
								{$t('examPaperSectionLine', {
									count: section.questionCount,
									marks: section.marksPerQuestion,
								})}
							</span>
						</div>
					{/each}
				</div>

				<div
					class="section-picker mt-3"
					role="radiogroup"
					aria-label={$t('examPaperPickSection')}
				>
					<button
						class="chip"
						class:active={selectedSection === 'full'}
						type="button"
						role="radio"
						aria-checked={selectedSection === 'full'}
						onclick={() => (selectedSection = 'full')}
					>
						{$t('examPaperFullPaper')}
					</button>
					{#each pattern.sections as section (section.id)}
						<button
							class="chip"
							class:active={selectedSection === section.id}
							type="button"
							role="radio"
							aria-checked={selectedSection === section.id}
							onclick={() => (selectedSection = section.id)}
						>
							{section.name}
						</button>
					{/each}
				</div>

				<div class="d-flex flex-wrap align-items-center gap-2 mt-3">
					<button
						class="btn btn-primary"
						type="button"
						disabled={generating}
						onclick={generate}
					>
						{generating ? $t('generating') : $t('examPaperGenerate')}
					</button>
					{#if generating}
						<button class="btn btn-outline-secondary" type="button" onclick={cancelGenerate}>
							{$t('cancel')}
						</button>
					{/if}
				</div>
				{#if generating && generateStage}
					<p class="text-muted small mt-2 mb-0" aria-live="polite">{generateStage}</p>
				{/if}
				{#if generateError}
					<p class="text-danger small mt-2 mb-0">{generateError}</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.tab-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.pattern-sections {
		display: grid;
		gap: 6px;
	}

	.pattern-section {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 10px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--line);
	}

	.pattern-section-name {
		font-size: 0.88rem;
		font-weight: 600;
	}

	.pattern-section-meta {
		font-size: 0.78rem;
	}

	.section-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	/* Section picker chips use the shared `.chip` primitive. */
</style>
