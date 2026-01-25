'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from './Icon'

/**
 * Pull-to-refresh wrapper for mobile devices
 * Wraps content and handles the pull gesture
 */
export default function PullToRefresh({
    onRefresh,
    children,
    disabled = false,
    threshold = 80,
}) {
    const [pulling, setPulling] = useState(false)
    const [pullDistance, setPullDistance] = useState(0)
    const [refreshing, setRefreshing] = useState(false)
    const containerRef = useRef(null)
    const startY = useRef(0)
    const currentY = useRef(0)

    const handleTouchStart = useCallback((e) => {
        if (disabled || refreshing) return

        // Only enable pull-to-refresh when scrolled to top
        if (window.scrollY > 0) return

        startY.current = e.touches[0].clientY
        setPulling(true)
    }, [disabled, refreshing])

    const handleTouchMove = useCallback((e) => {
        if (!pulling || disabled || refreshing) return

        currentY.current = e.touches[0].clientY
        const diff = currentY.current - startY.current

        // Only pull down, not up
        if (diff > 0 && window.scrollY === 0) {
            // Apply resistance - pull distance is reduced as it gets longer
            const resistance = Math.min(diff * 0.4, threshold * 1.5)
            setPullDistance(resistance)

            // Prevent default scrolling when pulling
            if (resistance > 10) {
                e.preventDefault()
            }
        }
    }, [pulling, disabled, refreshing, threshold])

    const handleTouchEnd = useCallback(async () => {
        if (!pulling) return

        setPulling(false)

        if (pullDistance >= threshold && onRefresh && !refreshing) {
            setRefreshing(true)
            try {
                await onRefresh()
            } finally {
                setRefreshing(false)
            }
        }

        setPullDistance(0)
    }, [pulling, pullDistance, threshold, onRefresh, refreshing])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        container.addEventListener('touchmove', handleTouchMove, { passive: false })
        container.addEventListener('touchend', handleTouchEnd)

        return () => {
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)
        }
    }, [handleTouchStart, handleTouchMove, handleTouchEnd])

    const showIndicator = pullDistance > 10 || refreshing

    return (
        <div ref={containerRef} style={{ minHeight: '100%' }}>
            {/* Pull indicator */}
            <div
                className={`pull-indicator ${showIndicator ? 'visible' : ''}`}
                style={{
                    opacity: Math.min(pullDistance / threshold, 1),
                }}
            >
                {refreshing ? (
                    <div className="d-flex align-items-center gap-2">
                        <div className="spinner-border spinner-border-sm" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                        <span>Refreshing...</span>
                    </div>
                ) : pullDistance >= threshold ? (
                    <div className="d-flex align-items-center gap-2">
                        <Icon name="checkCircle" size={16} />
                        <span>Release to refresh</span>
                    </div>
                ) : (
                    <div className="d-flex align-items-center gap-2">
                        <Icon
                            name="chevronDown"
                            size={16}
                            style={{
                                transform: `rotate(${Math.min(pullDistance / threshold * 180, 180)}deg)`,
                                transition: 'transform 0.1s ease'
                            }}
                        />
                        <span>Pull to refresh</span>
                    </div>
                )}
            </div>

            {/* Content with pull offset */}
            <div
                style={{
                    transform: `translateY(${pullDistance > 0 ? pullDistance * 0.3 : 0}px)`,
                    transition: pulling ? 'none' : 'transform 0.3s ease',
                }}
            >
                {children}
            </div>
        </div>
    )
}
