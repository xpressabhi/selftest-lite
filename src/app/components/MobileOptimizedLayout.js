'use client';

import { useEffect, useState } from 'react';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import PullToRefresh from './PullToRefresh';
import DataSaverToggle from './DataSaverToggle';
import { ToastContainer } from './Toast';
import useNetworkStatus from '../hooks/useNetworkStatus';

/**
 * Mobile-Optimized Layout
 * Wraps the entire application with:
 * - Mobile-first navigation
 * - Pull-to-refresh
 * - Data saver mode
 * - Offline indicators
 * - Toast notifications
 * - Touch-optimized interactions
 *
 * @param {Object} props
 * @param {ReactNode} props.children - Page content
 * @param {Function} props.onRefresh - Pull-to-refresh callback
 */
export default function MobileOptimizedLayout({ children, onRefresh }) {
	const { isOffline, isSlowConnection } = useNetworkStatus();
	const [toasts, setToasts] = useState([]);

	// Add toast helper
	const addToast = (type, message, duration = 5000) => {
		const id = Date.now().toString();
		setToasts((prev) => [...prev, { id, type, message, duration }]);
		return id;
	};

	const removeToast = (id) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	};

	// Show offline notification
	useEffect(() => {
		if (isOffline) {
			addToast('warning', 'You are offline. Some features may be limited.');
		}
	}, [isOffline]);

	// Handle pull-to-refresh
	const handleRefresh = async () => {
		if (onRefresh) {
			await onRefresh();
		} else {
			// Default refresh behavior
			window.location.reload();
		}
	};

	return (
		<div className="app-layout">
			{/* Skip link for accessibility */}
			<a href="#main-content" className="skip-link">
				Skip to main content
			</a>

			{/* Top Navigation */}
			<TopNav />

			{/* Offline Banner */}
			<div
				className={`offline-banner ${isOffline ? 'visible' : ''}`}
				role="alert"
				aria-live="polite"
			>
				<span className="offline-icon" aria-hidden="true">
					⚠️
				</span>
				<span>You are offline</span>
			</div>

			{/* Slow Connection Banner */}
			{isSlowConnection && !isOffline && (
				<div className="slow-banner" role="alert">
					<span className="slow-icon" aria-hidden="true">
						📶
					</span>
					<span>Slow connection detected</span>
				</div>
			)}

			{/* Main Content */}
			<main
				id="main-content"
				className="main-content"
				tabIndex={-1}
			>
				{/* Data Saver Toggle (shown on slow connections) */}
				{isSlowConnection && (
					<DataSaverToggle variant="banner" />
				)}

				{/* Pull-to-refresh wrapper */}
				<PullToRefresh onRefresh={handleRefresh} disabled={isOffline}>
					<div className="content-wrapper">
						{children}
					</div>
				</PullToRefresh>
			</main>

			{/* Bottom Navigation (mobile only) */}
			<BottomNav />

			{/* Toast Notifications */}
			<ToastContainer toasts={toasts} removeToast={removeToast} />

			{/* CSS-in-JS for this component */}
			<style jsx>{`
				.app-layout {
					min-height: 100vh;
					min-height: 100dvh;
					display: flex;
					flex-direction: column;
					background: var(--bg-secondary);
				}

				/* Skip link for accessibility */
				.skip-link {
					position: absolute;
					top: -40px;
					left: 0;
					padding: 8px 16px;
					background: var(--accent-primary);
					color: white;
					text-decoration: none;
					z-index: 2000;
					border-radius: 0 0 var(--radius-md) 0;
					font-weight: 500;
					font-size: 0.875rem;
				}

				.skip-link:focus {
					top: 0;
				}

				/* Main content area */
				.main-content {
					flex: 1;
					padding: 16px;
					padding-top: calc(56px + 16px);
					padding-bottom: calc(64px + 16px);
					max-width: 100%;
					outline: none;
				}

				@media (min-width: 768px) {
					.main-content {
						padding: 24px;
						padding-top: calc(56px + 24px);
						padding-bottom: 24px;
					}
				}

				@media (min-width: 1024px) {
					.main-content {
						padding: 32px;
						padding-top: calc(56px + 32px);
						max-width: 900px;
						margin: 0 auto;
					}
				}

				/* Content wrapper for pull-to-refresh */
				.content-wrapper {
					min-height: 100%;
				}

				/* Offline banner */
				.offline-banner {
					position: fixed;
					top: 56px;
					left: 0;
					right: 0;
					padding: 8px 16px;
					background: var(--accent-warning);
					color: #1a1a2e;
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
					font-weight: 600;
					font-size: 0.875rem;
					z-index: 999;
					transform: translateY(-100%);
					transition: transform 0.3s ease;
				}

				.offline-banner.visible {
					transform: translateY(0);
				}

				.offline-icon {
					font-size: 1rem;
				}

				/* Slow connection banner */
				.slow-banner {
					position: fixed;
					top: 56px;
					left: 0;
					right: 0;
					padding: 8px 16px;
					background: var(--bg-tertiary);
					color: var(--text-primary);
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
					font-size: 0.875rem;
					z-index: 999;
					border-bottom: 1px solid var(--border-color);
				}

				.slow-icon {
					font-size: 1rem;
					opacity: 0.7;
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.offline-banner {
						transition: none;
					}
				}

				/* Data saver mode */
				:global(.data-saver) .offline-banner,
				:global(.data-saver) .slow-banner {
					animation: none;
				}
			`}</style>
		</div>
	);
}
