<script>
import { onDestroy, tick } from 'svelte';
import { isDataSaverActive } from './preferences';
import { prepareMathTextForRendering } from '$lib/shared/latex';

	let { content = '', tag = 'div' } = $props();
	let html = $state('');
	let containerElement = $state();
	let mermaidObserver;

	function escapeHtml(value) {
		return String(value || '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	function needsRichRenderer(value) {
		return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|```)|\*\*|(?<!\*)\*(?!\s)[^*\n]+?(?<!\s)\*(?!\*)|__|~~|`|\[[^\]]+\]\([^)]*\)|\$\$?|\|.+\|/m.test(
			value,
		);
	}

	function hasMath(value) {
		return /\$\$?|\\\(|\\\[|\\begin\{|\\(?:frac|dfrac|tfrac|sqrt|binom|vec|hat|bar|overline|underline|mathrm|mathbf|mathbb|mathcal|infty|pm|mp|cdot|times|leq|geq|neq|approx|sum|prod|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|pi|sigma|omega|circ|Delta|Sigma|Omega|begin|end)\b|(?:[A-Za-z0-9)])\s*[\^_]\s*(?:\{[^{}]*\}|[A-Za-z0-9])/.test(value);
	}

	function hasMermaid(value) {
		return /```mermaid\b/i.test(value);
	}

	async function renderMarkdown(value) {
		const normalizedValue = prepareMathTextForRendering(value || '');
		if (needsRichRenderer(normalizedValue)) {
			if (hasMath(normalizedValue)) {
				await import('$lib/styles/katex.css');
			}
			const { renderRichMarkdown } = await import('./markdownRenderer.js');
			html = await renderRichMarkdown(normalizedValue);
		} else {
			html = escapeHtml(normalizedValue).replaceAll('\n', '<br>');
		}
		await tick();
		if (hasMermaid(normalizedValue)) {
			renderMermaid();
		}
	}

	async function renderMermaid() {
		if (!containerElement || $isDataSaverActive) {
			return;
		}
		const mermaidBlocks = [...containerElement.querySelectorAll('pre > code.language-mermaid')];
		if (mermaidBlocks.length === 0) {
			return;
		}
		mermaidObserver?.disconnect();
		const render = async () => {
			mermaidObserver?.disconnect();
			if ($isDataSaverActive) {
				return;
			}
		const mermaidModule = await import('mermaid');
		const mermaid = mermaidModule.default;
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'default',
		});
		await Promise.all(
			mermaidBlocks.map(async (block, index) => {
				const chart = block.textContent || '';
				const wrapper = document.createElement('div');
				wrapper.className = 'mermaid-diagram';
				try {
					const result = await mermaid.render(`selftest-mermaid-${Date.now()}-${index}`, chart);
					wrapper.innerHTML = result.svg;
					block.closest('pre')?.replaceWith(wrapper);
				} catch {
					block.closest('pre')?.classList.add('mermaid-error');
				}
			}),
		);
		};

		if (!('IntersectionObserver' in window)) {
			await render();
			return;
		}

		mermaidObserver = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					void render();
				}
			},
			{ rootMargin: '240px 0px' },
		);
		mermaidObserver.observe(containerElement);
	}

	$effect(() => {
		renderMarkdown(content);
	});

	onDestroy(() => {
		mermaidObserver?.disconnect();
	});
</script>

<svelte:element this={tag} class="markdown-content" bind:this={containerElement}>
	{@html html}
</svelte:element>

<style>
	.markdown-content :global(:first-child) {
		margin-top: 0;
	}

	.markdown-content :global(:last-child) {
		margin-bottom: 0;
	}

	.markdown-content :global(pre) {
		overflow-x: auto;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: var(--surface-muted, #f8f9fa);
	}

	.markdown-content :global(code) {
		white-space: break-spaces;
	}

	.markdown-content :global(.mermaid-diagram) {
		overflow-x: auto;
		padding: 0.75rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
	}

	.markdown-content :global(.mermaid-diagram svg) {
		max-width: 100%;
		height: auto;
	}
</style>
