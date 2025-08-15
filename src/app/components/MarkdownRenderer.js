'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import './markdown-styles.css';

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
	return (
		<div className={`markdown-content`}>
			<ReactMarkdown
				remarkPlugins={[remarkMath, remarkGfm]}
				rehypePlugins={[rehypeKatex, rehypeRaw]}
				components={{
					code({ node, inline, className, children, ...props }) {
						const match = /language-(\w+)/.exec(className || '');
						const codeString = React.Children.toArray(children).join('');
						return !inline && match ? (
							<SyntaxHighlighter
								language={match[1]}
								PreTag='div'
								wrapLongLines={true}
								{...props}
							>
								{codeString}
							</SyntaxHighlighter>
						) : (
							<code className={className} {...props}>
								{codeString}
							</code>
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
