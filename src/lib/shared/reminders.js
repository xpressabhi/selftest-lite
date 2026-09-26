// Daily reminder scheduling for the hourly sender
// (scripts/send-reminders.mjs).
//
// GitHub's schedule is best-effort: runs arrive late, in bursts, or not at all
// for a given hour (measured ~6 runs/day on this repo, not 24). The rule is a
// catch-up window rather than an exact-hour match, so a subscriber is due from
// their slot until the quiet hour, at most once per REMINDER_MIN_GAP_HOURS.
export const REMINDER_DEFAULT_HOUR = 7;
export const REMINDER_QUIET_HOUR = 22;
export const REMINDER_MIN_GAP_HOURS = 20;
export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Kolkata';

// Subscriptions due right now: enabled, past the minimum gap since the last
// send, and the subscriber's local time inside the window that opens at their
// chosen hour — or at the smart default hour when they have not chosen one —
// and closes at the quiet hour (midnight when the slot itself is at/after it).
export const DUE_SUBSCRIPTIONS_SQL = `
	SELECT id, endpoint, p256dh, auth, timezone
	FROM push_subscription,
		LATERAL (
			SELECT EXTRACT(
				HOUR FROM (NOW() AT TIME ZONE COALESCE(NULLIF(timezone, ''), $3))
			)::int AS local_hour,
			EXTRACT(
				MINUTE FROM (NOW() AT TIME ZONE COALESCE(NULLIF(timezone, ''), $3))
			)::int AS local_minute
		) clock
	WHERE enabled = TRUE
		AND (last_sent_at IS NULL OR last_sent_at < NOW() - make_interval(hours => $2::int))
		AND (clock.local_hour * 60 + clock.local_minute)
			>= COALESCE(reminder_hour, $1::int) * 60
		AND (clock.local_hour * 60 + clock.local_minute)
			< CASE
				WHEN COALESCE(reminder_hour, $1::int) >= $4::int THEN 24 * 60
				ELSE $4::int * 60
			END`;

export const DUE_SUBSCRIPTION_PARAMS = [
	REMINDER_DEFAULT_HOUR,
	REMINDER_MIN_GAP_HOURS,
	DEFAULT_REMINDER_TIMEZONE,
	REMINDER_QUIET_HOUR,
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
