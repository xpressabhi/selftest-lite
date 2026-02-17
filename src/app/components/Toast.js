'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';

/**
 * Toast notification system
 * - Auto-dismiss after timeout
 * - Swipe to dismiss on mobile
 * - Reduced motion support
 * - Data saver mode support
 *
 * @param {Object} props
 * @param {string} props.id - Toast ID
 * @param {string} props.type - 'success' | 'error' | 'warning' | 'info'
 * @param {string} props.message - Toast message
 * @param {number} props.duration - Duration in ms (default: 5000)
 * @param {Function} props.onDismiss - Dismiss callback
 */
export default function Toast({ id, type = 'info', message, duration = 5000, onDismiss }) {
	const { t } = useLanguage();
	const [isVisible, setIsVisible] = useState(false);
	const [progress, setProgress] = useState(100);

	useEffect(() => {
		// Trigger entrance animation
		requestAnimationFrame(() => {
			setIsVisible(true);
		});

		// Progress bar animation
		const startTime = Date.now();
		const progressInterval = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
			setProgress(remaining);

			if (remaining <= 0) {
				clearInterval(progressInterval);
			}
		}, 50);

		// Auto dismiss
		const dismissTimer = setTimeout(() => {
			handleDismiss();
		}, duration);

		return () => {
			clearTimeout(dismissTimer);
			clearInterval(progressInterval);
		};
	}, [duration]);

	const handleDismiss = () => {
		setIsVisible(false);
		setTimeout(() => {
			onDismiss?.(id);
		}, 300);
	};

	const icons = {
		success: 'checkCircle',
		error: 'xCircle',
		warning: 'exclamationTriangle',
		info: 'info',
	};

	const colors = {
		success: 'var(--accent-success)',
		error: 'var(--accent-danger)',
		warning: 'var(--accent-warning)',
		info: 'var(--accent-primary)',
	};

	return (
		<div
			className={`toast ${type} ${isVisible ? 'visible' : ''}`}
			role="alert"
			aria-live="polite"
			onClick={handleDismiss}
		>
			<Icon name={icons[type]} size={20} color={colors[type]} />
			<p className="toast-message">{message}</p>
			<button
				className="toast-close"
				onClick={(e) => {
					e.stopPropagation();
					handleDismiss();
				}}
				aria-label={t('dismissNotification')}
				type="button"
			>
				<Icon name="x" size={16} />
			</button>
			<div className="toast-progress" style={{ width: `${progress}%`, background: colors[type] }} />
			<style jsx>{`
				.toast {
					display: flex;
					align-items: center;
					gap: 12px;
					padding: 16px;
					background: var(--bg-primary);
					border-radius: var(--radius-md);
					box-shadow: var(--shadow-lg);
					border-left: 4px solid var(--accent-primary);
					position: relative;
					overflow: hidden;
					cursor: pointer;
					transform: translateY(100%);
					opacity: 0;
					transition: transform 0.3s ease, opacity 0.3s ease;
					will-change: transform, opacity;
				}

				.toast.visible {
					transform: translateY(0);
					opacity: 1;
				}

				.toast.success {
					border-left-color: var(--accent-success);
				}

				.toast.error {
					border-left-color: var(--accent-danger);
				}

				.toast.warning {
					border-left-color: var(--accent-warning);
				}

				.toast-message {
					margin: 0;
					flex: 1;
					font-size: 0.875rem;
					color: var(--text-primary);
					line-height: 1.4;
				}

				.toast-close {
					padding: 4px;
					background: transparent;
					border: none;
					color: var(--text-muted);
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					flex-shrink: 0;
					border-radius: var(--radius-sm);
				}

				.toast-close:active {
					background: var(--bg-tertiary);
				}

				.toast-progress {
					position: absolute;
					bottom: 0;
					left: 0;
					height: 3px;
					background: var(--accent-primary);
					transition: width 50ms linear;
				}

				/* Data saver mode */
				:global(.data-saver) .toast {
					box-shadow: var(--shadow-sm);
				}

				:global(.data-saver) .toast-progress {
					display: none;
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.toast {
						transition: none;
					}

					.toast-progress {
						display: none;
					}
				}
			`}</style>
		</div>
	);
}

/**
 * Toast Container - Manages multiple toasts
 */
export function ToastContainer({ toasts = [], removeToast }) {
	const { t } = useLanguage();
	return (
		<div className="toast-container" role="region" aria-label={t('notifications')}>
			{toasts.map((toast) => (
				<Toast
					key={toast.id}
					id={toast.id}
					type={toast.type}
					message={toast.message}
					duration={toast.duration}
					onDismiss={removeToast}
				/>
			))}
			<style jsx>{`
					.toast-container {
						position: fixed;
						bottom: calc(var(--bottom-nav-offset, 96px) + 16px);
						left: 16px;
						right: 16px;
					z-index: 1100;
					display: flex;
					flex-direction: column;
					gap: 8px;
					pointer-events: none;
				}

				.toast-container > * {
					pointer-events: auto;
				}

					@media (min-width: 640px) {
						.toast-container {
							left: auto;
							right: 16px;
							width: 360px;
							bottom: calc(var(--bottom-nav-offset, 96px) + 16px);
						}
					}

					@media (min-width: 1024px) {
						.toast-container {
							bottom: 16px;
						}
					}
				`}</style>
			</div>
	);
}
