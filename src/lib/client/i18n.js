import { derived } from 'svelte/store';
import en from '../../app/locales/english.json';
import hi from '../../app/locales/hindi.json';
import { language } from './preferences';

const dictionaries = {
	english: en,
	hindi: hi,
};

export function translate(key, currentLanguage = 'english', replacements = {}) {
	const dictionary = dictionaries[currentLanguage] || dictionaries.english;
	const fallbackDictionary = dictionaries.english;
	let value = dictionary[key] || fallbackDictionary[key] || key;

	for (const [name, replacement] of Object.entries(replacements)) {
		value = value.replaceAll(`{${name}}`, String(replacement));
	}

	return value;
}

export const t = derived(language, ($language) => {
	return (key, replacements) => translate(key, $language, replacements);
});
