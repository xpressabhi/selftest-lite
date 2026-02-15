'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';

const ThemeContext = createContext();
const THEME_KEY = 'selftest_theme';
const LIGHT = 'light';
const DARK = 'dark';
const SYSTEM = 'system';

const getSystemTheme = () => {
	if (typeof window === 'undefined' || !window.matchMedia) return LIGHT;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
};

const getStoredPreference = () => {
	if (typeof window === 'undefined') return SYSTEM;
	const saved = localStorage.getItem(THEME_KEY);
	if (saved === LIGHT || saved === DARK) return saved;
	return SYSTEM;
};

const applyThemeToDocument = (theme) => {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const body = document.body;
	root.setAttribute('data-theme', theme);
	root.style.colorScheme = theme;
	if (body) {
		body.setAttribute('data-theme', theme);
	}

	const themeColor = theme === DARK ? '#0f0f1a' : '#6366f1';
	const metaTags = document.querySelectorAll('meta[name="theme-color"]');
	metaTags.forEach((tag) => {
		tag.setAttribute('content', themeColor);
	});
};

export function ThemeProvider({ children }) {
	const [themePreference, setThemePreference] = useState(getStoredPreference);
	const [theme, setTheme] = useState(() =>
		themePreference === SYSTEM ? getSystemTheme() : themePreference,
	);

	useEffect(() => {
		const mediaQuery =
			typeof window !== 'undefined'
				? window.matchMedia('(prefers-color-scheme: dark)')
				: null;

		const resolveTheme = () => {
			const nextTheme =
				themePreference === SYSTEM
					? mediaQuery && mediaQuery.matches
						? DARK
						: LIGHT
					: themePreference;
			setTheme((prevTheme) => (prevTheme === nextTheme ? prevTheme : nextTheme));
		};

		resolveTheme();
		if (!mediaQuery || themePreference !== SYSTEM) return undefined;

		const handleChange = () => resolveTheme();
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
	}, [themePreference]);

	useEffect(() => {
		applyThemeToDocument(theme);
		if (typeof window === 'undefined') return;
		if (themePreference === SYSTEM) {
			localStorage.removeItem(THEME_KEY);
			return;
		}
		localStorage.setItem(THEME_KEY, themePreference);
	}, [theme, themePreference]);

	const toggleTheme = () => {
		setThemePreference((prevPreference) => {
			if (prevPreference === SYSTEM) {
				return theme === LIGHT ? DARK : LIGHT;
			}
			return prevPreference === LIGHT ? DARK : LIGHT;
		});
	};

	const resetThemeToSystem = () => {
		setThemePreference(SYSTEM);
	};

	return (
		<ThemeContext.Provider
			value={{
				theme,
				themePreference,
				isSystemTheme: themePreference === SYSTEM,
				toggleTheme,
				setThemePreference,
				resetThemeToSystem,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	return useContext(ThemeContext);
}
