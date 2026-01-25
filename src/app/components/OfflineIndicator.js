'use client'

import { useState, useEffect } from 'react'
import useNetworkStatus from '../hooks/useNetworkStatus'
import Icon from './Icon'
import { Alert } from 'react-bootstrap'

/**
 * Shows a banner when user is offline or on slow connection
 * Provides feedback and guidance for better experience
 */
export default function OfflineIndicator() {
    const { isOffline, isSlowConnection, effectiveType } = useNetworkStatus()
    const [showSlowWarning, setShowSlowWarning] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        // Show slow connection warning with a slight delay to avoid flashing
        if (isSlowConnection && !isOffline) {
            const timer = setTimeout(() => setShowSlowWarning(true), 2000)
            return () => clearTimeout(timer)
        } else {
            setShowSlowWarning(false)
        }
    }, [isSlowConnection, isOffline])

    // Reset dismissed state when going offline
    useEffect(() => {
        if (isOffline) setDismissed(false)
    }, [isOffline])

    if (dismissed && !isOffline) return null

    if (isOffline) {
        return (
            <Alert
                variant="warning"
                className="position-fixed bottom-0 start-0 end-0 m-0 rounded-0 border-0 d-flex align-items-center justify-content-center gap-2 py-2 px-3"
                style={{
                    zIndex: 1050,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.15)'
                }}
            >
                <Icon name="wifiOff" size={18} />
                <span className="fw-medium small">
                    You're offline. Previously loaded quizzes are still available.
                </span>
            </Alert>
        )
    }

    if (showSlowWarning && !dismissed) {
        return (
            <Alert
                variant="info"
                dismissible
                onClose={() => setDismissed(true)}
                className="position-fixed bottom-0 start-0 end-0 m-0 rounded-0 border-0 d-flex align-items-center justify-content-center gap-2 py-2 px-3"
                style={{
                    zIndex: 1050,
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: 'white',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.15)'
                }}
            >
                <Icon name="signal" size={18} />
                <span className="fw-medium small">
                    Slow connection detected ({effectiveType}). Using optimized mode.
                </span>
            </Alert>
        )
    }

    return null
}
