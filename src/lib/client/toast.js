import { writable } from 'svelte/store';

export const toast = writable(null);

let nextId = 0;

export function showToast(message, type = 'info', durationMs = 3000) {
	return publish({ message, type, durationMs });
}

/**
 * Toast with an inline action (e.g. Undo). The toast component owns the
 * auto-dismiss timer so the fuse can pause while the user interacts.
 */
export function showToastWithAction(
	message,
	{ type = 'info', actionLabel = null, onAction = null, onDismiss = null, durationMs = 4500 } = {}
) {
	return publish({
		message,
		type,
		durationMs,
		actionLabel: typeof actionLabel === 'string' && actionLabel ? actionLabel : null,
		onAction: typeof onAction === 'function' ? onAction : null,
		onDismiss: typeof onDismiss === 'function' ? onDismiss : null,
	});
}

function publish(payload) {
	nextId += 1;
	const id = nextId;
	toast.set({ id, ...payload });
	return id;
}

export function dismissToast(id = null) {
	toast.update((current) => (current && (id === null || current.id === id) ? null : current));
}

export function runToastAction(entry) {
	if (typeof entry?.onAction !== 'function') {
		return false;
	}
	try {
		entry.onAction();
	} catch {
		// Actions are best-effort; a failed undo must not break the UI.
	}
	return true;
}

/** Notifies an entry's onDismiss hook once per toast; best-effort. */
export function runToastDismiss(entry, reason = 'dismiss') {
	if (typeof entry?.onDismiss !== 'function') {
		return false;
	}
	try {
		entry.onDismiss(reason);
	} catch {
		// Dismiss hooks are best-effort; telemetry must never block the UI.
	}
	return true;
}
