// Paper preview share card (1080x1920): the paper's topic, size and first
// questions, so a teacher can share what the paper looks like before anyone
// opens it. Synchronous; the caller pre-loads the logo and localizes the copy.

import {
	CARD_PALETTE,
	CARD_WIDTH,
	cardFont,
	drawCardBackground,
	drawCardFooter,
	drawCardLogo,
	roundedRectPath,
} from './cardKit.js';
import { fitTextToLines, truncateToWidth, wrapTextToWidth } from './cardText.js';
import { stripCardText } from './scoreCard.js';

const CARD_MARGIN = 80;
const CONTENT_WIDTH = CARD_WIDTH - CARD_MARGIN * 2;

function drawQuestionPanel(ctx, question, index, y) {
	const panelHeight = 168;
	roundedRectPath(ctx, CARD_MARGIN, y, CONTENT_WIDTH, panelHeight, 28);
	ctx.fillStyle = CARD_PALETTE.surface;
	ctx.fill();
	ctx.strokeStyle = CARD_PALETTE.line;
	ctx.lineWidth = 2;
	ctx.stroke();

	const badgeX = CARD_MARGIN + 50;
	const badgeY = y + 50;
	ctx.beginPath();
	ctx.arc(badgeX, badgeY, 28, 0, Math.PI * 2);
	ctx.fillStyle = CARD_PALETTE.brand100;
	ctx.fill();
	ctx.fillStyle = CARD_PALETTE.brand700;
	ctx.font = cardFont(30, 800);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(String(index + 1), badgeX, badgeY + 1);

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.font = cardFont(38, 500);
	ctx.fillStyle = CARD_PALETTE.text;
	const lines = wrapTextToWidth(stripCardText(question), {
		maxWidth: CONTENT_WIDTH - 190,
		maxLines: 2,
		measure: (value) => ctx.measureText(value).width,
	}).lines;
	lines.forEach((line, lineIndex) => {
		ctx.fillText(line, CARD_MARGIN + 110, y + 62 + lineIndex * 51);
	});
	ctx.textAlign = 'center';
	return panelHeight;
}

/**
 * Paints the paper preview. `data`: { kicker, topic, meta, questions, cta,
 * ctaSub, url }; all copy is localized by the caller.
 */
export function drawPaperCard(canvas, data = {}, logo = null) {
	const ctx = canvas?.getContext?.('2d');
	if (!ctx) {
		return false;
	}
	const {
		kicker = '',
		topic = '',
		meta = [],
		questions = [],
		cta = '',
		ctaSub = '',
		url = '',
	} = data;

	drawCardBackground(ctx);
	drawCardLogo(ctx, logo, { x: CARD_WIDTH / 2 - 44, y: 80, size: 88 });

	ctx.textAlign = 'center';
	ctx.font = cardFont(34, 800);
	ctx.fillStyle = CARD_PALETTE.brand600;
	ctx.fillText(String(kicker).toUpperCase(), CARD_WIDTH / 2, 300);

	const topicFit = fitTextToLines(stripCardText(topic), [72, 64, 56], {
		maxWidth: CONTENT_WIDTH,
		maxLines: 3,
		measureForSize: (size) => {
			ctx.font = cardFont(size, 800);
			return (value) => ctx.measureText(value).width;
		},
	});
	ctx.font = cardFont(topicFit.size, 800);
	ctx.fillStyle = CARD_PALETTE.text;
	const topicGap = Math.round(topicFit.size * 1.22);
	topicFit.lines.forEach((line, index) => {
		ctx.fillText(line, CARD_WIDTH / 2, 390 + index * topicGap);
	});

	const metaLine = truncateToWidth(
		(Array.isArray(meta) ? meta : []).map((value) => String(value || '')).filter(Boolean).join(' · '),
		{
			maxWidth: CONTENT_WIDTH,
			measure: (value) => ctx.measureText(value).width,
		}
	);
	ctx.font = cardFont(38, 500);
	ctx.fillStyle = CARD_PALETTE.textMuted;
	ctx.fillText(metaLine, CARD_WIDTH / 2, 390 + Math.max(0, topicFit.lines.length - 1) * topicGap + 64);

	const list = (Array.isArray(questions) ? questions : [])
		.filter((question) => String(question || '').trim())
		.slice(0, 3);
	let panelY = 790;
	for (let index = 0; index < list.length; index += 1) {
		panelY += drawQuestionPanel(ctx, list[index], index, panelY) + 24;
	}

	ctx.textAlign = 'center';
	ctx.font = cardFont(60, 800);
	ctx.fillStyle = CARD_PALETTE.brand600;
	ctx.fillText(cta, CARD_WIDTH / 2, 1530);
	if (ctaSub) {
		ctx.font = cardFont(40, 500);
		ctx.fillStyle = CARD_PALETTE.textMuted;
		ctx.fillText(ctaSub, CARD_WIDTH / 2, 1610);
	}

	drawCardFooter(ctx, url);
	return true;
}
