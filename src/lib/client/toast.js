import { writable } from 'svelte/store';

export const toast = writable(null);

let toastTimer;

export function showToast(message, type = 'info', durationMs = 3000) {
	window.clearTimeout(toastTimer);
	toast.set({ type, message });
	toastTimer = window.setTimeout(() => {
		toast.set(null);
	}, durationMs);
}
