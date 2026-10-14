<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ArtifactFrame from '#lib/client/ArtifactFrame.svelte';
	import { activeLanguage, t } from '#lib/client/i18n.js';
	import SeoHead from '#lib/client/SeoHead.svelte';
	import { track } from '#lib/client/telemetry.js';
	import { localizedPath } from '#lib/shared/seo.js';

	// Concept playground: a topic in, an animated self-contained HTML explainer
	// out. Deep links from the results review card prefill the topic and the
	// question context, but never auto-generate — generation is explicit and
	// cache-first on the server.

	let topic = $state('');
	let context = $state({ question: '', answer: '' });
	let status = $state('idle');
	let stage = $state('planning');
	let artifact = $state(null);
	let errorMessage = $state('');
	let stageTimer = null;

	const examples = $derived([
		$t('playgroundExample1'),
		$t('playgroundExample2'),
		$t('playgroundExample3'),
		$t('playgroundExample4'),
	]);
	const hasContext = $derived(Boolean(context.question || context.answer));
	const contextPreview = $derived(
		context.question.length > 160 ? `${context.question.slice(0, 160)}…` : context.question
	);

	onMount(() => {
		const params = page.url.searchParams;
		topic = params.get('topic') ?? '';
		context = {
			question: params.get('question') ?? '',
			answer: params.get('answer') ?? '',
		};
		track('playground:open', { hasContext: Boolean(context.question || context.answer) });
		return () => {
			if (stageTimer !== null) {
				clearInterval(stageTimer);
			}
		};
	});

	async function generate() {
		const trimmedTopic = topic.trim();
		if (!trimmedTopic || status === 'loading') {
			return;
		}
		status = 'loading';
		stage = 'planning';
		errorMessage = '';
		// Coarse, honest stages: we know there are two model calls, not their
		// progress; the copy flips once so waiting feels bounded, no fake bars.
		stageTimer = setInterval(() => {
			stage = 'drawing';
		}, 5000);

		const startedAt = Date.now();
		track('playground:generate-requested', {
			language: $activeLanguage,
			hasContext,
		});

		try {
			const theme =
				typeof document !== 'undefined'
					? document.documentElement.getAttribute('data-bs-theme') || 'light'
					: 'light';
			const response = await fetch('/api/playground', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topic: trimmedTopic,
					question: context.question || undefined,
					answer: context.answer || undefined,
					language: $activeLanguage,
					theme,
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload.error || $t('playgroundErrorIntro'));
			}
			artifact = payload;
			status = 'ready';
			track('playground:generate-result', {
				status: 'ok',
				cached: payload.cached === true,
				durationMs: Date.now() - startedAt,
				recipes: payload.recipes,
			});
		} catch (error) {
			status = 'error';
			errorMessage = error?.message || '';
			track('playground:generate-result', {
				status: 'error',
				cached: false,
				durationMs: Date.now() - startedAt,
			});
		} finally {
			if (stageTimer !== null) {
				clearInterval(stageTimer);
				stageTimer = null;
			}
		}
	}

	function reset() {
		status = 'idle';
		artifact = null;
		errorMessage = '';
	}
</script>

<SeoHead
	path={localizedPath('/playground', $activeLanguage)}
	lang={$activeLanguage}
	title={`${$t('playgroundTitle')} | selftest.in`}
	description={$t('playgroundIntro')}
/>

<section class="app-container py-4 py-md-5">
	<header class="playground-head">
		<h1>{$t('playgroundTitle')}</h1>
		<p class="text-muted mb-0">{$t('playgroundIntro')}</p>
	</header>

	{#if status === 'ready' && artifact}
		<div class="card border shadow-sm mt-4">
			<div class="card-body">
				<h2 class="h5 mb-1">{artifact.title}</h2>
				<p class="text-muted small mb-3">{artifact.summary}</p>
				<ArtifactFrame html={artifact.html} title={artifact.title} />
				<button class="btn btn-sm btn-outline-secondary mt-3" type="button" onclick={reset}>
					{$t('playgroundNewConcept')}
				</button>
			</div>
		</div>
	{:else}
		<form
			class="playground-form mt-4"
			onsubmit={(event) => {
				event.preventDefault();
				void generate();
			}}
		>
			<label class="form-label fw-semibold" for="playground-topic">
				{$t('playgroundTopicLabel')}
			</label>
			<input
				id="playground-topic"
				class="form-control form-control-lg"
				type="text"
				maxlength="500"
				autocomplete="off"
				placeholder={$t('playgroundTopicPlaceholder')}
				disabled={status === 'loading'}
				bind:value={topic}
			/>

			{#if context.question}
				<details class="playground-context mt-3">
					<summary>{$t('playgroundFromYourQuestion')}</summary>
					<p class="small text-muted mb-0 mt-2">{contextPreview}</p>
				</details>
			{/if}

			<div class="playground-examples mt-3">
				<span class="small text-muted">{$t('playgroundExamplesLabel')}</span>
				<div class="d-flex flex-wrap gap-2 mt-1">
					{#each examples as example (example)}
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary"
							disabled={status === 'loading'}
							onclick={() => {
								topic = example;
							}}
						>
							{example}
						</button>
					{/each}
				</div>
			</div>

			<button
				type="submit"
				class="btn btn-primary btn-lg mt-4"
				disabled={!topic.trim() || status === 'loading'}
			>
				{#if status === 'loading'}
					<span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
					<span class="ms-2">{$t(stage === 'drawing' ? 'playgroundDrawing' : 'playgroundPlanning')}</span>
				{:else}
					{$t('playgroundGenerate')}
				{/if}
			</button>

			{#if status === 'error'}
				<div class="alert alert-danger mt-3" role="status">
					<p class="mb-1">{$t('playgroundErrorIntro')}</p>
					{#if errorMessage}
						<p class="small mb-2">{errorMessage}</p>
					{/if}
					<button
						type="button"
						class="btn btn-sm btn-outline-danger"
						onclick={() => void generate()}
					>
						{$t('tryAgain')}
					</button>
				</div>
			{/if}
		</form>
	{/if}
</section>

<style>
	.playground-head h1 {
		font-size: 1.6rem;
	}

	.playground-form {
		max-width: 640px;
	}

	.playground-context summary {
		cursor: pointer;
		font-weight: 600;
	}
</style>
