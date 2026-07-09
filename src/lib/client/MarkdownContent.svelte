<script>
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { unified } from 'unified';
	import remarkParse from 'remark-parse';
	import remarkGfm from 'remark-gfm';
	import remarkMath from 'remark-math';
	import rehypeKatex from 'rehype-katex';
	import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
	import rehypeStringify from 'rehype-stringify';
	import remarkRehype from 'remark-rehype';
	import { isDataSaverActive } from './preferences';

	let { content = '' } = $props();
	let html = $state('');
	let containerElement = $state();

	const sanitizeSchema = {
		...defaultSchema,
		attributes: {
			...defaultSchema.attributes,
			code: [...(defaultSchema.attributes?.code || []), ['className', /^language-./]],
			span: [...(defaultSchema.attributes?.span || []), ['className']],
			div: [...(defaultSchema.attributes?.div || []), ['className']],
		},
	};

	async function renderMarkdown(value) {
		const file = await unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkMath)
			.use(remarkRehype)
			.use(rehypeSanitize, sanitizeSchema)
			.use(rehypeKatex)
			.use(rehypeStringify)
			.process(value || '');
		html = String(file);
		await tick();
		renderMermaid();
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

	onMount(() => {
		renderMarkdown(content);
	});

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
		background: var(--bs-tertiary-bg, #f8f9fa);
	}

	.markdown-content :global(code) {
		white-space: break-spaces;
	}

	.markdown-content :global(.mermaid-diagram) {
		overflow-x: auto;
		padding: 0.75rem;
		border: 1px solid var(--bs-border-color);
		border-radius: 0.5rem;
		background: var(--bs-body-bg);
	}

	.markdown-content :global(.mermaid-diagram svg) {
		max-width: 100%;
		height: auto;
	}
</style>
