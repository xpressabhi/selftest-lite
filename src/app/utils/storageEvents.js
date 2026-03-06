export const LOCAL_STORAGE_CHANGE_EVENT = 'selftest-local-change';

export function emitLocalStorageChange(keys) {
	if (typeof window === 'undefined') {
		return;
	}

	const normalizedKeys = (Array.isArray(keys) ? keys : [keys]).filter(
		(key) => typeof key === 'string' && key.length > 0,
	);
	if (normalizedKeys.length === 0) {
		return;
	}

	window.dispatchEvent(
		new CustomEvent(LOCAL_STORAGE_CHANGE_EVENT, {
			detail: {
				keys: [...new Set(normalizedKeys)],
			},
		}),
	);
}
