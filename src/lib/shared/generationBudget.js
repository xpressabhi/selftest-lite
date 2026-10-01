// Retry budget for a single generation attempt loop.
//
// The client gave every generation 180 seconds and allowed three attempts, so
// one unlucky paper could hold a user in front of a spinner for nine minutes.
// Two facts from production telemetry drove this:
//
//   - 10 production requests hit the 180s server deadline; 6 of them asked for
//     a 10-question paper whose median generation is 9.4s.
//   - Client `generate:fail` last fired on 2026-09-22 while server 408s
//     continued through 2026-09-28, because a user who gives up and leaves is
//     not a failure event. The attempt loop could not tell the difference
//     between "still working" and "abandoned".
//
// The client timeout must outlast the server's own deadline, otherwise the
// abort races the 408 and the user sees a bare client timeout instead of the
// reason the request failed.

/** Matches GENERATION_TIMEOUT_MS in src/routes/api/generate/+server.js. */
export const SERVER_GENERATION_TIMEOUT_MS = 180_000;

/** Slack so the server's 408 arrives before the client's own abort. */
export const CLIENT_TIMEOUT_SLACK_MS = 15_000;

export const CLIENT_GENERATION_TIMEOUT_MS =
	SERVER_GENERATION_TIMEOUT_MS + CLIENT_TIMEOUT_SLACK_MS;

/** Ceiling across every attempt of one generation. */
export const GENERATION_BUDGET_MS = 300_000;

export const MAX_GENERATION_ATTEMPTS = 3;

/**
 * Whether another attempt is worth starting.
 *
 * Returns a reason instead of a boolean so the caller can report which limit
 * stopped it — 'attempts' and 'budget' are different problems, and collapsing
 * them into "gave up" is what made this invisible in the first place.
 */
export function nextAttemptAllowed({ attempt, elapsedMs, maxAttempts, budgetMs }) {
	// The budget only accumulates across retries, so the first attempt is
	// never gated by it.
	if (attempt <= 1) {
		return { allowed: true, reason: null };
	}
	if (attempt >= maxAttempts) {
		return { allowed: false, reason: 'attempts' };
	}
	if (elapsedMs >= budgetMs) {
		return { allowed: false, reason: 'budget' };
	}
	return { allowed: true, reason: null };
}

/**
 * Client-side retryable for a server status. 408 is deliberately not retryable:
 * the server already spent its full budget on that request, so an immediate
 * repeat is the same request again.
 */
export function isRetryableGenerationStatus(status) {
	if (status === 408) {
		return false;
	}
	return status === 429 || status >= 500 || status === 0;
}

/** Terminal outcomes a generation can end in. Each is reported at most once. */
export const GENERATION_OUTCOMES = ['success', 'fail', 'cancel'];

/**
 * Latch for the "exactly one terminal event per generation" rule.
 *
 * A generation has three ways to end — success, failure, abandon — and two
 * places that can notice: the attempt loop, and the page teardown. Without a
 * shared latch they can both report, or neither can. Neither is acceptable:
 * double-counting inflates failure rates, and neither reporting is what made
 * abandoned generations invisible. Client `generate:fail` went quiet on
 * 2026-09-22 while server 408s continued through 2026-09-28 for exactly this
 * reason.
 *
 * `claim` returns true only for the first caller, which then emits its own
 * literal event name — this module deliberately does not name the events, so
 * the allowlist doctor (telemetryEvents.test.js) still sees every emit site.
 */
export function createTerminalEventGuard() {
	let claimed = null;
	return {
		/** True exactly once per generation, for the first terminal outcome. */
		claim(outcome) {
			if (claimed !== null || !GENERATION_OUTCOMES.includes(outcome)) {
				return false;
			}
			claimed = outcome;
			return true;
		},
		/** True while no terminal outcome has been claimed. */
		pending() {
			return claimed === null;
		},
		/** Starts a new generation. */
		reset() {
			claimed = null;
		},
		get outcome() {
			return claimed;
		},
	};
}
