<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { activeLanguage, t } from '$lib/client/i18n';
	import { getClientHeaders } from '$lib/client/identity';
	import GoogleSignInButton from '$lib/client/GoogleSignInButton.svelte';
	import { saveCurrentPaper } from '$lib/client/storage';
	import { parseSseBuffer, streamErrorToError } from '$lib/client/sse';
	import { loginWithGoogleCredential } from '$lib/client/auth';
	import { track } from '$lib/client/telemetry';

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

	const totalQuestions = $derived(
		(pattern?.sections || []).reduce((sum, section) => sum + (section.questionCount || 0), 0)
	);
	const selectedSectionObject = $derived(
		selectedSection === 'full'
			? null
			: (pattern?.sections || []).find((section) => section.id === selectedSection) || null
	);

	onMount(async () => {
		track('exam-paper:open');
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
	});

	async function handleCredential(credential) {
		try {
			await loginWithGoogleCredential(credential);
			location.reload();
		} catch {
			generateError = $t('examPaperGateBody');
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

	async function generate() {
		if (generating || !pattern) {
			return;
		}
		generating = true;
		generateError = '';
		track('exam-paper:generate', { section: selectedSectionObject?.id || 'full' });
		try {
			const body = {
				testMode: 'full-exam',
				objectiveOnly: true,
				language: $activeLanguage === 'hindi' ? 'hindi' : 'english',
				testType: selectedSectionObject?.questionTypes?.[0] || 'multiple-choice',
				numQuestions:
					selectedSectionObject?.questionCount || totalQuestions || pattern.sections.length,
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
			});
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				const error = new Error(data.error || $t('generationFailed'));
				error.code = data.code;
				throw error;
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let finalPaper = null;
			for (;;) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				buffer += decoder.decode(value, { stream: true });
				const { events, rest } = parseSseBuffer(buffer);
				buffer = rest;
				for (const event of events) {
					if (event.event === 'done') {
						finalPaper = event.data;
					} else if (event.event === 'error') {
						throw streamErrorToError(event.data);
					}
				}
			}
			if (!finalPaper?.id) {
				throw new Error($t('generationFailed'));
			}
			saveCurrentPaper(finalPaper);
			await goto(`/test?id=${finalPaper.id}`);
		} catch (error) {
			generateError =
				error.code === 'PREMIUM_REQUIRED'
					? $t('examPaperPremiumRequired')
					: error.message || $t('generationFailed');
		} finally {
			generating = false;
		}
	}
</script>

<section class="app-container py-4 py-md-5 exam-paper-page">
	<h1 class="text-page mb-1">{$t('examPaperTitle')}</h1>
	<p class="text-muted small mb-4">{$t('examPaperSubtitle')}</p>

	{#if access === null}
		<p class="text-muted small">{$t('loading')}</p>
	{:else if !access.allowed}
		<div class="exam-paper-gate bg-body border rounded-3 p-4">
			<h2 class="h6 fw-bold mb-2">{$t('examPaperGateTitle')}</h2>
			<p class="text-muted small mb-3">{$t('examPaperGateBody')}</p>
			{#if !access.signedIn}
				<GoogleSignInButton onCredential={handleCredential} />
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
					onclick={() => {
						mode = 'board';
						pattern = null;
					}}
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
					onclick={() => {
						mode = 'paper';
						pattern = null;
					}}
				>
					{$t('examPaperNamedTab')}
				</button>
			</div>

			{#if mode === 'board'}
				<div class="row g-3">
					<div class="col-6 col-md-3">
						<label class="form-label small" for="exam-board">{$t('examPaperBoard')}</label>
						<select id="exam-board" class="form-select" bind:value={board}>
							{#each BOARDS as option (option)}
								<option value={option}>{option}</option>
							{/each}
						</select>
					</div>
					<div class="col-6 col-md-3">
						<label class="form-label small" for="exam-class">{$t('examPaperClass')}</label>
						<select
							id="exam-class"
							class="form-select"
							bind:value={classLevel}
						>
							{#each CLASS_LEVELS as option (option)}
								<option value={option}>{option}</option>
							{/each}
						</select>
					</div>
					<div class="col-12 col-md-3">
						<label class="form-label small" for="exam-subject">{$t('examPaperSubject')}</label>
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
					class="btn btn-primary btn-sm"
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

				<div class="section-picker mt-3" role="radiogroup" aria-label={$t('examPaperPickSection')}>
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

				<button
					class="btn btn-primary mt-3"
					type="button"
					disabled={generating}
					onclick={generate}
				>
					{generating ? $t('generating') : $t('examPaperGenerate')}
				</button>
				{#if generateError}
					<p class="text-danger small mt-2 mb-0">{generateError}</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	/* The page owns the shared shell; the focused builder is an inner column. */
	.exam-paper-page > * {
		width: 100%;
		max-width: 720px;
		margin-inline: auto;
	}

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
