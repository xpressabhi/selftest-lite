'use client';

import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import englishTranslations from '../locales/english.json';
import hindiTranslations from '../locales/hindi.json';

const LanguageContext = createContext();
const LANGUAGE_KEY = 'selftest_language';
const SUPPORTED_LANGUAGES = ['english', 'hindi'];

const TRANSLATIONS = {
	english: englishTranslations,
	hindi: hindiTranslations,
};

const FALLBACK_TRANSLATIONS = englishTranslations;

const getSystemLanguage = () => {
	if (typeof navigator === 'undefined') return 'english';
	const locales = navigator.languages && navigator.languages.length > 0
		? navigator.languages
		: [navigator.language || 'en'];
	const locale = locales[0]?.toLowerCase() || 'en';
	return locale.startsWith('hi') ? 'hindi' : 'english';
};

export function LanguageProvider({ children }) {
	// Keep first render deterministic for SSR/CSR hydration.
	const [language, setLanguage] = useState('english');
	const [isLanguageReady, setIsLanguageReady] = useState(false);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
		const preferredLanguage = SUPPORTED_LANGUAGES.includes(savedLanguage)
			? savedLanguage
			: getSystemLanguage();
		setLanguage(preferredLanguage);
		setIsLanguageReady(true);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined' || !isLanguageReady) return;
		localStorage.setItem(LANGUAGE_KEY, language);
	}, [language, isLanguageReady]);

	useEffect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('lang', language === 'hindi' ? 'hi' : 'en');
	}, [language]);

	const activeTranslations = useMemo(
		() => TRANSLATIONS[language] || FALLBACK_TRANSLATIONS,
		[language],
	);

	const t = (key) => {
		return activeTranslations[key] || FALLBACK_TRANSLATIONS[key] || key;
	};

	const toggleLanguage = () => {
		setLanguage((prev) => (prev === 'english' ? 'hindi' : 'english'));
	};

	return (
		<LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
			{children}
		</LanguageContext.Provider>
	);
}

export function useLanguage() {
	return useContext(LanguageContext);
}
