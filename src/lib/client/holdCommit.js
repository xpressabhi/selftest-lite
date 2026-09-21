// Timing rules for hold-to-confirm buttons. Kept pure so the thresholds are
// testable and the nudge behaviour is documented in one place.
export const HOLD_DURATION_MS = 900;

// Releases shorter than this are treated as taps: the button nudges the hint
// instead of silently doing nothing.
export const HOLD_NUDGE_MS = 350;

export function holdProgress(elapsedMs) {
	if (HOLD_DURATION_MS <= 0) {
		return 1;
	}
	const ratio = Number(elapsedMs) / HOLD_DURATION_MS;
	return Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
}

export function isHoldComplete(elapsedMs) {
	return Number(elapsedMs) >= HOLD_DURATION_MS;
}

export function isTapRelease(elapsedMs) {
	return Number(elapsedMs) < HOLD_NUDGE_MS;
}
