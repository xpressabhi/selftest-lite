'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';
import useNetworkStatus from '../hooks/useNetworkStatus';

const DATA_SAVER_KEY = 'dataSaverMode';
const DATA_SAVER_CLASS = 'data-saver';

const DataSaverContext = createContext();

/**
 * Context provider for data saver mode
 * Automatically enables on slow connections or when user opts in
 */
export function DataSaverProvider({ children }) {
	const { isSlowConnection, isOffline } = useNetworkStatus();
	const [userPreference, setUserPreference] = useState(null); // null = auto, true = forced on, false = forced off

	// Load user preference from localStorage
	useEffect(() => {
		const saved = localStorage.getItem(DATA_SAVER_KEY);
		if (saved !== null) {
			setUserPreference(saved === 'true');
		}
	}, []);

	// Determine if data saver should be active
	const isDataSaverActive =
		userPreference !== null ? userPreference : isSlowConnection || isOffline;

	// Toggle data saver manually
	const toggleDataSaver = () => {
		const newValue = !isDataSaverActive;
		setUserPreference(newValue);
		localStorage.setItem(DATA_SAVER_KEY, String(newValue));
	};

	// Reset to auto mode
	const resetToAuto = () => {
		setUserPreference(null);
		localStorage.removeItem(DATA_SAVER_KEY);
	};

	// Apply shared data-saver class to document root
	useEffect(() => {
		document.documentElement.classList.toggle(DATA_SAVER_CLASS, isDataSaverActive);
	}, [isDataSaverActive]);

	return (
		<DataSaverContext.Provider
			value={{
				isDataSaverActive,
				isAutoMode: userPreference === null,
				isSlowConnection,
				isOffline,
				toggleDataSaver,
				resetToAuto,
				// Recommended values for data saver mode
				recommendedQuestions: isDataSaverActive ? 5 : 10,
				shouldReduceAnimations: isDataSaverActive,
			}}
		>
			{children}
		</DataSaverContext.Provider>
	);
}

export function useDataSaver() {
	const context = useContext(DataSaverContext);
	if (!context) {
		// Return default values if used outside provider
		return {
			isDataSaverActive: false,
			isAutoMode: true,
			isSlowConnection: false,
			isOffline: false,
			toggleDataSaver: () => {},
			resetToAuto: () => {},
			recommendedQuestions: 10,
			shouldReduceAnimations: false,
		};
	}
	return context;
}
