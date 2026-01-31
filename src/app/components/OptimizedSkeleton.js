'use client';

/**
 * Optimized Skeleton Components
 * - Lightweight DOM structure
 * - Minimal animations (CSS-only)
 * - Reduced motion support
 * - Data saver mode support
 *
 * @param {Object} props
 * @param {string} props.variant - 'text' | 'card' | 'question' | 'form' | 'results'
 * @param {number} props.lines - Number of text lines (for text variant)
 * @param {string} props.className - Additional CSS classes
 */
export default function OptimizedSkeleton({ variant = 'text', lines = 1, className = '' }) {
	const renderSkeleton = () => {
		switch (variant) {
			case 'text':
				return (
					<div className="skeleton-text">
						{Array.from({ length: lines }).map((_, i) => (
							<div
								key={i}
								className="skeleton-line"
								style={{
									width: i === lines - 1 && lines > 1 ? '70%' : '100%',
								}}
							/>
							))}
					</div>
				);

			case 'card':
				return (
					<div className="skeleton-card">
						<div className="skeleton-header" />
						<div className="skeleton-body">
							<div className="skeleton-line" />
							<div className="skeleton-line" style={{ width: '80%' }} />
						</div>
					</div>
				);

			case 'question':
				return (
					<div className="skeleton-question">
						<div className="skeleton-badge" />
						<div className="skeleton-text">
							<div className="skeleton-line" />
							<div className="skeleton-line" />
						</div>
						<div className="skeleton-options">
							{[1, 2, 3, 4].map((i) => (
								<div key={i} className="skeleton-option" />
							))}
						</div>
					</div>
				);

			case 'form':
				return (
					<div className="skeleton-form">
						<div className="skeleton-title" />
						<div className="skeleton-subtitle" />
						<div className="skeleton-input" />
						<div className="skeleton-divider" />
						<div className="skeleton-textarea" />
						<div className="skeleton-button" />
					</div>
				);

			case 'results':
				return (
					<div className="skeleton-results">
						<div className="skeleton-score-circle" />
						<div className="skeleton-title" />
						<div className="skeleton-subtitle" />
						<div className="skeleton-question-list">
							{[1, 2, 3].map((i) => (
								<div key={i} className="skeleton-question-card" />
							))}
						</div>
					</div>
				);

			default:
				return <div className="skeleton-block" />;
		}
	};

	return (
		<div className={`skeleton-wrapper ${className}`} aria-hidden="true">
			{renderSkeleton()}
			<style jsx>{`
				.skeleton-wrapper {
					--skeleton-bg: var(--bg-tertiary);
					--skeleton-shimmer: var(--bg-secondary);
				}

				/* Base skeleton block */
				.skeleton-block,
				.skeleton-line,
				.skeleton-option,
				.skeleton-input,
				.skeleton-textarea,
				.skeleton-button,
				.skeleton-badge,
				.skeleton-header,
				.skeleton-title,
				.skeleton-subtitle,
				.skeleton-divider,
				.skeleton-score-circle,
				.skeleton-question-card {
					background: var(--skeleton-bg);
					border-radius: var(--radius-sm);
					animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
				}

				/* Text skeleton */
				.skeleton-text {
					display: flex;
					flex-direction: column;
					gap: 8px;
					width: 100%;
				}

				.skeleton-line {
					height: 16px;
				}

				/* Card skeleton */
				.skeleton-card {
					background: var(--bg-primary);
					border-radius: var(--radius-md);
					border: 1px solid var(--border-color);
					overflow: hidden;
				}

				.skeleton-header {
					height: 120px;
					border-radius: 0;
				}

				.skeleton-body {
					padding: 16px;
					display: flex;
					flex-direction: column;
					gap: 8px;
				}

				/* Question skeleton */
				.skeleton-question {
					background: var(--bg-primary);
					border-radius: var(--radius-lg);
					padding: 20px;
					box-shadow: var(--shadow-sm);
				}

				.skeleton-badge {
					width: 80px;
					height: 28px;
					margin-bottom: 12px;
				}

				.skeleton-options {
					margin-top: 20px;
					display: flex;
					flex-direction: column;
					gap: 12px;
				}

				.skeleton-option {
					height: 48px;
					border-radius: var(--radius-md);
				}

				/* Form skeleton */
				.skeleton-form {
					background: var(--bg-primary);
					border-radius: var(--radius-md);
					padding: 24px;
					border: 1px solid var(--border-color);
					max-width: 720px;
					margin: 0 auto;
				}

				.skeleton-title {
					height: 32px;
					width: 60%;
					margin: 0 auto 12px;
					border-radius: var(--radius-sm);
				}

				.skeleton-subtitle {
					height: 20px;
					width: 40%;
					margin: 0 auto 24px;
					border-radius: var(--radius-sm);
				}

				.skeleton-input {
					height: 48px;
					margin-bottom: 16px;
				}

				.skeleton-divider {
					height: 1px;
					margin: 24px 0;
				}

				.skeleton-textarea {
					height: 120px;
					margin-bottom: 16px;
				}

				.skeleton-button {
					height: 56px;
					width: 100%;
					border-radius: var(--radius-md);
				}

				/* Results skeleton */
				.skeleton-results {
					padding: 24px;
					max-width: 800px;
					margin: 0 auto;
					text-align: center;
				}

				.skeleton-score-circle {
					width: 140px;
					height: 140px;
					border-radius: 50%;
					margin: 0 auto 24px;
				}

				.skeleton-question-list {
					margin-top: 32px;
					display: flex;
					flex-direction: column;
					gap: 16px;
				}

				.skeleton-question-card {
					height: 200px;
					border-radius: var(--radius-md);
				}

				/* Animation */
				@keyframes pulse {
					0%, 100% {
						opacity: 1;
					}
					50% {
						opacity: 0.5;
					}
				}

				/* Data saver mode - static */
				:global(.data-saver) .skeleton-block,
				:global(.data-saver) .skeleton-line,
				:global(.data-saver) .skeleton-option,
				:global(.data-saver) .skeleton-input,
				:global(.data-saver) .skeleton-textarea,
				:global(.data-saver) .skeleton-button,
				:global(.data-saver) .skeleton-badge,
				:global(.data-saver) .skeleton-header,
				:global(.data-saver) .skeleton-title,
				:global(.data-saver) .skeleton-subtitle,
				:global(.data-saver) .skeleton-divider,
				:global(.data-saver) .skeleton-score-circle,
				:global(.data-saver) .skeleton-question-card {
					animation: none;
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.skeleton-block,
					.skeleton-line,
					.skeleton-option,
					.skeleton-input,
					.skeleton-textarea,
					.skeleton-button,
					.skeleton-badge,
					.skeleton-header,
					.skeleton-title,
					.skeleton-subtitle,
					.skeleton-divider,
					.skeleton-score-circle,
					.skeleton-question-card {
						animation: none;
					}
				}
			`}</style>
		</div>
	);
}
