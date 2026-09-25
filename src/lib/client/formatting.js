// Locale-aware date formatting for client components.

/** Locale tag for a stored language preference (`english` | `hindi`). */
export function localeFor(language) {
	return language === 'hindi' ? 'hi-IN' : 'en-IN';
}

// Intl formatters are expensive to construct; keep one per locale+options.
const dateFormatters = new Map();

function dateFormatterFor(language, options) {
	const locale = localeFor(language);
	const key = `${locale}|${JSON.stringify(options)}`;
	let formatter = dateFormatters.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(locale, options);
		dateFormatters.set(key, formatter);
	}
	return formatter;
}

/** Formats `value` as a date, returning '' for missing or invalid values. */
export function formatDate(value, language, options) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : dateFormatterFor(language, options).format(date);
}
