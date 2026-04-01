'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon';
import PretextBlock from './PretextBlock';
import { useDataSaver } from '../context/DataSaverContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * Pull-to-refresh wrapper for mobile devices
 * - Touch gesture detection with proper resistance
 * - Visual feedback with rotation indicator
 * - Data saver mode support
 * - Reduced motion support
 * - Performance optimized with will-change
 */
export default function PullToRefresh({
	onRefresh,
	children,
	disabled = false,
	threshold = 80,
}) {
	const { t } = useLanguage();
	const { shouldReduceAnimations } = useDataSaver();
	const [pulling, setPulling] = useState(false);
	const [showIndicator, setShowIndicator] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const containerRef = useRef(null);
	const startY = useRef(0);
	const currentY = useRef(0);
	const pullDistanceRef = useRef(0);
	const indicatorVisibleRef = useRef(false);
	const readyRef = useRef(false);
	const isIOS =
		typeof navigator !== 'undefined' &&
		/iphone|ipad|ipod/i.test(navigator.userAgent);

	const applyPullVisuals = useCallback((distance) => {
		if (!containerRef.current) return;

		if (shouldReduceAnimations) {
			containerRef.current.dataset.offsetActive = 'false';
			containerRef.current.style.setProperty('--ptr-progress', '0');
			containerRef.current.style.setProperty('--ptr-indicator-scale', '1');
			containerRef.current.style.setProperty('--ptr-indicator-rotate', '0deg');
			containerRef.current.style.setProperty('--ptr-content-offset', '0px');
			return;
		}

		const progress = Math.min(distance / threshold, 1);
		const contentOffset = !isIOS && distance > 0 ? Math.round(distance * 0.3) : 0;
		containerRef.current.dataset.offsetActive = contentOffset > 0 ? 'true' : 'false';
		containerRef.current.style.setProperty('--ptr-progress', progress.toFixed(3));
		containerRef.current.style.setProperty(
			'--ptr-indicator-scale',
			`${(0.5 + progress * 0.5).toFixed(3)}`,
		);
		containerRef.current.style.setProperty(
			'--ptr-indicator-rotate',
			`${Math.round(progress * 180)}deg`,
		);
		containerRef.current.style.setProperty('--ptr-content-offset', `${contentOffset}px`);
	}, [isIOS, shouldReduceAnimations, threshold]);

	const syncIndicatorState = useCallback((distance, forceVisible = false) => {
		const nextVisible = forceVisible || distance > 10;
		if (indicatorVisibleRef.current !== nextVisible) {
			indicatorVisibleRef.current = nextVisible;
			setShowIndicator(nextVisible);
		}

		const nextReady = distance >= threshold;
		if (readyRef.current !== nextReady) {
			readyRef.current = nextReady;
			setIsReady(nextReady);
		}
	}, [threshold]);

	const resetPullState = useCallback(() => {
		pullDistanceRef.current = 0;
		indicatorVisibleRef.current = false;
		readyRef.current = false;
		setShowIndicator(false);
		setIsReady(false);
		applyPullVisuals(0);
	}, [applyPullVisuals]);

	const handleTouchStart = useCallback((e) => {
		if (disabled || refreshing) return;

		// Only enable pull-to-refresh when scrolled to top
		if (window.scrollY > 0) return;

		startY.current = e.touches[0].clientY;
		pullDistanceRef.current = 0;
		setPulling(true);
	}, [disabled, refreshing]);

	const handleTouchMove = useCallback((e) => {
		if (!pulling || disabled || refreshing) return;

		currentY.current = e.touches[0].clientY;
		const diff = currentY.current - startY.current;

		// Only pull down, not up
		if (diff > 0 && window.scrollY === 0) {
			// Apply resistance - pull distance is reduced as it gets longer
			const resistance = Math.min(diff * 0.4, threshold * 1.5);
			pullDistanceRef.current = resistance;
			syncIndicatorState(resistance);
			applyPullVisuals(resistance);

			// Prevent default scrolling when pulling
			if (resistance > 10) {
				e.preventDefault();
			}
		}
	}, [applyPullVisuals, disabled, pulling, refreshing, syncIndicatorState, threshold]);

	const handleTouchEnd = useCallback(async () => {
		if (!pulling) return;

		setPulling(false);
		const finalDistance = pullDistanceRef.current;

		if (finalDistance >= threshold && onRefresh && !refreshing) {
			setRefreshing(true);
			syncIndicatorState(threshold, true);
			applyPullVisuals(shouldReduceAnimations ? 0 : threshold * 0.65);
			try {
				await onRefresh();
			} finally {
				setRefreshing(false);
				resetPullState();
			}
			return;
		}

		resetPullState();
	}, [applyPullVisuals, onRefresh, pulling, refreshing, resetPullState, shouldReduceAnimations, syncIndicatorState, threshold]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return undefined;

		container.addEventListener('touchstart', handleTouchStart, { passive: true });
		container.addEventListener('touchmove', handleTouchMove, { passive: false });
		container.addEventListener('touchend', handleTouchEnd);

		return () => {
			container.removeEventListener('touchstart', handleTouchStart);
			container.removeEventListener('touchmove', handleTouchMove);
			container.removeEventListener('touchend', handleTouchEnd);
		};
	}, [handleTouchStart, handleTouchMove, handleTouchEnd]);

	useEffect(() => {
		resetPullState();
	}, [resetPullState, shouldReduceAnimations]);

	return (
		<div
			ref={containerRef}
			className="ptr-container"
			data-offset-active="false"
			style={{ minHeight: '100%' }}
		>
			{/* Pull indicator */}
			<div
				className={`pull-indicator ${showIndicator ? 'visible' : ''} ${isReady ? 'ready' : ''} ${
					refreshing ? 'refreshing' : ''
				}`}
				aria-live="polite"
			>
				{refreshing ? (
					<div className="ptr-content">
						<div className="ptr-spinner" role="status">
							<span className="sr-only">{t('loading')}</span>
						</div>
						<PretextBlock as="span" className="ptr-text">
							{t('refreshing')}
						</PretextBlock>
					</div>
				) : isReady ? (
					<div className="ptr-content">
						<Icon name="checkCircle" size={20} color="var(--accent-primary)" />
						<PretextBlock as="span" className="ptr-text ready">
							{t('releaseToRefresh')}
						</PretextBlock>
					</div>
				) : (
					<div className="ptr-content">
						<span className="ptr-chevron" aria-hidden="true">
							<Icon name="chevronDown" size={20} />
						</span>
						<PretextBlock as="span" className="ptr-text">
							{t('pullToRefresh')}
						</PretextBlock>
					</div>
				)}
			</div>

			{/* Content with pull offset */}
			<div className={`ptr-content-wrapper ${pulling ? 'pulling' : ''}`}>
				{children}
			</div>

			<style jsx>{`
				.ptr-container {
					--ptr-progress: 0;
					--ptr-indicator-scale: 0.5;
					--ptr-indicator-rotate: 0deg;
					--ptr-content-offset: 0px;
					position: relative;
					touch-action: pan-y;
				}

				.pull-indicator {
					position: fixed;
					top: var(--navbar-height);
					left: 50%;
					transform: translateX(-50%) translateY(-100%) scale(var(--ptr-indicator-scale));
					padding: 12px 20px;
					background: var(--bg-primary);
					border-radius: var(--radius-lg);
					box-shadow: var(--shadow-md);
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
					opacity: var(--ptr-progress);
					transition: opacity 0.2s ease, transform 0.2s ease;
					z-index: 999;
					border: 1px solid var(--border-color);
				}

				.pull-indicator.visible {
					transform: translateX(-50%) translateY(10px) scale(var(--ptr-indicator-scale));
				}

				.ptr-content {
					display: flex;
					align-items: center;
					gap: 8px;
					color: var(--text-muted);
				}

				.ptr-text {
					font-size: 0.875rem;
					font-weight: 500;
				}

				.ptr-text.ready {
					color: var(--accent-primary);
				}

				.ptr-chevron {
					display: inline-flex;
					transform: rotate(var(--ptr-indicator-rotate));
					transition: transform 0.1s ease;
				}

				.ptr-spinner {
					width: 20px;
					height: 20px;
					border: 2px solid var(--bg-tertiary);
					border-top-color: var(--accent-primary);
					border-radius: 50%;
					animation: spin 0.8s linear infinite;
				}

				.ptr-content-wrapper {
					transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
					will-change: auto;
				}

				.ptr-container[data-offset-active='true'] .ptr-content-wrapper {
					transform: translate3d(0, var(--ptr-content-offset), 0);
					will-change: transform;
				}

				.ptr-content-wrapper.pulling {
					transition: none;
				}

				@keyframes spin {
					to { transform: rotate(360deg); }
				}

				/* Screen reader only */
				.sr-only {
					position: absolute;
					width: 1px;
					height: 1px;
					padding: 0;
					margin: -1px;
					overflow: hidden;
					clip: rect(0, 0, 0, 0);
					white-space: nowrap;
					border: 0;
				}

				/* Data saver mode */
				:global(.data-saver) .pull-indicator {
					display: none;
				}

				:global(.data-saver) .ptr-spinner {
					animation: none;
					border-top-color: var(--bg-tertiary);
					background: conic-gradient(var(--accent-primary) 25%, var(--bg-tertiary) 0);
					mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
				}

				:global(.data-saver) .ptr-content-wrapper {
					transform: none;
					transition: none;
					will-change: auto;
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.ptr-spinner {
						animation: none;
						border-top-color: var(--bg-tertiary);
						background: conic-gradient(var(--accent-primary) 25%, var(--bg-tertiary) 0);
						mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
					}

					.ptr-content-wrapper {
						transform: none;
						transition: none;
						will-change: auto;
					}
				}

				/* Hide on desktop */
				@media (min-width: 1024px) {
					.pull-indicator {
						display: none;
					}
				}
			`}</style>
		</div>
	);
}
