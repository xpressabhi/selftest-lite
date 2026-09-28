import { get, writable } from 'svelte/store';
import { STORAGE_KEYS } from './constants';
import { readJson, writeJson } from './storage';

// Welcome tour state. Deliberately module-level: the language step performs a
// client-side navigation to the localized twin, which remounts the home page,
// and the tour must continue where it was.
export const welcomeTour = writable({ status: 'idle', step: 1 });

export function hasFinishedTour() {
	if (typeof window === 'undefined') {
		return true;
	}
	return Boolean(readJson(STORAGE_KEYS.WELCOME_TOUR_DONE_AT, null));
}

export function beginTour() {
	welcomeTour.set({ status: 'active', step: 1 });
}

export function setTourStep(step) {
	welcomeTour.update((state) =>
		state.status === 'active' ? { ...state, step } : state
	);
}

function markDone() {
	writeJson(STORAGE_KEYS.WELCOME_TOUR_DONE_AT, Date.now());
	welcomeTour.set({ status: 'done', step: 1 });
}

export function skipTour() {
	markDone();
}

export function finishTour() {
	markDone();
}

export function tourStep() {
	return get(welcomeTour).step;
}
