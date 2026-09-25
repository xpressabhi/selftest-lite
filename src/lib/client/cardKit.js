// Shared plumbing for the 1080x1920 share cards (streak, test, score).
//
// Browser-only helpers live here so the async boundary (logo load, PNG blob,
// native share) is in one place; renderers stay synchronous and take the
// pre-loaded logo. Palette values mirror the light-theme tokens in
// src/lib/styles/globals.css (canvas cannot read CSS variables).

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export const CARD_PALETTE = {
	// globals.css @theme / :root light tokens
	brand50: '#eef2ff',
	brand100: '#e0e7ff',
	brand600: '#4f46e5',
	brand700: '#4338ca',
	surface: '#ffffff',
	surfaceMuted: '#f8fafc',
	text: '#111827',
	textMuted: '#64748b',
	line: '#e2e8f0',
	// Streak language (matches StreakCard.svelte ball levels)
	ball1: '#fcd34d',
	ball1Ink: '#78350f',
	ball2: '#f59e0b',
	ball2Ink: '#78350f',
	ball3: '#b45309',
	ball3Ink: '#fff7ed',
	warn: '#b45309',
	star: '#d97706',
	locked: '#cbd5e1',
};

const CARD_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Canvas font shorthand from size/weight, on the shared system stack. */
export function cardFont(size, weight = 500) {
	return `${weight} ${size}px ${CARD_FONT}`;
}

/** Paints the family background: brand-50 wash to white to surface-muted. */
export function drawCardBackground(ctx) {
	const background = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
	background.addColorStop(0, CARD_PALETTE.brand50);
	background.addColorStop(0.38, CARD_PALETTE.surface);
	background.addColorStop(1, CARD_PALETTE.surfaceMuted);
	ctx.fillStyle = background;
	ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/** URL line plus the quiet brand footer shared by every card. */
export function drawCardFooter(ctx, url = '') {
	ctx.textAlign = 'center';
	if (url) {
		ctx.font = cardFont(40, 800);
		ctx.fillStyle = CARD_PALETTE.brand600;
		ctx.fillText(stripToWidth(ctx, url, CARD_WIDTH - 160), CARD_WIDTH / 2, 1690);
	}
	ctx.font = cardFont(30, 500);
	ctx.fillStyle = CARD_PALETTE.textMuted;
	ctx.fillText('Made with selftest', CARD_WIDTH / 2, 1790);
}

function stripToWidth(ctx, text, maxWidth) {
	let value = String(text || '');
	if (ctx.measureText(value).width <= maxWidth) {
		return value;
	}
	while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
		value = value.slice(0, -1);
	}
	return `${value}…`;
}

/** Trims the caption and appends the URL on its own line when missing. */
export function shareCardText(caption, url) {
	const text = String(caption || '').trim();
	const link = String(url || '').trim();
	if (!link) {
		return text;
	}
	if (!text || text.includes(link)) {
		return text || link;
	}
	return `${text}\n${link}`;
}

/** File name for a card kind; unknown kinds fall back to a generic name. */
export function cardFilename(kind) {
	const safe = ['streak', 'test', 'score'].includes(kind) ? kind : 'card';
	return `selftest-${safe}.png`;
}

let logoPromise = null;

/** Loads the app icon once; resolves null on any failure so shares never block. */
export function loadCardLogo() {
	if (typeof window === 'undefined' || typeof Image === 'undefined') {
		return Promise.resolve(null);
	}
	if (!logoPromise) {
		logoPromise = new Promise((resolve) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () => resolve(null);
			image.src = '/icons/192.png';
		});
	}
	return logoPromise;
}

function roundedRectPath(ctx, x, y, size, radius) {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + size, y, x + size, y + size, radius);
	ctx.arcTo(x + size, y + size, x, y + size, radius);
	ctx.arcTo(x, y + size, x, y, radius);
	ctx.arcTo(x, y, x + size, y, radius);
	ctx.closePath();
}

/** Draws the logo as a rounded tile; no-op without a logo or context. */
export function drawCardLogo(ctx, logo, { x = 0, y = 0, size = 84 } = {}) {
	if (!ctx || !logo) {
		return false;
	}
	const radius = size * 0.22;
	ctx.save();
	roundedRectPath(ctx, x, y, size, radius);
	ctx.clip();
	ctx.drawImage(logo, x, y, size, size);
	ctx.restore();
	ctx.save();
	roundedRectPath(ctx, x, y, size, radius);
	ctx.strokeStyle = CARD_PALETTE.line;
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.restore();
	return true;
}

/** Rasterizes a canvas to a PNG File; null when the blob cannot be produced. */
export function canvasToFile(canvas, filename) {
	if (!canvas?.toBlob) {
		return Promise.resolve(null);
	}
	return new Promise((resolve) => {
		canvas.toBlob((blob) => {
			resolve(blob ? new File([blob], filename, { type: 'image/png' }) : null);
		}, 'image/png');
	});
}

/**
 * Shares the PNG through the native sheet, falling back to a download.
 * Returns 'shared' | 'downloaded' | 'cancelled' | 'failed'; the URL rides in
 * the text because some platforms drop a separate `url` when files attach.
 */
export async function shareCardFile(file, { title = '', text = '', url = '' } = {}) {
	if (!file) {
		return 'failed';
	}
	const message = shareCardText(text, url);
	try {
		if (
			typeof navigator !== 'undefined' &&
			navigator.share &&
			navigator.canShare?.({ files: [file] })
		) {
			await navigator.share({ files: [file], title, text: message });
			return 'shared';
		}
		const objectUrl = URL.createObjectURL(file);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = file.name;
		anchor.click();
		window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
		return 'downloaded';
	} catch (error) {
		if (error?.name === 'AbortError') {
			return 'cancelled';
		}
		return 'failed';
	}
}
