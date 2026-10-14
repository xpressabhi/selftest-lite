import { get } from 'svelte/store';
import { t } from '#lib/client/i18n.js';
import { showToast } from '#lib/client/toast.js';

/**
 * Shares a URL: native share sheet first, clipboard + toast as the fallback.
 * A dismissed sheet is a `cancelled` outcome, not a failure, and must not
 * trigger a second, surprising clipboard action. Returns the method used so
 * callers can log it.
 */
export async function shareLink({ title = '', text = '', url }) {
	if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, text, url });
			return 'native';
		} catch (error) {
			if (error?.name === 'AbortError') {
				return 'cancelled';
			}
			// Fall through to the clipboard fallback.
		}
	}

	try {
		await navigator.clipboard.writeText(url);
		showToast(get(t)('playgroundLinkCopied'), 'success');
		return 'clipboard';
	} catch {
		showToast(get(t)('playgroundShareFailed'), 'error');
		return 'failed';
	}
}
