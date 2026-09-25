// Vertical score-card renderer (1080x1920, WhatsApp Status-first) plus pure
// text helpers. System fonts only so Hindi shaping works without webfont
// loading; the card uses one high-contrast theme regardless of app theme.

import {
	CARD_HEIGHT,
	CARD_PALETTE,
	CARD_WIDTH,
	cardFont,
	drawCardBackground,
	drawCardFooter,
	drawCardLogo,
} from './cardKit.js';

// Re-exported for existing consumers; the kit is the single source.
export { CARD_HEIGHT, CARD_WIDTH };

/** Strips markdown/links and collapses whitespace for canvas text. */
export function stripCardText(value) {
	return String(value || '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
		.replace(/[*_`~#>]/gu, '')
		.replace(/\s+/gu, ' ')
		.trim();
}

/**
 * Greedy word-wrap into at most `maxLines` lines of `maxChars` characters;
 * overflow ends the last line with an ellipsis.
 */
export function wrapCardText(text, maxChars, maxLines) {
	const words = stripCardText(text).split(' ').filter(Boolean);
	if (words.length === 0) {
		return [];
	}
	const lines = [];
	let current = '';
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length <= maxChars) {
			current = next;
			continue;
		}
		if (current) {
			lines.push(current);
		}
		current = word;
		if (lines.length === maxLines - 1) {
			break;
		}
	}
	if (current) {
		lines.push(current);
	}
	const used = lines.join(' ').split(' ').filter(Boolean).length;
	const total = words.length;
	if (used < total && lines.length > 0) {
		let last = lines[lines.length - 1];
		while (last.length >= maxChars - 1 && last.includes(' ')) {
			last = last.slice(0, last.lastIndexOf(' '));
		}
		lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
	}
	return lines.slice(0, maxLines);
}

/**
 * Paints the score card in the light share-card family. `data`: { topic,
 * score, total, pct, timeLabel, challenge, link }. Draws nothing when the
 * context is unavailable.
 */
export function drawScoreCard(canvas, data = {}, logo = null) {
	const context = canvas?.getContext?.('2d');
	if (!context) {
		return false;
	}
	const { topic = '', score = 0, total = 0, pct = 0, timeLabel = '', challenge = '', link = '' } = data;
	context.save();
	context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
	drawCardBackground(context);
	drawCardLogo(context, logo, { x: CARD_WIDTH / 2 - 44, y: 80, size: 88 });

	// Score hero ring.
	const centerX = CARD_WIDTH / 2;
	const centerY = 640;
	const radius = 220;
	context.lineWidth = 36;
	context.strokeStyle = CARD_PALETTE.brand100;
	context.beginPath();
	context.arc(centerX, centerY, radius, 0, Math.PI * 2);
	context.stroke();
	context.strokeStyle = CARD_PALETTE.brand600;
	context.lineCap = 'round';
	context.beginPath();
	context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, pct / 100)));
	context.stroke();
	context.textAlign = 'center';
	context.fillStyle = CARD_PALETTE.text;
	context.font = cardFont(150, 800);
	context.fillText(`${Math.round(pct)}%`, centerX, centerY + 55);

	context.font = cardFont(56, 800);
	context.fillText(`${score} / ${total}`, centerX, centerY + 310);
	if (timeLabel) {
		context.font = cardFont(40, 500);
		context.fillStyle = CARD_PALETTE.textMuted;
		context.fillText(timeLabel, centerX, centerY + 380);
	}

	const lines = wrapCardText(topic, 22, 3);
	context.font = cardFont(72, 800);
	context.fillStyle = CARD_PALETTE.text;
	lines.forEach((line, index) => {
		context.fillText(line, centerX, 1220 + index * 88);
	});

	if (challenge) {
		context.font = cardFont(46, 800);
		context.fillStyle = CARD_PALETTE.brand600;
		context.fillText(stripCardText(challenge).slice(0, 60), centerX, 1560);
	}
	drawCardFooter(context, link);
	context.restore();
	return true;
}
