// Streak share card (1080x1920): app-token light palette, logo, hero streak,
// rolling 7-day balls, stats and badges. Synchronous; the caller pre-loads the
// logo through cardKit. All copy arrives localized in `data`.

import {
	CARD_PALETTE,
	CARD_WIDTH,
	cardFont,
	drawCardBackground,
	drawCardFooter,
	drawCardLogo,
} from './cardKit.js';
import { wrapCardText } from './scoreCard.js';

const FLAME_PATH =
	'M12 3.5c3.5 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-10.5Z M12 12c1.7 2 2.5 3.2 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.3.8-2.5 2.5-4.5Z';
const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7';
const STAR_PATH = 'M12 4.5l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 10l5.2-.8z';

const WEEK_CENTER_Y = 790;
const WEEK_FIRST_X = 150;
const WEEK_STEP = 130;
const BALL_RADIUS = 50;

function drawIconPath(ctx, pathString, { x, y, size, color, fill = false, lineWidth = 1.6 }) {
	if (typeof Path2D === 'undefined') {
		return;
	}
	const path = new Path2D(pathString);
	ctx.save();
	ctx.translate(x - size / 2, y - size / 2);
	ctx.scale(size / 24, size / 24);
	if (fill) {
		ctx.fillStyle = color;
		ctx.fill(path);
	} else {
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}
	ctx.restore();
}

function drawWeek(ctx, week) {
	const cells = Array.isArray(week) ? week : [];
	// Connectors first so the balls sit on top.
	for (let index = 1; index < cells.length; index += 1) {
		const linked = cells[index]?.active && cells[index - 1]?.active;
		ctx.fillStyle = linked ? CARD_PALETTE.ball2 : CARD_PALETTE.line;
		ctx.fillRect(
			WEEK_FIRST_X + (index - 1) * WEEK_STEP + BALL_RADIUS,
			WEEK_CENTER_Y - 5,
			WEEK_STEP - BALL_RADIUS * 2,
			10
		);
	}
	cells.forEach((cell, index) => {
		const x = WEEK_FIRST_X + index * WEEK_STEP;
		const level = Number(cell?.level || 0);
		const fill =
			level >= 3
				? CARD_PALETTE.ball3
				: level === 2
					? CARD_PALETTE.ball2
					: level === 1
						? CARD_PALETTE.ball1
						: CARD_PALETTE.line;
		ctx.beginPath();
		ctx.arc(x, WEEK_CENTER_Y, BALL_RADIUS, 0, Math.PI * 2);
		ctx.fillStyle = fill;
		ctx.fill();
		if (level === 1) {
			drawIconPath(ctx, CHECK_PATH, {
				x,
				y: WEEK_CENTER_Y,
				size: 52,
				color: CARD_PALETTE.ball1Ink,
				lineWidth: 2.4,
			});
		} else if (level >= 2) {
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = cardFont(40, 800);
			ctx.fillStyle = level >= 3 ? CARD_PALETTE.ball3Ink : CARD_PALETTE.ball2Ink;
			ctx.fillText(level >= 3 ? '3+' : String(level), x, WEEK_CENTER_Y + 2);
			ctx.textBaseline = 'alphabetic';
		}
		if (cell?.isToday) {
			ctx.beginPath();
			ctx.arc(x, WEEK_CENTER_Y, BALL_RADIUS + 12, 0, Math.PI * 2);
			ctx.strokeStyle = CARD_PALETTE.star;
			ctx.lineWidth = 6;
			ctx.stroke();
		}
		ctx.textAlign = 'center';
		ctx.font = cardFont(32, 500);
		ctx.fillStyle = CARD_PALETTE.textMuted;
		ctx.fillText(String(cell?.weekdayLabel || ''), x, WEEK_CENTER_Y + 118);
	});
}

function drawStats(ctx, stats, labels) {
	const columns = [
		[stats.tests, labels.tests],
		[stats.accuracy, labels.accuracy],
		[stats.best, labels.best],
		[stats.max, labels.max],
	];
	ctx.strokeStyle = CARD_PALETTE.line;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(90, 1030);
	ctx.lineTo(CARD_WIDTH - 90, 1030);
	ctx.stroke();
	columns.forEach(([value, label], index) => {
		const x = 135 + index * 270;
		ctx.textAlign = 'center';
		ctx.font = cardFont(72, 800);
		ctx.fillStyle = CARD_PALETTE.text;
		ctx.fillText(String(value ?? ''), x, 1135);
		ctx.font = cardFont(30, 600);
		ctx.fillStyle = CARD_PALETTE.textMuted;
		ctx.fillText(String(label || '').toUpperCase(), x, 1190);
	});
}

function drawBadges(ctx, badges) {
	ctx.strokeStyle = CARD_PALETTE.line;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(90, 1270);
	ctx.lineTo(CARD_WIDTH - 90, 1270);
	ctx.stroke();
	(Array.isArray(badges) ? badges : []).forEach((badge, index) => {
		const x = 135 + index * 270;
		const earned = Boolean(badge?.earned);
		drawIconPath(ctx, STAR_PATH, {
			x,
			y: 1370,
			size: 72,
			color: earned ? CARD_PALETTE.star : CARD_PALETTE.locked,
			fill: true,
		});
		ctx.textAlign = 'center';
		ctx.font = cardFont(34, 800);
		ctx.fillStyle = earned ? CARD_PALETTE.text : CARD_PALETTE.textMuted;
		ctx.fillText(String(badge?.meta || ''), x, 1460);
		ctx.font = cardFont(30, 500);
		ctx.fillStyle = CARD_PALETTE.textMuted;
		ctx.fillText(String(badge?.title || ''), x, 1510);
	});
}

/**
 * Paints the streak card. `data`: { headline, subtitle, week, stats, labels,
 * badges, url }; `week` cells come from `buildStreakWeek`, badges are
 * `{ meta, title, earned }`.
 */
export function drawStreakCard(canvas, data = {}, logo = null) {
	const ctx = canvas?.getContext?.('2d');
	if (!ctx) {
		return false;
	}
	const { headline = '', subtitle = '', week = [], stats = {}, labels = {}, badges = [], url = '' } = data;

	drawCardBackground(ctx);
	drawCardLogo(ctx, logo, { x: CARD_WIDTH / 2 - 44, y: 80, size: 88 });

	drawIconPath(ctx, FLAME_PATH, {
		x: CARD_WIDTH / 2,
		y: 265,
		size: 96,
		color: CARD_PALETTE.warn,
		lineWidth: 1.7,
	});

	ctx.textAlign = 'center';
	ctx.font = cardFont(96, 800);
	ctx.fillStyle = CARD_PALETTE.text;
	ctx.fillText(headline, CARD_WIDTH / 2, 470);

	const subtitleLines = wrapCardText(subtitle, 42, 2);
	ctx.font = cardFont(40, 500);
	ctx.fillStyle = CARD_PALETTE.textMuted;
	subtitleLines.forEach((line, index) => {
		ctx.fillText(line, CARD_WIDTH / 2, 545 + index * 52);
	});

	drawWeek(ctx, week);
	drawStats(ctx, stats, labels);
	drawBadges(ctx, badges);
	drawCardFooter(ctx, url);
	return true;
}
