// 50-50 hint eligibility thresholds shared by the server's offer predicate and
// the test page's dwell/skip signals. Kept framework-neutral so the two sides
// can never drift.

export const HINT_DWELL_SEC = 45;
export const HINT_SKIP_STREAK = 2;
export const MAX_HINTS_PER_TEST = 3;
