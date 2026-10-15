<script>
	import ArtifactFrame from './ArtifactFrame.svelte';
	import ExplainerHeader from './ExplainerHeader.svelte';
	import { activeLanguage, t } from './i18n';
	import { shareLink } from './shareLink.js';
	import { track } from './telemetry.js';
	import { localizedPath } from '#lib/shared/seo.js';

	// The review card's visual section: the one place a generated artifact is
	// built and embedded inside the results page. It renders only what the
	// page's state hands it; the build and library requests live in
	// src/routes/results/+page.svelte, and `hidden` renders nothing at all.
	let { status = 'hidden', stage = '', artifact = null, error = '', onBuild, onShow } = $props();

	const publicPath = $derived(
		artifact?.slug ? localizedPath(`/explain/${artifact.slug}`, $activeLanguage) : ''
	);

	async function share() {
		if (!artifact?.slug) {
			return;
		}
		// Same absolute public URL the playground shares, built from the
		// localized path so a Hindi reader shares the Hindi twin.
		const url =
			typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : publicPath;
		const method = await shareLink({ title: artifact.title, text: artifact.summary, url });
		track('results:visual-share', { method });
	}
</script>

{#if status === 'offer' || status === 'available' || status === 'building' || status === 'ready' || status === 'error'}
	<section class="visual-explainer no-print">
		{#if status === 'ready' && artifact}
			<div class="visual-explainer-header">
				<ExplainerHeader title={artifact.title} summary={artifact.summary}>
					{#if artifact.slug}
						<button
							class="btn btn-sm btn-outline-secondary"
							type="button"
							onclick={() => void share()}
						>
							{$t('playgroundShare')}
						</button>
					{/if}
					{#if artifact.slug}
						<a class="btn btn-sm btn-outline-secondary" href={publicPath}
							>{$t('visualOpenPage')}</a
						>
					{/if}
				</ExplainerHeader>
			</div>
			<div class="visual-explainer-frame">
				<ArtifactFrame html={artifact.html} title={artifact.title} />
			</div>
		{:else}
			<h3 class="visual-explainer-heading">{$t('visualExplainHeading')}</h3>
			{#if status === 'offer'}
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={onBuild}>
					{$t('visualBuild')}
				</button>
			{:else if status === 'available'}
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={onShow}>
					{$t('visualShow')}
				</button>
			{:else if status === 'building'}
				<p class="visual-explainer-stage" role="status">
					<span class="thinking-dots" aria-hidden="true"
						><span></span><span></span><span></span></span
					>
					<span class="ms-2"
						>{$t(
							stage === 'drawing' ? 'playgroundDrawing' : 'playgroundPlanning'
						)}</span
					>
				</p>
			{:else if status === 'error'}
				<p class="text-danger small mb-2" role="status">{error}</p>
				<button class="btn btn-sm btn-outline-danger" type="button" onclick={onBuild}>
					{$t('tryAgain')}
				</button>
			{/if}
		{/if}
	</section>
{/if}

<style>
	.visual-explainer {
		display: grid;
		gap: 8px;
		justify-items: start;
		margin-top: 12px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
	}

	.visual-explainer-heading {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.visual-explainer-stage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.visual-explainer-frame {
		width: 100%;
	}

	.visual-explainer-header {
		width: 100%;
	}

	@media print {
		.no-print {
			display: none !important;
		}
	}
</style>
