import english from '../locales/english.json';

const dictionaries = {
	english,
};

export function getDictionary(language) {
	return dictionaries[language] || dictionaries.english;
}

export async function loadDictionary(language) {
	if (language !== 'hindi' || dictionaries.hindi) {
		return;
	}

	const { default: hindi } = await import('../locales/hindi.json');
	dictionaries.hindi = hindi;
}
