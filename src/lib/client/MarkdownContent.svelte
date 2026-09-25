<script>
	import { onDestroy, tick } from 'svelte';
	import { isDataSaverActive } from './preferences';
	import { t } from './i18n';
	import { prepareMathTextForRendering } from '$lib/shared/latex';

	let { content = '', tag = 'div', links = 'allow' } = $props();
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

	// Inside a <button> or other interactive host, anchors from model output
	// would be nested interactive elements, so render them as plain text.
	function stripLinks(value) {
		return String(value || '').replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, '$1');
	}

	function needsRichRenderer(value) {
		return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|```)|\*\*|(?<!\*)\*(?!\s)[^*\n]+?(?<!\s)\*(?!\*)|__|~~|`|\[[^\]]+\]\([^)]*\)|\$\$?|\|.+\|/m.test(
			value
		);
	}

	function hasMath(value) {
		return /\$\$?|\\\(|\\\[|\\begin\{|\\(?:frac|dfrac|tfrac|sqrt|binom|vec|hat|bar|overline|underline|mathrm|mathbf|mathbb|mathcal|infty|pm|mp|cdot|times|leq|geq|neq|approx|sum|prod|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|pi|sigma|omega|circ|Delta|Sigma|Omega|begin|end)\b|(?:[A-Za-z0-9)])\s*[\^_]\s*(?:\{[^{}]*\}|[A-Za-z0-9])/.test(
			value
		);
	}

	function hasMermaid(value) {
		return /```mermaid\b/i.test(value);
	}

	async function renderMarkdown(value, shouldStripLinks) {
		const normalizedValue = prepareMathTextForRendering(value || '');
		if (needsRichRenderer(normalizedValue)) {
			if (hasMath(normalizedValue)) {
				await import('$lib/styles/katex.css');
			}
			const { renderRichMarkdown } = await import('./markdownRenderer.js');
			const rendered = await renderRichMarkdown(normalizedValue);
			html = shouldStripLinks ? stripLinks(rendered) : rendered;
		} else {
			html = escapeHtml(normalizedValue).replaceAll('\n', '<br>');
		}
		await tick();
		if (hasMermaid(normalizedValue)) {
			renderMermaid();
		}
	}

	async function renderMermaid() {
		if (!containerElement) {
			return;
		}
		const mermaidBlocks = [...containerElement.querySelectorAll('pre > code.language-mermaid')];
		if (mermaidBlocks.length === 0) {
			return;
		}
		mermaidObserver?.disconnect();
		const render = async (blocks, force = false) => {
			mermaidObserver?.disconnect();
			if ($isDataSaverActive && !force) {
				return;
			}
			const mermaidModule = await import('mermaid');
			const mermaid = mermaidModule.default;
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme:
					document.documentElement.getAttribute('data-bs-theme') === 'dark'
						? 'dark'
						: 'default',
			});
			await Promise.all(
				blocks.map(async (block, index) => {
					const chart = block.textContent || '';
					const wrapper = document.createElement('div');
					wrapper.className = 'mermaid-diagram';
					try {
						const result = await mermaid.render(
							`selftest-mermaid-${Date.now()}-${index}`,
							chart
						);
						wrapper.innerHTML = result.svg;
						block.closest('pre')?.replaceWith(wrapper);
					} catch {
						const pre = block.closest('pre');
						if (pre) {
							pre.style.display = '';
							pre.classList.add('mermaid-error');
						}
					}
				})
			);
		};

		// Data saver: never ship the mermaid chunk automatically. Show a
		// tap-to-load placeholder so the diagram is still one tap away.
		if ($isDataSaverActive) {
			for (const block of mermaidBlocks) {
				const pre = block.closest('pre');
				if (!pre || pre.dataset.mermaidPlaceholder === '1') {
					continue;
				}
				pre.dataset.mermaidPlaceholder = '1';
				pre.style.display = 'none';
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'mermaid-load-btn';
				button.textContent = $t('loadDiagram');
				button.addEventListener('click', () => {
					button.remove();
					void render([block], true);
				});
				pre.after(button);
			}
			return;
		}

		if (!('IntersectionObserver' in window)) {
			await render(mermaidBlocks);
			return;
		}

		mermaidObserver = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					void render(mermaidBlocks);
				}
			},
			{ rootMargin: '240px 0px' }
		);
		mermaidObserver.observe(containerElement);
	}

	let renderedContent = '';
	let renderedLinks = null;
	let rendering = false;
	let rerenderQueued = false;

	async function renderCurrent() {
		const rawContent = String(content || '');
		const rawLinks = links;
		if (rendering) {
			// A newer value arrived mid-render; render it once this pass ends.
			rerenderQueued = true;
			return;
		}
		if (rawContent === renderedContent && rawLinks === renderedLinks) {
			return;
		}
		rendering = true;
		try {
			await renderMarkdown(rawContent, rawLinks === 'text');
			renderedContent = rawContent;
			renderedLinks = rawLinks;
		} finally {
			rendering = false;
		}
		if (rerenderQueued) {
			rerenderQueued = false;
			void renderCurrent();
		}
	}

	$effect(() => {
		void renderCurrent();
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

	.markdown-content :global(img) {
		max-width: 100%;
		height: auto;
	}

	.markdown-content :global(table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
	}

	.markdown-content :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		padding: 0.75rem;
		border-radius: var(--radius-control);
		background: var(--surface-muted, #f8f9fa);
	}

	.markdown-content :global(code) {
		white-space: break-spaces;
	}

	.markdown-content :global(.katex) {
		display: inline-block;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.markdown-content :global(.mermaid-diagram) {
		overflow-x: auto;
		padding: 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
	}

	.markdown-content :global(.mermaid-diagram svg) {
		max-width: 100%;
		height: auto;
	}

	.markdown-content :global(.mermaid-load-btn) {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 10px 12px;
		border: 1px dashed var(--line);
		border-radius: var(--radius-control);
		background: var(--surface-muted, #f8f9fa);
		color: var(--text);
		font-size: 0.85rem;
		cursor: pointer;
	}
</style>
