let wakeLock = null;
let shouldBeAwake = false;
let visibilityHandlerAttached = false;

function isNativePlatform() {
	return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

async function requestNativeKeepAwake() {
	const { KeepAwake } = await import('@capgo/capacitor-keep-awake');
	await KeepAwake.keepAwake();
}

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
	shouldBeAwake = true;
	// Android WebView does not expose the Screen Wake Lock API, so the
	// Capacitor app uses the native keep-awake plugin instead.
	if (isNativePlatform()) {
		try {
			await requestNativeKeepAwake();
		} catch {
			// Best effort: the OS may deny or the plugin may be unavailable.
		}
		return;
	}
	if (
		typeof navigator === 'undefined' ||
		typeof document === 'undefined' ||
		typeof navigator.wakeLock?.request !== 'function'
	) {
		return;
	}
	attachVisibilityHandler();
	if (document.visibilityState === 'visible') {
		await requestWakeLock();
	}
}

export function stopKeepingScreenAwake() {
	shouldBeAwake = false;
	if (isNativePlatform()) {
		void import('@capgo/capacitor-keep-awake')
			.then(({ KeepAwake }) => KeepAwake.allowSleep())
			.catch(() => {});
	}
	if (wakeLock) {
		void wakeLock.release().catch(() => {});
		wakeLock = null;
	}
}
