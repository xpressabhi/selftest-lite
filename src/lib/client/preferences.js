import { writable } from 'svelte/store';
import { loadDictionary } from './locales';
import { emitLocalStorageChange } from './storage';
import { isNoindexPath, splitLang } from '#lib/shared/seo.js';

const LANGUAGE_KEY = 'selftest_language';
const THEME_KEY = 'selftest_theme';
const AUTO_ADVANCE_KEY = 'selftest_autoAdvance';

export const language = writable('english');
export const themePreference = writable('system');
export const autoAdvance = writable(false);

function getSystemLanguage() {
	if (typeof navigator === 'undefined') {
		return 'english';
	}
	const locales = navigator.languages?.length
		? navigator.languages
		: [navigator.language || 'en'];
	return locales[0]?.toLowerCase().startsWith('hi') ? 'hindi' : 'english';
}

function getSystemTheme() {
	if (typeof window === 'undefined' || !window.matchMedia) {
		return 'light';
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export async function initializePreferences() {
	if (typeof window === 'undefined') {
		return;
	}

	// Storage can throw in private mode / when cookies are blocked; fall back
	// to system defaults instead of breaking hydration.
	const readStored = (key) => {
		try {
			return window.localStorage.getItem(key);
		} catch {
			return null;
		}
	};

	const savedLanguage = readStored(LANGUAGE_KEY);
	const resolvedLanguage = ['english', 'hindi'].includes(savedLanguage)
		? savedLanguage
		: getSystemLanguage();
	await setLanguage(resolvedLanguage, { persist: false });

	const savedTheme = readStored(THEME_KEY) || 'system';
	themePreference.set(savedTheme);
	applyTheme(savedTheme);

	const savedAutoAdvance = readStored(AUTO_ADVANCE_KEY);
	autoAdvance.set(savedAutoAdvance === null ? true : savedAutoAdvance === 'true');
}

export async function setLanguage(nextLanguage, { persist = true } = {}) {
	if (!['english', 'hindi'].includes(nextLanguage)) {
		return;
	}
	await loadDictionary(nextLanguage);
	language.set(nextLanguage);
	if (typeof window !== 'undefined') {
		if (persist) {
			try {
				window.localStorage.setItem(LANGUAGE_KEY, nextLanguage);
			} catch {
				// Storage unavailable; the in-memory preference still applies.
			}
		}
		// Indexable routes pin their language to the URL: the server already
		// rendered lang="hi" for /hi, and the saved preference must not flip it
		// back to "en" on hydration (that broke screen-reader pronunciation and
		// every :lang(hi) typography rule). App-shell routes have no URL
		// language, so there the preference owns the attribute.
		const { path } = splitLang(window.location.pathname);
		if (isNoindexPath(path)) {
			document.documentElement.setAttribute('lang', nextLanguage === 'hindi' ? 'hi' : 'en');
		}
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
		// Keep the Android status bar / browser chrome in step with the theme
		// the user chose in the app, not the OS preference. The values mirror
		// --surface-muted in globals.css.
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', resolvedTheme === 'dark' ? '#0e1116' : '#f3eee4');
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

export function setAutoAdvance(nextValue) {
	const enabled = Boolean(nextValue);
	autoAdvance.set(enabled);
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(AUTO_ADVANCE_KEY, String(enabled));
		emitLocalStorageChange(AUTO_ADVANCE_KEY);
	}
}
