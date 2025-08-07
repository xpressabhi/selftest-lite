'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './markdown-styles.css';

/**
 * A component that renders markdown content with support for:
 * - LaTeX mathematical formulas
 * - GitHub Flavored Markdown (tables, strikethrough, etc.)
 * - Chemical formulas and physics symbols via Unicode or LaTeX
 * - HTML content (for advanced formatting)
 */
const MarkdownRenderer = ({ children, className }) => {
  return (
    <div className={`markdown-content ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;