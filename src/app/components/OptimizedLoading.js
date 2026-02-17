'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Optimized Loading Component
 * - Simple, lightweight spinner
 * - Minimal DOM nodes
 * - GPU-accelerated animation
 * - Fallback text for screen readers
 * - Auto-hide after timeout to prevent stuck states
 *
 * @param {Object} props
 * @param {string} props.message - Loading message
 * @param {number} props.timeout - Auto-hide timeout in ms (default: 30000)
 * @param {Function} props.onTimeout - Callback when timeout is reached
 */
export default function OptimizedLoading({
	message,
	timeout = 30000,
	onTimeout,
}) {
	const { t } = useLanguage();
	const [showTimeout, setShowTimeout] = useState(false);
	const loadingMessage = message || t('loading');

	useEffect(() => {
		const timer = setTimeout(() => {
			setShowTimeout(true);
			onTimeout?.();
		}, timeout);

		return () => clearTimeout(timer);
	}, [timeout, onTimeout]);

	return (
		<div className="loading-container" role="status" aria-live="polite">
			<div className="loading-content">
				<div className="spinner" aria-hidden="true" />
				<p className="loading-text">{loadingMessage}</p>
				{showTimeout && (
					<button
						className="retry-btn"
						onClick={() => window.location.reload()}
						type="button"
					>
						{t('reloadPage')}
					</button>
				)}
			</div>
			<style jsx>{`
				.loading-container {
					display: flex;
					align-items: center;
					justify-content: center;
					min-height: 200px;
					padding: 24px;
				}

				.loading-content {
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 16px;
				}

				.spinner {
					width: 40px;
					height: 40px;
					border: 3px solid var(--bg-tertiary);
					border-top-color: var(--accent-primary);
					border-radius: 50%;
					animation: spin 0.8s linear infinite;
					will-change: transform;
				}

				@keyframes spin {
					to {
						transform: rotate(360deg);
					}
				}

				.loading-text {
					margin: 0;
					color: var(--text-muted);
					font-size: 0.875rem;
					text-align: center;
				}

				.retry-btn {
					padding: 8px 16px;
					background: var(--accent-primary);
					color: white;
					border: none;
					border-radius: var(--radius-md);
					font-size: 0.875rem;
					font-weight: 500;
					cursor: pointer;
					margin-top: 8px;
				}

				.retry-btn:active {
					opacity: 0.8;
				}

				/* Data saver - static spinner */
				:global(.data-saver) .spinner {
					animation: none;
					border-top-color: var(--bg-tertiary);
					background: conic-gradient(var(--accent-primary) 25%, var(--bg-tertiary) 0);
					mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.spinner {
						animation: none;
						border-top-color: var(--bg-tertiary);
						background: conic-gradient(var(--accent-primary) 25%, var(--bg-tertiary) 0);
						mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
					}
				}
			`}</style>
		</div>
	);
}
