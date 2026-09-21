// Score count-up used by the results page. The easing lives here (pure) so the
// rounding and clamping rules are testable.
export const COUNT_UP_MS = 700;

/** Eased value at `elapsedMs` for a count-up towards `target`. */
export function countUpValue(target, elapsedMs, durationMs = COUNT_UP_MS) {
	const value = Number(target) || 0;
	const duration = Number(durationMs);
	if (!(duration > 0)) {
		return value;
	}
	const progress = Math.max(0, Math.min(1, Number(elapsedMs) / duration));
	const eased = 1 - Math.pow(1 - progress, 3);
	return Math.round(value * eased);
}

/** Count-up is decorative: skip it for data-saver and reduced-motion users. */
export function shouldCountUp({ dataSaver = false, reduceMotion = false } = {}) {
	return !dataSaver && !reduceMotion;
}
