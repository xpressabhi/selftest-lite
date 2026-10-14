<script>
	import { onMount } from 'svelte';
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
	let stageTimer = null;
	let library = $state([]);

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
			if (stageTimer !== null) {
				clearInterval(stageTimer);
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
			track('playground:library-item-open', { id });
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

			{#if library.length > 0}
				<div class="playground-library mt-4">
					<h2 class="h6 text-muted mb-2">{$t('playgroundLibraryTitle')}</h2>
					<ul class="list-unstyled mb-0 d-grid gap-2">
						{#each library as item (item.id)}
							<li>
								<button
									type="button"
									class="playground-library-item"
									disabled={status === 'loading'}
									onclick={() => void openLibraryItem(item.id)}
								>
									<span class="playground-library-title">{item.title || item.concept}</span>
									<span class="playground-library-meta">
										{item.concept}
										{#if item.lastOpenedAt}· {formatLibraryDate(item.lastOpenedAt)}{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
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
</style>
