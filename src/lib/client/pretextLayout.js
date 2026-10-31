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
let richInlineApiPromise;

function remember(cache, key, value) {
	cache.set(key, value);
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		cache.delete(oldest);
	}
	return value;
}

function canMeasureText() {
	if (typeof OffscreenCanvas !== 'undefined') {
		try {
			return Boolean(new OffscreenCanvas(1, 1).getContext('2d'));
		} catch {
			// Fall through to the DOM canvas check.
		}
	}
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
			if (typeof document !== 'undefined' && document.fonts?.ready) {
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

// Rich inline ships on its own subpath and carries its own (larger) bundle;
// only the section banner needs it.
async function loadRichInline() {
	if (!canMeasureText()) {
		return null;
	}
	if (!richInlineApiPromise) {
		richInlineApiPromise = import('@chenglou/pretext/rich-inline').catch(() => null);
	}
	return richInlineApiPromise;
}

function cacheKey(text, font, options) {
	return JSON.stringify([text, font, options || {}]);
}

function prepareCached(api, text, font, options) {
	const key = cacheKey(text, font, options);
	if (preparedTextCache.has(key)) {
		return preparedTextCache.get(key);
	}
	try {
		return remember(preparedTextCache, key, api.prepare(text, font, options));
	} catch {
		// Unsupported text (e.g. a script that needs Intl.Segmenter) or a font
		// Canvas rejects: leave the estimate to the ResizeObserver.
		return null;
	}
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

/** Sets the locale of a freshly loaded module, e.g. inside a worker. */
export async function setPretextLocale(locale) {
	const api = await loadPretext();
	if (api?.setLocale) {
		api.setLocale(locale || undefined);
	}
}

/** Whether the layout engine is already in memory (no import needed). */
export function isPretextReady() {
	return Boolean(pretextApi);
}

/** Loads the engine without measuring, for animations that will need it next. */
export async function warmPretext() {
	await loadPretext();
}

function linesFromResult(result) {
	return result?.lines?.map((line) => line.text) ?? null;
}

/**
 * The text of each wrapped line at `maxWidth`. This is the same
 * `prepareWithSegments()` + `layoutWithLines()` pair the Gravity Letters demo
 * uses to place per-character particles.
 */
export async function layoutTextLines(text, font, maxWidth, lineHeight) {
	const api = await loadPretext();
	if (!api || !validWidth(maxWidth) || !Number.isFinite(lineHeight) || lineHeight <= 0) {
		return null;
	}
	try {
		const prepared = api.prepareWithSegments(String(text || ''), font || canvasFont(16));
		return linesFromResult(api.layoutWithLines(prepared, maxWidth, lineHeight));
	} catch {
		return null;
	}
}

/** Synchronous variant for animations that cannot wait on the dynamic import. */
export function layoutTextLinesIfReady(text, font, maxWidth, lineHeight) {
	if (
		!pretextApi ||
		!validWidth(maxWidth) ||
		!Number.isFinite(lineHeight) ||
		lineHeight <= 0
	) {
		return null;
	}
	try {
		const prepared = pretextApi.prepareWithSegments(
			String(text || ''),
			font || canvasFont(16)
		);
		return linesFromResult(pretextApi.layoutWithLines(prepared, maxWidth, lineHeight));
	} catch {
		return null;
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
	try {
		return pretextApi.layout(prepared, maxWidth, lineHeight);
	} catch {
		return null;
	}
}

/** Width of the widest line when only explicit line breaks apply. */
export async function measureNaturalWidth(text, font, options = {}) {
	const api = await loadPretext();
	if (!api) {
		return null;
	}
	const prepared = prepareCached(api, String(text || ''), font || canvasFont(16), options);
	if (!prepared) {
		return null;
	}
	try {
		return api.measureNaturalWidth(prepared);
	} catch {
		return null;
	}
}

/**
 * The narrowest width that keeps `text` on the same number of lines. A
 * multiline chat bubble then sits at its widest line instead of at its
 * max-width with dead space on the right.
 */
export async function tightWidth(text, font, maxWidth, lineHeight, options = {}) {
	const api = await loadPretext();
	if (!api || !validWidth(maxWidth) || !Number.isFinite(lineHeight) || lineHeight <= 0) {
		return null;
	}
	const prepared = prepareCached(api, String(text || ''), font || canvasFont(16), options);
	if (!prepared) {
		return null;
	}
	try {
		const initial = api.layout(prepared, maxWidth, lineHeight);
		if (!initial || initial.lineCount === 0) {
			return null;
		}
		let lo = 1;
		let hi = Math.ceil(maxWidth);
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			const result = api.layout(prepared, mid, lineHeight);
			if (result.lineCount <= initial.lineCount) {
				hi = mid;
			} else {
				lo = mid + 1;
			}
		}
		let maxLineWidth = 0;
		const lineCount = api.walkLineRanges(prepared, lo, (line) => {
			if (line.width > maxLineWidth) {
				maxLineWidth = line.width;
			}
		});
		return {
			width: Math.ceil(maxLineWidth),
			lineCount,
			height: lineCount * lineHeight,
		};
	} catch {
		return null;
	}
}

/**
 * Line count and widest line of a mixed-font inline paragraph (text runs with
 * their own fonts, chips, boxes). Used for the section banner, whose label,
 * name and marks are different sizes on one wrapping row.
 */
export async function measureRichInlineLines(items, maxWidth, options = {}) {
	const api = await loadRichInline();
	if (!api || !validWidth(maxWidth) || !Array.isArray(items) || items.length === 0) {
		return null;
	}
	try {
		const prepared = api.prepareRichInline(items, options);
		return api.measureRichInlineStats(prepared, maxWidth);
	} catch {
		return null;
	}
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

// Keep fractional sizes: Chrome and Safari measure them exactly. Firefox
// rounds canvas font sizes internally, so it cannot match the painted 15.2px
// either way; whole pixels only moved the error to Chrome.
function fontPx(value) {
	return px(value);
}

async function measureBanner(items, contentWidth, root, rich) {
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
	const totalWidth =
		widths.reduce((sum, width) => sum + (width ?? 0), 0) + Math.max(0, texts.length - 1) * 8;
	let rows = 1;
	if (totalWidth > contentWidth) {
		if (rich) {
			// The banner is a wrapping flex row with an 8px gap. Rich inline lays
			// the same mixed-font runs out as one paragraph; 4px extra each side
			// stands in for the gap between neighbours. Only multi-row banners pay
			// for the separate ~44 KB rich-inline bundle.
			const stats = await measureRichInlineLines(
				texts.map((text, index) => ({
					text: `${text} `,
					font: fonts[index] || fonts[0],
					extraWidth: 4,
				})),
				contentWidth
			);
			rows = Math.max(1, stats?.lineCount ?? 1);
		} else {
			// Mobile keeps the lightweight path: rich inline is a separate bundle
			// and the low-end Android baseline should not pay for it.
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
		}
	}
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
export async function estimateQuestionCardLayout(question, cardWidth, context = {}) {
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
	// A matching question renders its columns as a grid, which measureMatching()
	// already accounts for. questionTextFor() would count those columns twice.
	const questionText =
		question.format === 'matching' ? question.question || '' : questionTextFor(question);
	const questionResult = await measureText(
		questionText,
		questionFont,
		contentWidth,
		questionLineHeight
	);
	const questionHeight = questionResult?.height ?? 0;

	const bannerHeight = await measureBanner(context.bannerItems, contentWidth, root, desktop);
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
	// 12px horizontal padding each side, the 32px letter, its 12px gap and the
	// 1px border. The 28px check and its 12px gap are reserved so selecting an
	// option never reflows the label.
	const optionChrome = 24 + 32 + 12 + 2;
	const checkChrome = 28 + 12;
	const optionTextWidth = Math.max(80, contentWidth - optionChrome - checkChrome);
	const optionResults = await Promise.all(
		options.map(async (option) => {
			const tight = await tightWidth(option, optionFont, optionTextWidth, optionLineHeight);
			let textWidth = optionTextWidth;
			let width = null;
			if (tight) {
				const tightMeasured = await measureText(
					option,
					optionFont,
					tight.width,
					optionLineHeight
				);
				// The tight width must not add a line. If it does, the browser
				// would wrap the option taller than the full-width layout.
				if ((tightMeasured?.lineCount ?? 0) === tight.lineCount) {
					textWidth = tight.width;
					width = Math.min(
						contentWidth - checkChrome,
						Math.ceil(tight.width + optionChrome)
					);
				}
			}
			const measured = await measureText(option, optionFont, textWidth, optionLineHeight);
			return {
				height: Math.max(52, (measured?.height ?? optionLineHeight) + 16 + 2),
				width:
					width ??
					Math.min(contentWidth - checkChrome, Math.ceil(textWidth + optionChrome)),
			};
		})
	);
	const optionHeights = optionResults.map((result) => result.height);
	const optionWidths = optionResults.map((result) => result.width);
	const optionsHeight =
		optionHeights.reduce((total, height) => total + height, 0) +
		Math.max(0, optionHeights.length - 1) * 8;

	return {
		height: Math.ceil(
			padding * 2 +
				bannerHeight +
				instructionsHeight +
				questionHeight +
				14 +
				matchingHeight +
				optionsHeight
		),
		optionWidths,
	};
}

/** Height only, for callers that do not render the tight option widths. */
export async function estimateQuestionCardHeight(question, cardWidth, context = {}) {
	const layout = await estimateQuestionCardLayout(question, cardWidth, context);
	return layout?.height ?? null;
}
