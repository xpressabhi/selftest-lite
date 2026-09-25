// Orchestrates the 1080x1920 share cards: build a canvas, paint it with the
// page's card renderer, rasterize, and hand the PNG to the native share sheet.
//
// Pages own the translated card data, the share title/text/url and their
// analytics event; this module owns the canvas -> logo -> draw -> file ->
// share sequence and the success/failure toasts, so every card shares it.

import { get } from 'svelte/store';
import {
	CARD_HEIGHT,
	CARD_WIDTH,
	canvasToFile,
	cardFilename,
	loadCardLogo,
	shareCardFile,
} from '$lib/client/cardKit';
import { t } from '$lib/client/i18n';
import { showToast } from '$lib/client/toast';

/**
 * Renders `card` with `draw(canvas, card, logo)` and shares the resulting PNG.
 * `savedToastKey` is the message key shown when the image is downloaded instead
 * of shared; every failure toasts `cardShareFailed`.
 */
export async function shareCard({
	draw,
	card = {},
	kind = 'card',
	title = '',
	text = '',
	url = '',
	savedToastKey,
}) {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = CARD_WIDTH;
		canvas.height = CARD_HEIGHT;
		const logo = await loadCardLogo();
		if (!draw(canvas, card, logo)) {
			throw new Error('card');
		}
		const file = await canvasToFile(canvas, cardFilename(kind));
		const result = await shareCardFile(file, { title, text, url });
		if (result === 'downloaded') {
			showToast(get(t)(savedToastKey), 'success');
		} else if (result === 'failed') {
			showToast(get(t)('cardShareFailed'), 'warning');
		}
	} catch {
		showToast(get(t)('cardShareFailed'), 'warning');
	}
}
