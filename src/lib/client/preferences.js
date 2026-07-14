import { writable } from 'svelte/store';
import { loadDictionary } from './locales';
import { emitLocalStorageChange } from './storage';

const LANGUAGE_KEY = 'selftest_language';
const THEME_KEY = 'selftest_theme';
const DATA_SAVER_KEY = 'dataSaverMode';

export const language = writable('english');
export const themePreference = writable('system');
export const isDataSaverActive = writable(false);

function getSystemLanguage() {
	if (typeof navigator === 'undefined') {
		return 'english';
	}
	const locales = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
	return locales[0]?.toLowerCase().startsWith('hi') ? 'hindi' : 'english';
}

function getSystemTheme() {
	if (typeof window === 'undefined' || !window.matchMedia) {
		return 'light';
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initializePreferences() {
	if (typeof window === 'undefined') {
		return;
	}

	const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
	const resolvedLanguage = ['english', 'hindi'].includes(savedLanguage)
		? savedLanguage
		: getSystemLanguage();
	void setLanguage(resolvedLanguage, { persist: false });

	const savedTheme = window.localStorage.getItem(THEME_KEY) || 'system';
	themePreference.set(savedTheme);
	applyTheme(savedTheme);

	const savedDataSaver = window.localStorage.getItem(DATA_SAVER_KEY);
	const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
	const slowConnection =
		Boolean(connection?.saveData) ||
		['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || '').toLowerCase());
	const resolvedDataSaver = savedDataSaver === null ? slowConnection : savedDataSaver === 'true';
	isDataSaverActive.set(resolvedDataSaver);
	document.documentElement.classList.toggle('data-saver', resolvedDataSaver);
	document.documentElement.classList.toggle('reduce-motion', resolvedDataSaver);
}

export async function setLanguage(nextLanguage, { persist = true } = {}) {
	if (!['english', 'hindi'].includes(nextLanguage)) {
		return;
	}
	await loadDictionary(nextLanguage);
	language.set(nextLanguage);
	if (typeof window !== 'undefined') {
		if (persist) {
			window.localStorage.setItem(LANGUAGE_KEY, nextLanguage);
		}
		document.documentElement.setAttribute('lang', nextLanguage === 'hindi' ? 'hi' : 'en');
		if (persist) {
			emitLocalStorageChange(LANGUAGE_KEY);
		}
	}
}

export function applyTheme(preference) {
	const resolvedTheme = preference === 'system' ? getSystemTheme() : preference;
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-bs-theme', resolvedTheme);
		document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
	}
}

export function setThemePreference(preference) {
	const normalized = ['light', 'dark', 'system'].includes(preference) ? preference : 'system';
	themePreference.set(normalized);
	if (typeof window !== 'undefined') {
		if (normalized === 'system') {
			window.localStorage.removeItem(THEME_KEY);
		} else {
			window.localStorage.setItem(THEME_KEY, normalized);
		}
		applyTheme(normalized);
		emitLocalStorageChange(THEME_KEY);
	}
}

export function setDataSaver(nextValue) {
	const enabled = Boolean(nextValue);
	isDataSaverActive.set(enabled);
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(DATA_SAVER_KEY, String(enabled));
		document.documentElement.classList.toggle('data-saver', enabled);
		document.documentElement.classList.toggle('reduce-motion', enabled);
		emitLocalStorageChange(DATA_SAVER_KEY);
	}
}
