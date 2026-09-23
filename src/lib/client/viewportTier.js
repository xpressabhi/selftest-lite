// Pure viewport-tier helper for the plan card's keyboard tiers.
//
// The mobile keyboard halves the visible area; the card (and the search strip)
// degrade to denser tiers instead of losing content. The tier is a pure
// function of the visual viewport height so it can be unit tested and E2E
// emulated by resizing the viewport.
// spec: docs/superpowers/specs/2026-09-23-calm-morph-planner-design.md

/** Below this visible height the card goes dense (keyboard open on most phones). */
export const DENSE_MAX_HEIGHT = 480;

/** Below this visible height the card goes micro (landscape, small SE). */
export const MICRO_MAX_HEIGHT = 360;

/**
 * @param {number} height visible height in CSS pixels
 * @returns {'full'|'dense'|'micro'}
 */
export function tierForHeight(height) {
	const value = Number(height);
	if (!Number.isFinite(value) || value <= 0) {
		return 'full';
	}
	if (value < MICRO_MAX_HEIGHT) {
		return 'micro';
	}
	if (value < DENSE_MAX_HEIGHT) {
		return 'dense';
	}
	return 'full';
}

/** Visible height of the viewport; 0 while there is no window (SSR). */
export function readVisibleHeight() {
	if (typeof window === 'undefined') {
		return 0;
	}
	const viewport = window.visualViewport;
	if (viewport && Number.isFinite(viewport.height) && viewport.height > 0) {
		return viewport.height;
	}
	return typeof window.innerHeight === 'number' ? window.innerHeight : 0;
}

/**
 * Calls `callback(tier)` immediately and on every viewport change.
 * @param {(tier: 'full'|'dense'|'micro') => void} callback
 * @returns {() => void} cleanup
 */
export function observeViewportTier(callback) {
	if (typeof window === 'undefined' || typeof callback !== 'function') {
		return () => {};
	}
	const notify = () => callback(tierForHeight(readVisibleHeight()));
	notify();
	window.addEventListener('resize', notify);
	window.visualViewport?.addEventListener('resize', notify);
	window.visualViewport?.addEventListener('scroll', notify);
	return () => {
		window.removeEventListener('resize', notify);
		window.visualViewport?.removeEventListener('resize', notify);
		window.visualViewport?.removeEventListener('scroll', notify);
	};
}
