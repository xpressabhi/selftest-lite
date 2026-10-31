import { questionTextFor } from '#lib/shared/questionText.js';
import { canvasFont } from './fontStack.js';

// Pretext is a canvas-based text layout engine: `prepare()` measures a
// paragraph once, `layout()` then answers "how tall is this at width W" with
// arithmetic, no DOM and no reflow. We use it to estimate a test card before it
// mounts (question stem, section banner, instructions, matching grid and every
// option), so navigating questions does not animate to the wrong height and
// then snap.
//
// The module is imported dynamically: `@chenglou/pretext` is ~40 KB gzipped and
// must never load on a page that does not estimate text.

const CACHE_LIMIT = 500;

const preparedTextCache = new Map();

let pretextApiPromise;
let pretextApi;

function remember(cache, key, value) {
	cache.set(key, value);
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		cache.delete(oldest);
	}
	return value;
}

function canMeasureText() {
	return (
		typeof window !== 'undefined' &&
		typeof document !== 'undefined' &&
		Boolean(document.createElement('canvas').getContext('2d'))
	);
}

async function loadPretext() {
	if (!canMeasureText()) {
		return null;
	}

	if (!pretextApiPromise) {
		pretextApiPromise = (async () => {
			if (document.fonts?.ready) {
				await document.fonts.ready;
			}
			return import('@chenglou/pretext');
		})()
			.then((module) => {
				pretextApi = module;
				return module;
			})
			.catch(() => null);
	}

	return pretextApiPromise;
}

function cacheKey(text, font, options) {
	return JSON.stringify([text, font, options || {}]);
}

function prepareCached(api, text, font, options) {
	const key = cacheKey(text, font, options);
	if (!preparedTextCache.has(key)) {
		remember(preparedTextCache, key, api.prepare(text, font, options));
	}
	return preparedTextCache.get(key);
}

function validWidth(width) {
	return Number.isFinite(width) && width > 0;
}

/**
 * Clears prepared handles and Pretext's own caches, and re-reads the page
 * language. Call after `<html lang>` changes or a zoom/DPR change: both alter
 * where lines break and how wide glyphs paint.
 */
export function resetPretextLayout(locale) {
	preparedTextCache.clear();
	if (pretextApi?.clearCache) {
		pretextApi.clearCache();
	}
	if (pretextApi?.setLocale) {
		const next =
			locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : undefined);
		pretextApi.setLocale(next || undefined);
	}
}

export async function prepareText(text, font, options = {}) {
	const api = await loadPretext();
	if (!api) {
		return null;
	}
	return prepareCached(api, String(text || ''), font || canvasFont(16), options);
}

export function layoutPreparedText(prepared, maxWidth, lineHeight) {
	if (!prepared || !pretextApi || !validWidth(maxWidth)) {
		return null;
	}
	return pretextApi.layout(prepared, maxWidth, lineHeight);
}

/** Width of the widest line when only explicit line breaks apply. */
export async function measureNaturalWidth(text, font, options = {}) {
	const api = await loadPretext();
	if (!api) {
		return null;
	}
	const prepared = prepareCached(api, String(text || ''), font || canvasFont(16), options);
	return api.measureNaturalWidth(prepared);
}

export async function measureText(text, font, maxWidth, lineHeight, options = {}) {
	const prepared = await prepareText(text, font, options);
	return layoutPreparedText(prepared, maxWidth, lineHeight);
}

function rootFontSize() {
	if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
		return 16;
	}
	const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

function px(value) {
	return Math.round(value * 100) / 100;
}

// Firefox measures canvas text at a rounded font size, so pass whole pixels;
// the CSS may still paint at a fraction, but this keeps the two closest.
function fontPx(value) {
	return Math.max(1, Math.round(value));
}

async function measureBanner(items, contentWidth, root) {
	const texts = (Array.isArray(items) ? items : []).map((item) => String(item || '')).filter(Boolean);
	if (texts.length === 0) {
		return 0;
	}
	const fonts = [
		canvasFont(fontPx(root * 0.7), 700),
		canvasFont(fontPx(root * 0.85), 700),
		canvasFont(fontPx(root * 0.72), 700),
	];
	const widths = await Promise.all(
		texts.map((text, index) => measureNaturalWidth(text, fonts[index] || fonts[0]))
	);
	let rows = 1;
	let rowWidth = 0;
	widths.forEach((rawWidth) => {
		const itemWidth = rawWidth ?? 0;
		const extra = rowWidth > 0 ? itemWidth + 8 : itemWidth;
		if (rowWidth > 0 && rowWidth + extra > contentWidth) {
			rows += 1;
			rowWidth = itemWidth;
		} else {
			rowWidth += extra;
		}
	});
	const lineHeight = px(root * 0.85 * 1.55);
	// padding-bottom: 8px, margin-bottom: 10px, 4px row gap
	return px(rows * lineHeight + (rows - 1) * 4 + 8 + 10);
}

async function measureMatching(question, contentWidth, root) {
	const columnA = Array.isArray(question?.columnA) ? question.columnA : [];
	const columnB = Array.isArray(question?.columnB) ? question.columnB : [];
	if (columnA.length === 0 && columnB.length === 0) {
		return 0;
	}
	const columnWidth = Math.floor((contentWidth - 6) / 2);
	const textWidth = Math.max(40, columnWidth - 16 - 22 - 6);
	const font = canvasFont(fontPx(root * 0.9), 400);
	const lineHeight = px(root * 0.9 * 1.3);
	const rows = Math.max(columnA.length, columnB.length);
	const heights = await Promise.all(
		Array.from({ length: rows }, async (_unused, row) => {
			const cells = await Promise.all(
				[columnA[row], columnB[row]].map(async (value) => {
					if (!value) {
						return 22;
					}
					const measured = await measureText(value, font, textWidth, lineHeight);
					return Math.max(22, measured?.height ?? lineHeight);
				})
			);
			return Math.max(...cells) + 12;
		})
	);
	const gridHeight = heights.reduce((total, height) => total + height, 0) + Math.max(0, rows - 1) * 6;
	const labelHeight = px(root * 0.7 * 1.55);
	// container gap 6, grid, margin-bottom 12
	return px(labelHeight + 6 + gridHeight + 12);
}

/**
 * Estimated height of a test question card, including its padding, the section
 * banner and instructions, matching grid and option rows. The numbers mirror
 * TestQuestionCard.svelte and QuestionMatching.svelte; if those styles change,
 * update this function with them.
 */
export async function estimateQuestionCardHeight(question, cardWidth, context = {}) {
	if (!question || !validWidth(cardWidth)) {
		return null;
	}

	const root = rootFontSize();
	const viewportWidth =
		context.viewportWidth ??
		(typeof window !== 'undefined' ? window.innerWidth : 1024);
	const desktop = viewportWidth >= 768;
	const padding = desktop ? 24 : 16;
	const contentWidth = Math.max(160, cardWidth - padding * 2);

	const questionFont = canvasFont(fontPx(root * 1.05), 600);
	const questionLineHeight = px(root * 1.05 * 1.5);
	const questionResult = await measureText(
		questionTextFor(question),
		questionFont,
		contentWidth,
		questionLineHeight
	);
	const questionHeight = questionResult?.height ?? 0;

	const bannerHeight = await measureBanner(context.bannerItems, contentWidth, root);
	const instructionsHeight = context.instructions
		? ((await measureText(
				context.instructions,
				canvasFont(fontPx(root * 0.78), 400),
				contentWidth,
				px(root * 0.78 * 1.55)
			))?.height ?? 0) + 10
		: 0;

	const matchingHeight =
		question.format === 'matching' ? await measureMatching(question, contentWidth, root) : 0;

	const options = Array.isArray(question.options) ? question.options : [];
	const optionFont = canvasFont(fontPx(root * 0.95), 500);
	const optionLineHeight = px(root * 0.95 * 1.55);
	// 12px horizontal padding each side, the 22px letter and its 12px gap.
	const optionTextWidth = Math.max(80, contentWidth - 24 - 34);
	const optionHeights = await Promise.all(
		options.map(async (option) => {
			const measured = await measureText(option, optionFont, optionTextWidth, optionLineHeight);
			return Math.max(52, (measured?.height ?? optionLineHeight) + 16 + 2);
		})
	);
	const optionsHeight =
		optionHeights.reduce((total, height) => total + height, 0) +
		Math.max(0, optionHeights.length - 1) * 8;

	return Math.ceil(
		padding * 2 +
			bannerHeight +
			instructionsHeight +
			questionHeight +
			14 +
			matchingHeight +
			optionsHeight
	);
}
