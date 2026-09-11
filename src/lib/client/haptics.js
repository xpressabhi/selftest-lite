import { get } from 'svelte/store';
import { isDataSaverActive } from './preferences';

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
