'use client';

import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import './markdown-styles.css';

// We'll lazy-load the syntax highlighter only if a fenced code block with a
// language is encountered. This prevents bundling the heavy library on
// initial loads for users who don't need it.
function useLazySyntaxHighlighter(enabled) {
	const [Highlighter, setHighlighter] = useState(null);

	useEffect(() => {
		if (!enabled) return;

		let mounted = true;
		const maybeLoad = async () => {
			try {
				const mod = await import('react-syntax-highlighter');
				// prefer Prism if available
				const { Prism } = mod;
				if (mounted) setHighlighter(() => Prism || mod.default || null);
			} catch (e) {
				// ignore; we'll fallback to pre/code
			}
		};
		maybeLoad();
		return () => {
			mounted = false;
		};
	}, [enabled]);

	return Highlighter;
}

/**
 * Normalize atypical markdown like "A. ```js" => "A.\n```js" so
 * that fenced code blocks are recognized by react-markdown.
 */
function normalizeMarkdown(input) {
	const text = Array.isArray(input) ? input.join('') : String(input ?? '');
	let out = text;

	// Move fences to a new line when preceded by A./B./C./D.
	out = out.replace(
		/(^|\n)\s*([A-Da-d])\.\s*```(\w+)/g,
		(_m, p1, label, lang) => {
			const up = String(label).toUpperCase();
			return `${p1}${up}.\n\`\`\`${lang}`;
		},
	);

	// Ensure any fence that appears mid-line is on its own line (safety net for malformed input)
	out = out.replace(/([^\n])```/g, '$1\n```');

	return out;
}

function MermaidBlock({ chart }) {
	const [svg, setSvg] = useState('');

	useEffect(() => {
		let mounted = true;

		const renderMermaid = async () => {
			if (typeof document === 'undefined') return;
			if (document.documentElement.classList.contains('data-saver')) return;

			try {
				const mermaidModule = await import('mermaid');
				const mermaid = mermaidModule.default;
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: 'strict',
					theme: 'default',
				});

				const id = `mmd-${Math.random().toString(36).slice(2)}`;
				const result = await mermaid.render(id, chart);
				if (mounted) {
					setSvg(result.svg);
				}
			} catch (_error) {
				// Fallback to plain code block on parse/runtime errors.
			}
		};

		renderMermaid();

		return () => {
			mounted = false;
		};
	}, [chart]);

	if (svg) {
		return (
			<div
				className='mermaid-diagram'
				aria-label='Rendered diagram'
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
		);
	}

	return (
		<pre style={{ whiteSpace: 'pre-wrap' }}>
			<code className='language-mermaid'>{chart}</code>
		</pre>
	);
}

const HeavyMarkdownRenderer = ({ children }) => {
	const normalized = useMemo(() => normalizeMarkdown(children), [children]);
	const hasLanguageCodeFence = useMemo(
		() => /```[\t ]*[a-zA-Z][\w-]*/.test(normalized),
		[normalized],
	);
	const Highlighter = useLazySyntaxHighlighter(hasLanguageCodeFence);
	const katexPlugin = [rehypeKatex, { output: 'mathml' }];

	return (
		<div className={`markdown-content`}>
			<ReactMarkdown
				remarkPlugins={[remarkMath, remarkGfm]}
				rehypePlugins={[katexPlugin]}
				skipHtml={true}
				components={{
					code({ inline, className, children, ...props }) {
						const match = /language-(\w+)/.exec(className || '');
						const codeString = React.Children.toArray(children).join('');
						const language = match?.[1]?.toLowerCase();

						if (!inline && language === 'mermaid') {
							return <MermaidBlock chart={codeString} />;
						}

						// If we have the highlighter loaded and it's a block with a language,
						// render the highlighter. Otherwise fallback to a lightweight pre/code.
						if (!inline && language && Highlighter) {
							const SyntaxHighlighter = Highlighter.Prism || Highlighter;
							return (
								<SyntaxHighlighter
									language={language}
									PreTag='div'
									wrapLongLines={true}
									{...props}
								>
									{codeString}
								</SyntaxHighlighter>
							);
						}
						return (
							<pre style={{ whiteSpace: 'pre-wrap' }}>
								<code className={className} {...props}>
									{codeString}
								</code>
							</pre>
						);
					},
				}}
			>
				{normalized}
			</ReactMarkdown>
		</div>
	);
};

export default HeavyMarkdownRenderer;
