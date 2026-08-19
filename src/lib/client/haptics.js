import { get } from 'svelte/store';
import { isDataSaverActive } from './preferences';

export function triggerVibration(pattern) {
	if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
		return false;
	}
	if (get(isDataSaverActive)) {
		return false;
	}
	try {
		navigator.vibrate(pattern);
		return true;
	} catch {
		return false;
	}
}
