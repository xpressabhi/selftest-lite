<script>
	import { t } from '$lib/client/i18n';
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
			{#if trace.phase === 'ready'}
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
				</svg>
			{:else}
				<i></i>
				<i></i>
				<i></i>
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
				<span class="step-dot" aria-hidden="true">
					<span class="step-arc"></span>
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
		border-radius: 0.75rem;
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
		gap: 3px;
		min-width: 14px;
		justify-content: center;
	}

	.trace-spark i {
		width: 5px;
		height: 5px;
		border-radius: 999px;
		background: var(--brand-text);
		animation: trace-breathe 1.4s ease-in-out infinite;
	}

	.trace-spark i:nth-child(2) {
		animation-delay: 0.18s;
	}

	.trace-spark i:nth-child(3) {
		animation-delay: 0.36s;
	}

	.trace-spark svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: var(--success, #16a34a);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		animation: trace-pop var(--motion-slow) var(--ease-commit);
	}

	.trace-spark.spark-failed i {
		background: var(--danger, #dc2626);
		animation: trace-shake 0.3s ease-in-out;
	}

	@keyframes trace-breathe {
		0%,
		80%,
		100% {
			opacity: 0.25;
			transform: scale(0.7);
		}
		40% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes trace-pop {
		0% {
			transform: scale(0.5);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes trace-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(-2px);
		}
		75% {
			transform: translateX(2px);
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

	.step-arc {
		position: absolute;
		inset: -1.5px;
		border-radius: 999px;
		border: 1.5px solid transparent;
		border-top-color: var(--brand-text);
		opacity: 0;
	}

	.trace-step.is-running .step-arc {
		opacity: 1;
		animation: trace-spin 0.9s linear infinite;
	}

	.step-check {
		position: absolute;
		left: 2.5px;
		top: 3.5px;
		width: 6px;
		height: 3.5px;
		border-left: 1.5px solid var(--success, #16a34a);
		border-bottom: 1.5px solid var(--success, #16a34a);
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

	@keyframes trace-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Data saver: keep the state visible but stop the decorative loops. */
	:global(html.data-saver) .trace-spark i,
	:global(html.data-saver) .trace-step.is-running .step-arc {
		animation: none;
	}

	:global(html.data-saver) .trace-step.is-running .step-arc {
		border-top-color: var(--brand-text);
		border-right-color: var(--brand-text);
	}
</style>
