'use client'

import React, { createContext, useState, useContext, useEffect } from 'react'
import useNetworkStatus from '../hooks/useNetworkStatus'

const DataSaverContext = createContext()

/**
 * Context provider for data saver mode
 * Automatically enables on slow connections or when user opts in
 */
export function DataSaverProvider({ children }) {
    const { isSlowConnection, isOffline } = useNetworkStatus()
    const [userPreference, setUserPreference] = useState(null) // null = auto, true = forced on, false = forced off

    // Load user preference from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('selftest_data_saver')
        if (saved !== null) {
            setUserPreference(saved === 'true')
        }
    }, [])

    // Determine if data saver should be active
    const isDataSaverActive = userPreference !== null
        ? userPreference
        : (isSlowConnection || isOffline)

    // Toggle data saver manually
    const toggleDataSaver = () => {
        const newValue = !isDataSaverActive
        setUserPreference(newValue)
        localStorage.setItem('selftest_data_saver', String(newValue))
    }

    // Reset to auto mode
    const resetToAuto = () => {
        setUserPreference(null)
        localStorage.removeItem('selftest_data_saver')
    }

    // Apply data-saver-mode class to body
    useEffect(() => {
        if (isDataSaverActive) {
            document.documentElement.classList.add('data-saver-mode')
        } else {
            document.documentElement.classList.remove('data-saver-mode')
        }
    }, [isDataSaverActive])

    return (
        <DataSaverContext.Provider value={{
            isDataSaverActive,
            isAutoMode: userPreference === null,
            isSlowConnection,
            isOffline,
            toggleDataSaver,
            resetToAuto,
            // Recommended values for data saver mode
            recommendedQuestions: isDataSaverActive ? 5 : 10,
            shouldReduceAnimations: isDataSaverActive,
        }}>
            {children}
        </DataSaverContext.Provider>
    )
}

export function useDataSaver() {
    const context = useContext(DataSaverContext)
    if (!context) {
        // Return default values if used outside provider
        return {
            isDataSaverActive: false,
            isAutoMode: true,
            isSlowConnection: false,
            isOffline: false,
            toggleDataSaver: () => { },
            resetToAuto: () => { },
            recommendedQuestions: 10,
            shouldReduceAnimations: false,
        }
    }
    return context
}
