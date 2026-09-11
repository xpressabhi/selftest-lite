// Native shell behaviours for the Capacitor app: app-open telemetry and
// hardware back-button handling. No-ops on the web.

import { track } from './telemetry';

function isNativePlatform() {
	return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

export async function initNativeShell() {
	if (!isNativePlatform()) {
		return;
	}

	track('app:open', {
		platform: window.Capacitor?.getPlatform?.() || 'android',
	});

	try {
		const { App } = await import('@capacitor/app');
		App.addListener('backButton', ({ canGoBack }) => {
			// First close any open dialog/sheet, then navigate back, and only
			// minimize the app at the root (avoids abrupt exits).
			const dialog = document.querySelector(
				'.modal.show, [role="dialog"]:not([hidden]), .review-sheet-backdrop'
			);
			if (dialog) {
				document.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
				);
				return;
			}
			if (canGoBack) {
				window.history.back();
				return;
			}
			void App.minimizeApp();
		});
	} catch (error) {
		console.error('Failed to initialise native shell:', error);
	}
}
