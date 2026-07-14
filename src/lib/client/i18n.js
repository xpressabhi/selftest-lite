import { derived } from 'svelte/store';
import { language } from './preferences';
import { getDictionary } from './locales';

export function translate(key, currentLanguage = 'english', replacements = {}) {
	const dictionary = getDictionary(currentLanguage);
	const fallbackDictionary = getDictionary('english');
	let value = dictionary[key] || fallbackDictionary[key] || key;

	for (const [name, replacement] of Object.entries(replacements)) {
		value = value.replaceAll(`{${name}}`, String(replacement));
	}

	return value;
}

export const t = derived(language, ($language) => {
	return (key, replacements) => translate(key, $language, replacements);
});
