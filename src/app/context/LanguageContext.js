'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';
import { emitLocalStorageChange } from '../utils/storageEvents';

const LanguageContext = createContext();
const LANGUAGE_KEY = 'selftest_language';
const SUPPORTED_LANGUAGES = ['english', 'hindi'];

const getSystemLanguage = () => {
	if (typeof navigator === 'undefined') return 'english';
	const locales = navigator.languages && navigator.languages.length > 0
		? navigator.languages
		: [navigator.language || 'en'];
	const locale = locales[0]?.toLowerCase() || 'en';
	return locale.startsWith('hi') ? 'hindi' : 'english';
};

export function LanguageProvider({ children }) {
	const [language, setLanguage] = useState('english');
	const [translations, setTranslations] = useState(null);
	const [isLanguageReady, setIsLanguageReady] = useState(false);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
		const preferredLanguage = SUPPORTED_LANGUAGES.includes(savedLanguage)
			? savedLanguage
			: getSystemLanguage();
		setLanguage(preferredLanguage);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		let mounted = true;
		const loadTranslations = async () => {
			try {
				const data = language === 'hindi'
					? await import('../locales/hindi.json')
					: await import('../locales/english.json');

				if (mounted) {
					setTranslations(data.default || data);
					setIsLanguageReady(true);
				}
			} catch (error) {
				console.error('Failed to load translations:', error);
			}
		};

		loadTranslations();
		return () => {
			mounted = false;
		};
	}, [language]);

	useEffect(() => {
		if (typeof window === 'undefined' || !isLanguageReady) return;
		localStorage.setItem(LANGUAGE_KEY, language);
		emitLocalStorageChange(LANGUAGE_KEY);
	}, [language, isLanguageReady]);

	useEffect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('lang', language === 'hindi' ? 'hi' : 'en');
	}, [language]);

	const t = (key) => {
		if (!translations) return key;
		return translations[key] || key;
	};

	const toggleLanguage = () => {
		setLanguage((prev) => (prev === 'english' ? 'hindi' : 'english'));
	};

	return (
		<LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage, isLanguageReady }}>
			{children}
		</LanguageContext.Provider>
	);
}

export function useLanguage() {
	return useContext(LanguageContext);
}
