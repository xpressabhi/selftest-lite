'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the heavy renderer
const HeavyMarkdownRenderer = dynamic(() => import('./HeavyMarkdownRenderer'), {
	loading: () => <span className='text-muted'>Loading content...</span>,
	ssr: false,
});

/**
 * Heuristic to check if text needs markdown rendering.
 * Checks for:
 * - Common markdown syntax (*, _, #, `, >, -, [)
 * - Math delimiters ($, \\)
 * - HTML tags (<)
 */
function needsMarkdown(text) {
	if (!text || typeof text !== 'string') return false;
	// Check for common markdown indicators
	// This regex looks for:
	// - Headers (# )
	// - Bold/Italic (* or _)
	// - Code (` or ~)
	// - Blockquotes (>)
	// - Lists (- or + or * )
	// - Links ([)
	// - Math ($ or \)
	// - HTML (<)
	return /[*_#`>~\[\]$<\\]|(\n\s*[-+*]\s)/.test(text);
}

const MarkdownRenderer = ({ children }) => {
	// If children is not a string (e.g. array or object), treat it as complex
	// and use the heavy renderer to be safe, or join it if it's an array of strings.
	let textContent = '';
	if (typeof children === 'string') {
		textContent = children;
	} else if (Array.isArray(children)) {
		textContent = children.join('');
	} else {
		// Fallback for non-string children
		return <HeavyMarkdownRenderer>{children}</HeavyMarkdownRenderer>;
	}

	// Simple heuristic: if it looks like plain text, render it directly
	if (!needsMarkdown(textContent)) {
		return <span style={{ whiteSpace: 'pre-wrap' }}>{textContent}</span>;
	}

	// For complex content, use the heavy renderer
	// We use Suspense to handle the loading state
	return (
		<Suspense fallback={<span className='text-muted'>{textContent}</span>}>
			<HeavyMarkdownRenderer>{children}</HeavyMarkdownRenderer>
		</Suspense>
	);
};

export default MarkdownRenderer;
