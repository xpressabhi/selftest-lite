let wakeLock = null;
let shouldBeAwake = false;
let visibilityHandlerAttached = false;

function attachVisibilityHandler() {
	if (visibilityHandlerAttached || typeof document === 'undefined') {
		return;
	}
	visibilityHandlerAttached = true;
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && shouldBeAwake) {
			void requestWakeLock();
		}
	});
}

async function requestWakeLock() {
	try {
		const lock = await navigator.wakeLock.request('screen');
		if (!shouldBeAwake) {
			void lock.release().catch(() => {});
			return;
		}
		wakeLock = lock;
		lock.addEventListener('release', () => {
			if (wakeLock === lock) {
				wakeLock = null;
			}
		});
	} catch {
		wakeLock = null;
	}
}

export async function keepScreenAwake() {
	if (
		typeof navigator === 'undefined' ||
		typeof document === 'undefined' ||
		typeof navigator.wakeLock?.request !== 'function'
	) {
		return;
	}
	attachVisibilityHandler();
	shouldBeAwake = true;
	if (document.visibilityState === 'visible') {
		await requestWakeLock();
	}
}

export function stopKeepingScreenAwake() {
	shouldBeAwake = false;
	if (wakeLock) {
		void wakeLock.release().catch(() => {});
		wakeLock = null;
	}
}
