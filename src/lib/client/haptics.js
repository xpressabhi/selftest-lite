// Shared patterns for micro-interaction moments. All calls are best-effort;
// unsupported platforms simply no-op.
export const HAPTIC_COMMIT = 12;
export const HAPTIC_SUCCESS = [10, 30, 18];
export const HAPTIC_ERROR = [24, 50, 24];

export function triggerVibration(pattern) {
	if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
		return false;
	}
	try {
		navigator.vibrate(pattern);
		return true;
	} catch {
		return false;
	}
}
