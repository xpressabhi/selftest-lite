'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';
import useNetworkStatus from '../hooks/useNetworkStatus';

const DATA_SAVER_KEY = 'dataSaverMode';
const DATA_SAVER_CLASS = 'data-saver';
const REDUCED_MOTION_CLASS = 'reduce-motion';

const DataSaverContext = createContext();

/**
 * Context provider for data saver mode
 * Automatically enables on slow connections or when user opts in
 */
export function DataSaverProvider({ children }) {
	const { isSlowConnection, isOffline } = useNetworkStatus();
	const [userPreference, setUserPreference] = useState(() => {
		if (typeof window === 'undefined') return null;
		const saved = localStorage.getItem(DATA_SAVER_KEY);
		return saved === null ? null : saved === 'true';
	}); // null = auto, true = forced on, false = forced off
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return false;
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	// Determine if data saver should be active
	const isDataSaverActive =
		userPreference !== null ? userPreference : isSlowConnection || isOffline;
	const shouldReduceAnimations = isDataSaverActive || prefersReducedMotion;

	useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return undefined;
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
		if (mediaQuery.addEventListener) {
			mediaQuery.addEventListener('change', handleChange);
		} else {
			mediaQuery.addListener(handleChange);
		}
		return () => {
			if (mediaQuery.removeEventListener) {
				mediaQuery.removeEventListener('change', handleChange);
			} else {
				mediaQuery.removeListener(handleChange);
			}
		};
	}, []);

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
		document.documentElement.classList.toggle(
			REDUCED_MOTION_CLASS,
			shouldReduceAnimations,
		);
	}, [isDataSaverActive, shouldReduceAnimations]);

	return (
		<DataSaverContext.Provider
			value={{
				isDataSaverActive,
				isAutoMode: userPreference === null,
				isSlowConnection,
				isOffline,
				prefersReducedMotion,
				toggleDataSaver,
				resetToAuto,
				// Recommended values for data saver mode
				recommendedQuestions: isDataSaverActive ? 5 : 10,
				shouldReduceAnimations,
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
			prefersReducedMotion: false,
			toggleDataSaver: () => {},
			resetToAuto: () => {},
			recommendedQuestions: 10,
			shouldReduceAnimations: false,
		};
	}
	return context;
}
