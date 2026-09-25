// Vertical score-card renderer (1080x1920, WhatsApp Status-first) plus pure
// text helpers. System fonts only so Hindi shaping works without webfont
// loading; the card uses one high-contrast theme regardless of app theme.

import { CARD_HEIGHT, CARD_WIDTH } from './cardKit.js';

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
 * Paints the card. `data`: { topic, score, total, pct, timeLabel, brand,
 * challenge, link }. Draws nothing when the context is unavailable.
 */
export function drawScoreCard(canvas, data = {}) {
	const context = canvas?.getContext?.('2d');
	if (!context) {
		return false;
	}
	const { topic = '', score = 0, total = 0, pct = 0, timeLabel = '', brand = 'selftest', challenge = '', link = '' } = data;
	context.save();
	context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

	const background = context.createLinearGradient(0, 0, 0, CARD_HEIGHT);
	background.addColorStop(0, '#1e1b4b');
	background.addColorStop(0.55, '#312e81');
	background.addColorStop(1, '#0f766e');
	context.fillStyle = background;
	context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

	context.textAlign = 'center';
	context.fillStyle = 'rgba(255,255,255,0.85)';
	context.font = '600 44px system-ui, sans-serif';
	context.fillText(brand, CARD_WIDTH / 2, 150);

	// Score hero ring.
	const centerX = CARD_WIDTH / 2;
	const centerY = 560;
	const radius = 220;
	context.lineWidth = 34;
	context.strokeStyle = 'rgba(255,255,255,0.22)';
	context.beginPath();
	context.arc(centerX, centerY, radius, 0, Math.PI * 2);
	context.stroke();
	context.strokeStyle = '#fbbf24';
	context.lineCap = 'round';
	context.beginPath();
	context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, pct / 100)));
	context.stroke();
	context.fillStyle = '#ffffff';
	context.font = '800 150px system-ui, sans-serif';
	context.fillText(`${Math.round(pct)}%`, centerX, centerY + 55);

	context.font = '600 54px system-ui, sans-serif';
	context.fillStyle = 'rgba(255,255,255,0.95)';
	context.fillText(`${score} / ${total}`, centerX, centerY + 300);
	if (timeLabel) {
		context.font = '500 40px system-ui, sans-serif';
		context.fillStyle = 'rgba(255,255,255,0.75)';
		context.fillText(timeLabel, centerX, centerY + 370);
	}

	const lines = wrapCardText(topic, 30, 3);
	context.font = '700 64px system-ui, sans-serif';
	context.fillStyle = '#ffffff';
	lines.forEach((line, index) => {
		context.fillText(line, centerX, 1050 + index * 84);
	});

	if (challenge) {
		context.font = '600 46px system-ui, sans-serif';
		context.fillStyle = '#fde68a';
		context.fillText(stripCardText(challenge).slice(0, 60), centerX, 1420);
	}
	if (link) {
		context.font = '500 36px system-ui, sans-serif';
		context.fillStyle = 'rgba(255,255,255,0.8)';
		context.fillText(stripCardText(link).slice(0, 64), centerX, 1560);
	}

	context.font = '500 34px system-ui, sans-serif';
	context.fillStyle = 'rgba(255,255,255,0.6)';
	context.fillText('Made with selftest', centerX, CARD_HEIGHT - 90);
	context.restore();
	return true;
}
