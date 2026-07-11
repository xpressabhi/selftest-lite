<script>
	import { tick } from 'svelte';
	import { isDataSaverActive } from './preferences';

	let { content = '' } = $props();
	let html = $state('');
	let containerElement = $state();

	function escapeHtml(value) {
		return String(value || '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	function needsRichRenderer(value) {
		return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|```)|\*\*|__|~~|`|\[[^\]]+\]\([^)]*\)|\$\$?|\|.+\|/m.test(
			value,
		);
	}

	function hasMath(value) {
		return /\$\$?|\\\(|\\\[|\\begin\{/.test(value);
	}

	function hasMermaid(value) {
		return /```mermaid\b/i.test(value);
	}

	async function renderMarkdown(value) {
		if (needsRichRenderer(value || '')) {
			if (hasMath(value || '')) {
				await import('katex/dist/katex.min.css');
			}
			const { renderRichMarkdown } = await import('./markdownRenderer.js');
			html = await renderRichMarkdown(value);
		} else {
			html = escapeHtml(value).replaceAll('\n', '<br>');
		}
		await tick();
		if (hasMermaid(value || '')) {
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
	}

	$effect(() => {
		renderMarkdown(content);
	});
</script>

<div class="markdown-content" bind:this={containerElement}>
	{@html html}
</div>

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
