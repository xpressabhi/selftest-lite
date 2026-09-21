import { get } from 'svelte/store';
import { isDataSaverActive } from './preferences';

// Shared patterns for micro-interaction moments. `triggerVibration` already
// no-ops when data saver is on, so callers never need to guard.
export const HAPTIC_COMMIT = 12;
export const HAPTIC_SUCCESS = [10, 30, 18];
export const HAPTIC_ERROR = [24, 50, 24];

function isNativePlatform() {
	return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

export function triggerVibration(pattern) {
	if (get(isDataSaverActive)) {
		return false;
	}
	// In the Capacitor shell navigator.vibrate is unreliable (the WebView needs
	// the VIBRATE permission); use the native Haptics plugin instead.
	if (isNativePlatform()) {
		const duration = Array.isArray(pattern) ? Number(pattern[0]) || 0 : Number(pattern) || 0;
		void import('@capacitor/haptics')
			.then(({ Haptics, ImpactStyle }) =>
				Haptics.impact({
					style: duration >= 60 ? ImpactStyle.Medium : ImpactStyle.Light,
				})
			)
			.catch(() => {
				// Haptics are best-effort; never surface an error.
			});
		return true;
	}
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
