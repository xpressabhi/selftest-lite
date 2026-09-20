<script>
	/**
	 * Accessible FAQ accordion.
	 *
	 * - Real buttons with aria-expanded/aria-controls; the answer panel is a
	 *   labelled region.
	 * - Deep links: every item has an anchor id (`faqAnchorId`) and opening an
	 *   item updates the URL hash without pushing history entries.
	 * - Answer copy with three keys renders the middle one emphasised.
	 */
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { t } from '$lib/client/i18n';
	import { faqAnchorId } from '$lib/data/faqs';

	let { items = [] } = $props();

	let openId = $state(null);

	onMount(() => {
		const hash = window.location.hash.replace('#', '');
		const match = items.find((item) => faqAnchorId(item.id) === hash);
		if (match) {
			openId = match.id;
			// Wait for the panel to render, then bring the question into view.
			requestAnimationFrame(() => {
				document.getElementById(faqAnchorId(match.id))?.scrollIntoView({ block: 'start' });
			});
		}
	});

	function toggle(item) {
		const next = openId === item.id ? null : item.id;
		openId = next;
		syncHash(next);
	}

	function syncHash(id) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.hash = id ? faqAnchorId(id) : '';
		// Router-aware replace: plain history.replaceState makes SvelteKit warn
		// and leaves its internal URL state stale.
		replaceState(url, {});
	}

	function answerParts(answerKeys) {
		return answerKeys.length === 3
			? { lead: answerKeys[0], highlight: answerKeys[1], rest: answerKeys[2] }
			: { lead: answerKeys[0], highlight: null, rest: null };
	}
</script>

<div class="faq-list">
	<noscript>
		<style>
			.faq-answer[hidden] {
				display: block !important;
			}
		</style>
	</noscript>
	{#each items as item (item.id)}
		{@const open = openId === item.id}
		{@const anchor = faqAnchorId(item.id)}
		{@const parts = answerParts(item.answerKeys)}
		<article class="faq-item" id={anchor}>
			<h3 class="faq-heading">
				<button
					type="button"
					class="faq-question"
					aria-expanded={open}
					aria-controls={`${anchor}-answer`}
					onclick={() => toggle(item)}
				>
					<span>{$t(item.questionKey)}</span>
					<svg
						class="faq-chevron"
						class:open
						width="18"
						height="18"
						viewBox="0 0 20 20"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M5 8l5 5 5-5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			</h3>
			<div
				class="faq-answer"
				id={`${anchor}-answer`}
				role="region"
				aria-labelledby={anchor}
				hidden={!open}
			>
				<p>
					{$t(parts.lead)}{#if parts.highlight}<strong>{$t(parts.highlight)}</strong>{/if}{#if parts.rest}{$t(parts.rest)}{/if}
				</p>
			</div>
		</article>
	{/each}
</div>

<style>
	.faq-list {
		display: grid;
		gap: 0.75rem;
	}

	.faq-item {
		border: 1px solid var(--line);
		border-radius: 0.9rem;
		background: var(--surface);
		overflow: hidden;
		scroll-margin-top: 5rem;
	}

	.faq-heading {
		margin: 0;
		font-size: 1rem;
	}

	.faq-question {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.9rem 1rem;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.faq-question:hover {
		background: var(--surface-muted);
	}

	.faq-chevron {
		flex-shrink: 0;
		color: var(--text-muted);
		transition: transform 0.18s ease-out;
	}

	.faq-chevron.open {
		transform: rotate(180deg);
	}

	.faq-answer {
		padding: 0 1rem 1rem;
	}

	.faq-answer p {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.65;
	}

	.faq-answer strong {
		color: var(--text);
	}
</style>
