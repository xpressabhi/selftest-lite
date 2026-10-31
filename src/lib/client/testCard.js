// Test share card (1080x1920): logo, localized kicker, wrapped topic, meta
// chips, CTA and the recipient-openable test URL. Synchronous; the caller
// pre-loads the logo through cardKit and passes localized strings.

import {
	CARD_PALETTE,
	CARD_WIDTH,
	cardFont,
	drawCardBackground,
	drawCardFooter,
	drawCardLogo,
	roundedRectPath,
} from './cardKit.js';
import { fitTextToLines } from './cardText.js';
import { stripCardText } from './scoreCard.js';

function drawChips(ctx, chips, y) {
	const labels = (Array.isArray(chips) ? chips : [])
		.map((chip) => String(chip || ''))
		.filter(Boolean);
	if (labels.length === 0) {
		return y;
	}
	const layout = (fontSize, height, padding) => {
		ctx.font = cardFont(fontSize, 700);
		const widths = labels.map((label) => ctx.measureText(label).width + padding * 2);
		const total = widths.reduce((sum, width) => sum + width, 0) + 20 * (labels.length - 1);
		return { widths, total, height };
	};
	let { widths, total, height } = layout(36, 76, 32);
	if (total > CARD_WIDTH - 160) {
		({ widths, total, height } = layout(30, 68, 26));
	}
	let x = (CARD_WIDTH - total) / 2;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	labels.forEach((label, index) => {
		roundedRectPath(ctx, x, y, widths[index], height, height / 2);
		ctx.fillStyle = CARD_PALETTE.brand50;
		ctx.fill();
		ctx.fillStyle = CARD_PALETTE.brand700;
		ctx.fillText(label, x + widths[index] / 2, y + height / 2 + 2);
		x += widths[index] + 20;
	});
	ctx.textBaseline = 'alphabetic';
	return y + height;
}

/**
 * Paints the test card. `data`: { kicker, topic, chips, cta, ctaSub, url };
 * all strings are localized by the caller.
 */
export function drawTestCard(canvas, data = {}, logo = null) {
	const ctx = canvas?.getContext?.('2d');
	if (!ctx) {
		return false;
	}
	const { kicker = '', topic = '', chips = [], cta = '', ctaSub = '', url = '' } = data;

	drawCardBackground(ctx);
	drawCardLogo(ctx, logo, { x: CARD_WIDTH / 2 - 44, y: 80, size: 88 });

	ctx.textAlign = 'center';
	ctx.font = cardFont(34, 800);
	ctx.fillStyle = CARD_PALETTE.brand600;
	ctx.fillText(String(kicker).toUpperCase(), CARD_WIDTH / 2, 330);

	const topicFit = fitTextToLines(stripCardText(topic), [88, 78, 68], {
		maxWidth: CARD_WIDTH - 160,
		maxLines: 3,
		measureForSize: (size) => {
			ctx.font = cardFont(size, 800);
			return (value) => ctx.measureText(value).width;
		},
	});
	ctx.font = cardFont(topicFit.size, 800);
	ctx.fillStyle = CARD_PALETTE.text;
	const topicGap = Math.round(topicFit.size * 1.25);
	topicFit.lines.forEach((line, index) => {
		ctx.fillText(line, CARD_WIDTH / 2, 580 + index * topicGap);
	});

	// Shorter topics leave more air before the CTA; long ones keep their
	// distance so the CTA never crowds the URL line.
	const ctaGap = topicFit.lines.length >= 3 ? 240 : 480;
	let y = 580 + Math.max(0, topicFit.lines.length - 1) * topicGap + 120;
	y = drawChips(ctx, chips, y) + ctaGap;

	ctx.textAlign = 'center';
	ctx.font = cardFont(64, 800);
	ctx.fillStyle = CARD_PALETTE.brand600;
	ctx.fillText(cta, CARD_WIDTH / 2, y);
	ctx.font = cardFont(40, 500);
	ctx.fillStyle = CARD_PALETTE.textMuted;
	ctx.fillText(ctaSub, CARD_WIDTH / 2, y + 88);

	drawCardFooter(ctx, url);
	return true;
}
