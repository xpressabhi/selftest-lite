// Daily reminder scheduling, shared by the due-subscription query
// (src/lib/server/storage.js) and the hourly sender (scripts/send-reminders.mjs)
// so both always agree on the window and on a subscriber's chosen hour.
export const REMINDER_HOURS = [7, 8, 20, 21];
export const REMINDER_MIN_GAP_HOURS = 20;
export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Kolkata';

// Subscriptions due right now: enabled, past the minimum gap since the last
// send, and the subscriber's local hour matches their chosen hour — or one of
// the smart morning/evening windows when they have not chosen one.
export const DUE_SUBSCRIPTIONS_SQL = `
	SELECT id, endpoint, p256dh, auth, timezone
	FROM push_subscription,
		LATERAL (
			SELECT EXTRACT(
				HOUR FROM (NOW() AT TIME ZONE COALESCE(NULLIF(timezone, ''), $3))
			)::int AS local_hour
		) clock
	WHERE enabled = TRUE
		AND (last_sent_at IS NULL OR last_sent_at < NOW() - make_interval(hours => $2::int))
		AND CASE
			WHEN reminder_hour IS NULL THEN clock.local_hour = ANY($1::int[])
			ELSE clock.local_hour = reminder_hour
		END`;

export const DUE_SUBSCRIPTION_PARAMS = [
	REMINDER_HOURS,
	REMINDER_MIN_GAP_HOURS,
	DEFAULT_REMINDER_TIMEZONE,
];

/**
 * Normalizes a chosen reminder hour.
 * @returns {number|null} the hour (0-23), or null for the smart default.
 * @returns {undefined} when the value is not a valid hour.
 */
export function parseReminderHour(value) {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	const numeric = typeof value === 'string' ? Number(value) : value;
	if (typeof numeric !== 'number' || !Number.isInteger(numeric) || numeric < 0 || numeric > 23) {
		return undefined;
	}
	return numeric;
}
