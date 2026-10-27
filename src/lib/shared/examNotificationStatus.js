// Date and lifecycle primitives for notifications: shared by the server
// store, the sync pipeline and the browser hub. Deliberately free of
// node:crypto and any server imports so client components can use it.

export const CLOSING_SOON_DAYS = 7;

export const NOTIFICATION_STATUS = Object.freeze({
	UPCOMING: 'upcoming',
	OPEN: 'open',
	CLOSING_SOON: 'closing_soon',
	CLOSED: 'closed',
});

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Strict YYYY-MM-DD; null for anything else, including rolled-over days. */
export function parseIsoDate(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null;
	}
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	const roundTrip = date.toISOString().slice(0, 10);
	return roundTrip === value ? value : null;
}

export function addDays(isoDate, days) {
	const [year, month, day] = isoDate.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day + days));
	return date.toISOString().slice(0, 10);
}

/** Today's date in IST (the audience's day, not the UTC day). */
export function todayInIst(now = new Date()) {
	return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const DISPLAY_TITLE_MAX = 90;
const DEVANAGARI = /[\u0900-\u097F]/;
const LATIN = /[A-Za-z]/;

/**
 * A short, scannable card title from a scraped notice title.
 *
 * Official notices often publish one blob containing the Hindi notice, a slash
 * and the English notice (or a 240-character paragraph). The card needs a
 * headline: pick the segment in the reader's language when the source is
 * bilingual, otherwise take the first sentence, then clamp at a word boundary.
 * Display-only — the stored title and its dedupe key are untouched.
 */
export function notificationDisplayTitle(value, language = 'english') {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) {
		return '';
	}

	const segments = text
		.split(/\s*\/\s*/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length >= 20);
	let chosen = text;
	if (segments.length > 1) {
		const wantsHindi = language === 'hindi';
		const matching = segments.find((segment) =>
			wantsHindi ? DEVANAGARI.test(segment) : LATIN.test(segment)
		);
		chosen = matching || segments[0];
	}

	const firstSentence = chosen.split(/(?<=[.!?।])\s+/u)[0]?.trim();
	if (firstSentence && firstSentence.length >= 24) {
		chosen = firstSentence;
	}

	if (chosen.length <= DISPLAY_TITLE_MAX) {
		return chosen;
	}
	return `${chosen.slice(0, DISPLAY_TITLE_MAX).replace(/\s+\S*$/, '')}…`;
}

/**
 * Read-time status from the dates alone (never stored), so rows cannot go
 * stale waiting for a cron: open → closing_soon (≤7 days) → closed; with no
 * application window, an upcoming or passed exam date decides, else upcoming.
 */
export function deriveNotificationStatus({ applyEnd = null, examDate = null } = {}, todayIso) {
	const end = parseIsoDate(applyEnd);
	if (end) {
		if (end < todayIso) {
			return NOTIFICATION_STATUS.CLOSED;
		}
		if (end <= addDays(todayIso, CLOSING_SOON_DAYS)) {
			return NOTIFICATION_STATUS.CLOSING_SOON;
		}
		return NOTIFICATION_STATUS.OPEN;
	}
	const exam = parseIsoDate(examDate);
	if (exam && exam < todayIso) {
		return NOTIFICATION_STATUS.CLOSED;
	}
	return NOTIFICATION_STATUS.UPCOMING;
}
