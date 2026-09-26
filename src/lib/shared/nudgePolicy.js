// Client-safe nudge policy primitives: pages, kinds, thresholds, cohort and
// eligibility. Shared by the server engine (`src/lib/server/nudges.js`) and
// the browser ledger (`src/lib/client/nudge.js`) so eligibility can never
// drift between the pre-filter and the question builder.
//
// Deliberately free of node:crypto, zod and any server imports.

export const NUDGE_PAGES = ['results', 'home', 'notifications'];
export const SHARE_KINDS = ['share_result', 'challenge_friend', 'share_streak'];
export const NUDGE_KINDS = [...SHARE_KINDS, 'enable_reminders'];

export const NUDGE_CONFIDENCE_MIN = 0.5;
export const NUDGE_CONFIDENCE_HIGH = 0.8;
export const SHARE_PRIDE_MIN = 1.0;
export const REMINDER_FIT_MIN = 1.5;
export const RECEPTIVITY_MIN = 0.55;
export const NOTIFICATION_RELEVANCE_MIN = 1.0;
export const MAX_NOTIFICATION_CANDIDATES = 6;
export const CHALLENGE_MIN_PCT = 60;
export const STREAK_SHARE_MIN = 3;
export const NUDGE_HOLDOUT_PERCENT = 10;

const COHORT_REPEAT_DAYS = 2;

/** Server-derived cohort: returning on a second day is the habit signal. */
export function nudgeCohort(state) {
	return Number(state?.distinctTestDays) >= COHORT_REPEAT_DAYS ? 'repeat' : 'new';
}

/** The asks that may even be offered to this learner right now, if any. */
export function eligibleNudgeKinds(state) {
	if (!state || !NUDGE_PAGES.includes(state.page) || state.page === 'notifications') {
		return [];
	}
	const kinds = [];
	if (state.page === 'results' && state.testsTotal >= 1 && !state.shareSheetOpenedThisResult) {
		kinds.push('share_result');
		const score = state.lastScore;
		if ((score && score.pct >= CHALLENGE_MIN_PCT) || state.bestBeaten) {
			kinds.push('challenge_friend');
		}
	}
	if (state.page === 'home') {
		if (state.currentStreak >= STREAK_SHARE_MIN) {
			kinds.push('share_streak');
		}
		if (nudgeCohort(state) === 'repeat' && state.reminderState === 'off') {
			kinds.push('enable_reminders');
		}
	}
	return kinds;
}

/** 'share' groups every sharing ask; 'push' is the permission ask. */
export function nudgeKindGroup(kind) {
	return kind === 'enable_reminders' ? 'push' : 'share';
}
