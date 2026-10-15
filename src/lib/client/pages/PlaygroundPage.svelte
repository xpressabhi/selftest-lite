<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArtifactFrame from '#lib/client/ArtifactFrame.svelte';
	import { getClientHeaders } from '#lib/client/identity.js';
	import { activeLanguage, localizedApiError, t } from '#lib/client/i18n.js';
	import ExplainerHeader from '#lib/client/ExplainerHeader.svelte';
	import SeoHead from '#lib/client/SeoHead.svelte';
	import { shareLink } from '#lib/client/shareLink.js';
	import { track } from '#lib/client/telemetry.js';
	import { bucketClientProfile } from '#lib/shared/playgroundProfile.js';
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
	let refusalCategory = $state('');
	let stageTimers = [];
	let library = $state([]);
	let searchQuery = $state('');
	let searchResults = $state(null);
	let searching = $state(false);
	let searchTimer = null;
	let searchSequence = 0;

	const visibleItems = $derived(searchQuery.trim() ? (searchResults ?? []) : library);

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
		void loadLibrary();
		// Keep the recent list honest when the tab is restored (bfcache / app
		// switch on a phone), where no load happens but time has passed.
		const onVisibility = () => {
			if (document.visibilityState === 'visible' && status === 'idle') {
				void loadLibrary();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			clearStageTimers();
			if (searchTimer !== null) {
				clearTimeout(searchTimer);
			}
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	// Coarse capability buckets only — no user agent, no fingerprint. The
	// server puts the buckets in the cache key, so each device class gets an
	// artifact that fits it (and shares it with its class).
	function currentDeviceProfile() {
		if (typeof window === 'undefined') {
			return { viewport: 'wide', budget: 'full' };
		}
		const connection =
			typeof navigator !== 'undefined'
				? navigator.connection || navigator.mozConnection || navigator.webkitConnection
				: undefined;
		return bucketClientProfile({
			width: window.innerWidth,
			reducedMotion:
				typeof window.matchMedia === 'function'
					? window.matchMedia('(prefers-reduced-motion: reduce)').matches
					: false,
			saveData: connection?.saveData === true,
			effectiveType: connection?.effectiveType,
			deviceMemory: typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined,
			hardwareConcurrency:
				typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
		});
	}

	async function generate() {
		const trimmedTopic = topic.trim();
		if (!trimmedTopic || status === 'loading') {
			return;
		}
		clearStageTimers();
		status = 'loading';
		stage = 'judging';
		refusalCategory = '';
		errorMessage = '';
		// Coarse, honest stages: the judge runs first, then two model calls, and
		// we know the order, not the progress; the copy flips twice so waiting
		// feels bounded, no fake bars.
		stageTimers = [
			setTimeout(() => {
				stage = 'planning';
			}, 2000),
			setTimeout(() => {
				stage = 'drawing';
			}, 7000),
		];

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
				headers: getClientHeaders(),
				body: JSON.stringify({
					topic: trimmedTopic,
					question: context.question || undefined,
					answer: context.answer || undefined,
					language: $activeLanguage,
					theme,
					profile: currentDeviceProfile(),
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (response.ok && payload.code === 'VISUAL_NOT_WORTHY') {
				// The judge decided a visual would not help: this is guidance,
				// not an error. Show the category hint and leave the topic
				// editable so the user can refine it and try again, and skip
				// the generate-result event because nothing was generated.
				status = 'refused';
				refusalCategory = payload.category ?? '';
				track('playground:judge-declined', { category: payload.category });
				return;
			}
			if (!response.ok) {
				// Localized copy comes from the shared error-code map, never the
				// server's English message (bilingual UI is mandatory).
				const failure = new Error(localizedApiError(payload, $t, response.status));
				failure.localized = true;
				throw failure;
			}
			artifact = payload;
			status = 'ready';
			track('playground:generate-result', {
				status: 'ok',
				cached: payload.cached === true,
				durationMs: Date.now() - startedAt,
				recipes: payload.recipes,
			});
			// The new explainer now belongs to this identity's library; keep
			// the idle-state list current for the next visit.
			void loadLibrary();
		} catch (error) {
			status = 'error';
			// A network failure has no server payload; the localized headline
			// carries the message.
			errorMessage = error?.localized === true ? error.message : '';
			track('playground:generate-result', {
				status: 'error',
				cached: false,
				durationMs: Date.now() - startedAt,
			});
		} finally {
			clearStageTimers();
		}
	}

	function clearStageTimers() {
		for (const timer of stageTimers) {
			clearTimeout(timer);
		}
		stageTimers = [];
	}

	function reset() {
		status = 'idle';
		artifact = null;
		errorMessage = '';
		refusalCategory = '';
	}

	// The library is an enhancement: any failure leaves it hidden rather than
	// blocking the page.
	async function loadLibrary() {
		try {
			const response = await fetch('/api/playground/library', {
				headers: getClientHeaders(),
				cache: 'no-store',
			});
			if (!response.ok) {
				return;
			}
			const payload = await response.json().catch(() => ({}));
			library = Array.isArray(payload.items) ? payload.items : [];
		} catch {
			// Keep the previous list; nothing to surface.
		}
	}

	async function openLibraryItem(id) {
		if (status === 'loading') {
			return;
		}
		status = 'loading';
		errorMessage = '';
		try {
			const theme =
				typeof document !== 'undefined'
					? document.documentElement.getAttribute('data-bs-theme') || 'light'
					: 'light';
			const response = await fetch(`/api/playground/library?id=${id}&theme=${theme}`, {
				headers: getClientHeaders(),
				cache: 'no-store',
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const failure = new Error(localizedApiError(payload, $t, response.status));
				failure.localized = true;
				throw failure;
			}
			artifact = payload;
			status = 'ready';
			track('playground:library-item-open', { id, mine: true });
		} catch (error) {
			status = 'error';
			errorMessage = error?.localized === true ? error.message : '';
		}
	}

	function formatLibraryDate(value) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return '';
		}
		return date.toLocaleDateString($activeLanguage === 'hindi' ? 'hi-IN' : 'en-IN', {
			day: 'numeric',
			month: 'short',
		});
	}

	// Search spans the caller's own explainers and every already-generated
	// public one, so an existing artifact can always be replayed instead of
	// spending tokens on a new generation.
	function scheduleSearch() {
		if (searchTimer !== null) {
			clearTimeout(searchTimer);
		}
		if (!searchQuery.trim()) {
			searchResults = null;
			searching = false;
			return;
		}
		searchTimer = setTimeout(() => {
			searchTimer = null;
			void runSearch(searchQuery.trim());
		}, 350);
	}

	async function runSearch(term) {
		const sequence = ++searchSequence;
		searching = true;
		try {
			const response = await fetch(`/api/playground/library?q=${encodeURIComponent(term)}`, {
				headers: getClientHeaders(),
				cache: 'no-store',
			});
			if (!response.ok || sequence !== searchSequence) {
				return;
			}
			const payload = await response.json().catch(() => ({}));
			searchResults = Array.isArray(payload.items) ? payload.items : [];
		} catch {
			// Keep the previous results; search is an enhancement.
		} finally {
			if (sequence === searchSequence) {
				searching = false;
			}
		}
	}

	async function openItem(item) {
		if (item.mine && item.id) {
			await openLibraryItem(item.id);
			return;
		}
		if (!item.slug) {
			return;
		}
		track('playground:library-item-open', { id: null, mine: false });
		await goto(localizedPath(`/explain/${item.slug}`, $activeLanguage));
	}

	async function shareCurrentExplainer() {
		if (!artifact?.slug) {
			return;
		}
		const publicPath = localizedPath(`/explain/${artifact.slug}`, $activeLanguage);
		const url =
			typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : publicPath;
		const method = await shareLink({ title: artifact.title, text: artifact.summary, url });
		track('playground:share', { surface: 'result', method });
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
		<div class="mt-4">
			<ExplainerHeader title={artifact.title} summary={artifact.summary}>
				{#if artifact.slug}
					<button
						class="btn btn-sm btn-outline-secondary"
						type="button"
						onclick={() => void shareCurrentExplainer()}
					>
						{$t('playgroundShare')}
					</button>
				{/if}
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={reset}>
					{$t('playgroundNewConcept')}
				</button>
			</ExplainerHeader>
			<div class="mt-3">
				<ArtifactFrame html={artifact.html} title={artifact.title} />
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
					<span class="ms-2"
						>{$t(
							stage === 'judging'
								? 'playgroundJudging'
								: stage === 'drawing'
									? 'playgroundDrawing'
									: 'playgroundPlanning'
						)}</span
					>
				{:else}
					{$t('playgroundGenerate')}
				{/if}
			</button>

			{#if status === 'refused'}
				<div class="playground-refusal mt-3" role="status">
					<p class="fw-semibold mb-1">{$t('visualFitNotWorthyTitle')}</p>
					<p class="small mb-0">
						{$t(
							refusalCategory === 'too_vague' ? 'visualFitVagueHint' : 'visualFitTextFirstHint'
						)}
					</p>
				</div>
			{/if}

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

			<div class="playground-library mt-4">
				<label class="visually-hidden" for="playground-search">{$t('playgroundSearchLabel')}</label>
				<input
					id="playground-search"
					class="form-control"
					type="search"
					autocomplete="off"
					maxlength="80"
					placeholder={$t('playgroundSearchPlaceholder')}
					disabled={status === 'loading'}
					bind:value={searchQuery}
					oninput={scheduleSearch}
				/>
				{#if visibleItems.length > 0}
					<h2 class="h6 text-muted mt-3 mb-2">
						{searchQuery.trim() ? $t('playgroundSearchResults') : $t('playgroundLibraryTitle')}
					</h2>
					<ul class="list-unstyled mb-0 d-grid gap-2">
						{#each visibleItems as item (item.mine ? `mine-${item.id}` : `public-${item.slug}`)}
							<li class="playground-library-row">
								<button
									type="button"
									class="playground-library-item"
									disabled={status === 'loading'}
									onclick={() => void openItem(item)}
								>
									<span class="playground-library-title">
										{item.title || item.concept}
										{#if !item.mine}
											<span class="playground-library-badge">{$t('playgroundPublicBadge')}</span>
										{/if}
									</span>
									<span class="playground-library-meta">
										{item.concept}
										{#if item.createdAt}· {formatLibraryDate(item.createdAt)}{/if}
									</span>
								</button>
								{#if item.source}
									<!-- The provenance chip is a sibling of the row button, never a
									descendant: interactive content inside a button is invalid
									markup and pollutes the row's accessible name. -->
									<a
										class="playground-library-source"
										href={`/results?id=${encodeURIComponent(item.source.testId)}#question-${item.source.questionIndex}`}
										>{$t('playgroundFromYourTest')}</a
									>
								{/if}
							</li>
						{/each}
					</ul>
				{:else if searchQuery.trim() && !searching}
					<p class="text-muted small mb-0 mt-3">{$t('playgroundSearchEmpty')}</p>
				{/if}
			</div>
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

	.playground-library-item {
		display: block;
		width: 100%;
		text-align: left;
		min-height: 44px;
		padding: 10px 12px;
		background: var(--surface, #ffffff);
		border: 1px solid var(--line, #e2e8f0);
		border-radius: var(--radius-surface, 12px);
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.playground-library-item:hover {
		border-color: var(--brand-text, #4f46e5);
	}

	.playground-library-item:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.playground-library-title {
		display: block;
		font-weight: 600;
	}

	.playground-library-meta {
		display: block;
		margin-top: 2px;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.playground-refusal {
		padding: 12px 14px;
		background: var(--surface-muted, #f8fafc);
		border: 1px solid var(--line, #e2e8f0);
		border-left: 4px solid var(--brand-text, #4f46e5);
		border-radius: var(--radius-surface, 12px);
	}

	.playground-library-badge {
		display: inline-block;
		margin-left: 6px;
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 0.7rem;
		font-weight: 500;
		vertical-align: middle;
	}

	.playground-library-row {
		display: grid;
		gap: 6px;
	}

	.playground-library-source {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		min-height: 44px;
		margin-left: 12px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--brand-text, #4f46e5);
		font-size: 0.78rem;
		font-weight: 600;
		text-decoration: none;
	}

	.playground-library-source:hover {
		border-color: var(--brand-text, #4f46e5);
	}
</style>
