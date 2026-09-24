<script>
	import { t } from '$lib/client/i18n';
	import Icon from '$lib/client/Icon.svelte';
	import { deriveGenerationTrace } from '$lib/client/generationTrace.js';

	let { progress = null, elapsedSeconds = 0, done = false, failed = false, onCancel = null } = $props();

	const STEP_LABEL_KEYS = {
		reading: 'genTraceReading',
		drafting: 'genTraceDrafting',
		refining: 'genTraceRefining',
		assembling: 'genTraceAssembling',
	};

	const trace = $derived(deriveGenerationTrace(progress, { done }));

	const detail = $derived.by(() => {
		if (trace.phase === 'ready') {
			return ` · ${$t('genTraceReadyDetail', {
				count: trace.counts.approved,
				seconds: elapsedSeconds,
			})}`;
		}
		if (trace.currentId === 'drafting' || trace.currentId === 'refining') {
			const parts = [];
			if (trace.counts.requested > 0) {
				parts.push(
					$t('genTraceProgress', {
						done: trace.counts.approved,
						total: trace.counts.requested,
					})
				);
			}
			if (trace.batch) {
				parts.push($t('genTraceBatch', { index: trace.batch.index, total: trace.batch.total }));
			}
			return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
		}
		return '';
	});
</script>

<div class="generation-trace">
	<p class="trace-headline" role="status" aria-live="polite">
		<span
			class="trace-spark"
			class:spark-ready={trace.phase === 'ready'}
			class:spark-failed={failed}
			aria-hidden="true"
		>
			{#if failed}
				<Icon name="alert" size={14} />
			{:else if trace.phase === 'ready'}
				<Icon name="check" size={14} />
			{/if}
		</span>
		<span class="trace-title">
			{trace.phase === 'ready' ? $t('genTraceReady') : $t(STEP_LABEL_KEYS[trace.currentId])}
			{#if detail}<span class="trace-detail">{detail}</span>{/if}
			{#if trace.phase === 'working'}<span class="trace-elapsed" aria-hidden="true">
					· {elapsedSeconds}s</span
				>{/if}
		</span>
		{#if onCancel && trace.phase === 'working'}
			<button class="btn btn-outline-secondary btn-sm trace-cancel" type="button" onclick={onCancel}>
				{$t('cancel')}
			</button>
		{/if}
	</p>
	<ol class="trace-steps">
		{#each trace.steps as step (step.id)}
			<li
				class="trace-step"
				class:is-running={step.status === 'running'}
				class:is-done={step.status === 'done'}
			>
				<span
					class="step-dot"
					class:ai-shimmer={step.status === 'running'}
					aria-hidden="true"
				>
					<span class="step-check"></span>
				</span>
				<span class="step-text">{$t(STEP_LABEL_KEYS[step.id])}</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.generation-trace {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
	}

	.trace-headline {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.9375rem;
	}

	.trace-title {
		color: var(--text);
		font-weight: 500;
	}

	.trace-detail,
	.trace-elapsed {
		color: var(--text-muted);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}

	.trace-cancel {
		margin-left: auto;
	}

	.trace-spark {
		display: inline-flex;
		align-items: center;
		min-width: 14px;
		justify-content: center;
		color: var(--ok);
	}

	.trace-spark.spark-failed {
		color: var(--danger);
	}

	.trace-spark :global(svg) {
		animation: trace-pop var(--motion-slow) var(--ease-commit);
	}

	@keyframes trace-pop {
		0% {
			transform: scale(0.5);
		}
		100% {
			transform: scale(1);
		}
	}

	.trace-steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.trace-step {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		transition: color var(--motion-slow) var(--ease-out);
	}

	.trace-step:not(.is-running):not(.is-done) {
		opacity: 0.55;
	}

	.trace-step.is-running {
		color: var(--text);
	}

	.step-dot {
		position: relative;
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		border: 1.5px solid currentColor;
		opacity: 0.55;
		flex: none;
	}

	.trace-step.is-done .step-dot {
		border-color: transparent;
		opacity: 1;
	}

	.trace-step.is-running .step-dot {
		border-color: transparent;
		opacity: 1;
	}

	.step-check {
		position: absolute;
		left: 2.5px;
		top: 3.5px;
		width: 6px;
		height: 3.5px;
		border-left: 1.5px solid var(--ok);
		border-bottom: 1.5px solid var(--ok);
		transform: rotate(-45deg) scale(0);
		opacity: 0;
		transition:
			transform var(--motion-fast) var(--ease-commit),
			opacity var(--motion-fast) linear;
	}

	.trace-step.is-done .step-check {
		transform: rotate(-45deg) scale(1);
		opacity: 1;
	}

	/* Data saver: keep the running state visible but stop the decorative loop. */
	:global(html.data-saver) .trace-step.is-running .step-dot.ai-shimmer {
		animation: none;
	}
</style>
