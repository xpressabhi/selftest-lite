// Shared locale-aware formatting and presentation helpers for client
// components.

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

/** Formats a timestamp as a short date and wall-clock time. */
export function formatTime(value) {
	if (!value) return '-';
	return new Date(value).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/** Formats a timestamp as a wall-clock time. */
export function hourLabel(bucket) {
	return new Date(bucket).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

/** Formats a timestamp as a short day label. */
export function dayLabel(value) {
	return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Formats a count with locale separators; missing values read as 0. */
export function formatNumber(n) {
	if (n == null) return '0';
	return Number(n).toLocaleString();
}

/** Formats a byte count with binary units. */
export function formatBytes(bytes) {
	if (bytes == null) return '-';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = Number(bytes);
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Formats a metric value with an optional suffix. */
export function formatValue(value, suffix = '') {
	if (value == null) return '-';
	return `${value}${suffix}`;
}

/** Classifies a user-agent string as Bot, Mobile or Desktop. */
export function agentFamily(userAgent) {
	const ua = userAgent || '';
	if (/bot|crawler|spider|curl|wget|python-requests/i.test(ua)) return 'Bot';
	if (/mobi|android|iphone|ipad/i.test(ua)) return 'Mobile';
	return 'Desktop';
}
