'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to detect network status and connection quality
 * Useful for adapting UI on slow connections or offline mode
 */
export default function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(true)
    const [connectionType, setConnectionType] = useState('unknown')
    const [isSlowConnection, setIsSlowConnection] = useState(false)
    const [effectiveType, setEffectiveType] = useState('4g')

    const updateNetworkInfo = useCallback(() => {
        if (typeof navigator !== 'undefined') {
            setIsOnline(navigator.onLine)

            // Check Network Information API (available on Chrome/Android)
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
            if (connection) {
                setConnectionType(connection.type || 'unknown')
                setEffectiveType(connection.effectiveType || '4g')
                // Consider 2g and slow-2g as slow connections
                const slowTypes = ['slow-2g', '2g']
                setIsSlowConnection(
                    slowTypes.includes(connection.effectiveType) ||
                    connection.saveData === true ||
                    (connection.downlink && connection.downlink < 1)
                )
            }
        }
    }, [])

    useEffect(() => {
        // Initial check
        updateNetworkInfo()

        // Listen for online/offline events
        const handleOnline = () => {
            setIsOnline(true)
            updateNetworkInfo()
        }
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Listen for connection changes (if supported)
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
        if (connection) {
            connection.addEventListener('change', updateNetworkInfo)
        }

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            if (connection) {
                connection.removeEventListener('change', updateNetworkInfo)
            }
        }
    }, [updateNetworkInfo])

    return {
        isOnline,
        isOffline: !isOnline,
        connectionType,
        effectiveType,
        isSlowConnection,
        // Helper to check if we should reduce data usage
        shouldSaveData: !isOnline || isSlowConnection,
    }
}
