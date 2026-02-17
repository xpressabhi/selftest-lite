'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon';
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
    const [pulling, setPulling] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef(null);
    const startY = useRef(0);
    const currentY = useRef(0);
    const isIOS =
        typeof navigator !== 'undefined' &&
        /iphone|ipad|ipod/i.test(navigator.userAgent);

    const handleTouchStart = useCallback((e) => {
        if (disabled || refreshing) return;

        // Only enable pull-to-refresh when scrolled to top
        if (window.scrollY > 0) return;

        startY.current = e.touches[0].clientY;
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
            setPullDistance(resistance);

            // Prevent default scrolling when pulling
            if (resistance > 10) {
                e.preventDefault();
            }
        }
    }, [pulling, disabled, refreshing, threshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!pulling) return;

        setPulling(false);

        if (pullDistance >= threshold && onRefresh && !refreshing) {
            setRefreshing(true);
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
            }
        }

        setPullDistance(0);
    }, [pulling, pullDistance, threshold, onRefresh, refreshing]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    const showIndicator = pullDistance > 10 || refreshing;
    const progress = Math.min(pullDistance / threshold, 1);
    // iOS Safari can hide fixed elements if any ancestor has transform.
    // Keep transform off on iOS so fixed bottom bars remain stable.
    const contentOffset = !isIOS && pullDistance > 0 ? pullDistance * 0.3 : 0;

    return (
        <div ref={containerRef} className="ptr-container" style={{ minHeight: '100%' }}>
            {/* Pull indicator */}
            <div
                className={`pull-indicator ${showIndicator ? 'visible' : ''} ${pullDistance >= threshold ? 'ready' : ''}`}
                style={{
                    opacity: progress,
                    transform: `scale(${0.5 + progress * 0.5})`,
                }}
                aria-live="polite"
            >
                {refreshing ? (
                    <div className="ptr-content">
                        <div className="ptr-spinner" role="status">
                            <span className="sr-only">{t('loading')}</span>
                        </div>
                        <span className="ptr-text">{t('refreshing')}</span>
                    </div>
                ) : pullDistance >= threshold ? (
                    <div className="ptr-content">
                        <Icon name="checkCircle" size={20} color="var(--accent-primary)" />
                        <span className="ptr-text ready">{t('releaseToRefresh')}</span>
                    </div>
                ) : (
                    <div className="ptr-content">
                        <Icon
                            name="chevronDown"
                            size={20}
                            style={{
                                transform: `rotate(${progress * 180}deg)`,
                                transition: 'transform 0.1s ease'
                            }}
                        />
                        <span className="ptr-text">{t('pullToRefresh')}</span>
                    </div>
                )}
            </div>

            {/* Content with pull offset */}
            <div
                className="ptr-content-wrapper"
                style={{
                    transform: contentOffset > 0 ? `translate3d(0, ${contentOffset}px, 0)` : 'none',
                    transition: pulling ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    willChange: contentOffset > 0 ? 'transform' : 'auto',
                }}
            >
                {children}
            </div>

            <style jsx>{`
                .ptr-container {
                    position: relative;
                    touch-action: pan-y;
                }

	                .pull-indicator {
	                    position: fixed;
	                    top: var(--navbar-height);
	                    left: 50%;
                    transform: translateX(-50%) translateY(-100%);
                    padding: 12px 20px;
                    background: var(--bg-primary);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    opacity: 0;
                    transition: opacity 0.2s ease, transform 0.2s ease;
                    z-index: 999;
                    border: 1px solid var(--border-color);
                }

                .pull-indicator.visible {
                    transform: translateX(-50%) translateY(10px);
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

                .ptr-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid var(--bg-tertiary);
                    border-top-color: var(--accent-primary);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
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

                /* Reduced motion */
                @media (prefers-reduced-motion: reduce) {
                    .ptr-spinner {
                        animation: none;
                        border-top-color: var(--bg-tertiary);
                        background: conic-gradient(var(--accent-primary) 25%, var(--bg-tertiary) 0);
                        mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
                    }

                    .ptr-content-wrapper {
                        transition: none;
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
