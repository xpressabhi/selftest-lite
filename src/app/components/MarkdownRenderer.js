'use client';

import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './markdown-styles.css';

// We'll lazy-load the syntax highlighter only if a fenced code block with a
// language is encountered. This prevents bundling the heavy library on
// initial loads for users who don't need it.
function useLazySyntaxHighlighter() {
	const [Highlighter, setHighlighter] = useState(null);

	useEffect(() => {
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
	}, []);

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

const MarkdownRenderer = ({ children }) => {
	const normalized = useMemo(() => normalizeMarkdown(children), [children]);
	const Highlighter = useLazySyntaxHighlighter();

	// If the incoming markdown already contains KaTeX-generated HTML, skip
	// running rehype-katex to avoid producing duplicate KaTeX output.
	const containsKaTeXHtml = /<span\s+class=("|')katex\1/.test(normalized);
	const katexPlugin = [rehypeKatex, { output: 'mathml' }];
	const rehypePlugins = containsKaTeXHtml
		? [rehypeRaw]
		: [katexPlugin, rehypeRaw];

	return (
		<div className={`markdown-content`}>
			<ReactMarkdown
				remarkPlugins={[remarkMath, remarkGfm]}
				rehypePlugins={rehypePlugins}
				skipHtml={false}
				components={{
					code({ node, inline, className, children, ...props }) {
						const match = /language-(\w+)/.exec(className || '');
						const codeString = React.Children.toArray(children).join('');

						// If we have the highlighter loaded and it's a block with a language,
						// render the highlighter. Otherwise fallback to a lightweight pre/code.
						if (!inline && match && Highlighter) {
							const SyntaxHighlighter = Highlighter.Prism || Highlighter;
							return (
								<SyntaxHighlighter
									language={match[1]}
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

export default MarkdownRenderer;
