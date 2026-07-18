const preparedTextCache = new Map();

let pretextApiPromise;
let pretextApi;

function canMeasureText() {
	return (
		typeof window !== 'undefined' &&
		typeof document !== 'undefined' &&
		typeof Intl !== 'undefined' &&
		typeof Intl.Segmenter === 'function' &&
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

function buildCacheKey(text, font, options) {
	return JSON.stringify([text, font, options || {}]);
}

export function getCanvasFont(element, fallback = '16px Inter') {
	if (!element || typeof window === 'undefined') {
		return fallback;
	}

	const style = window.getComputedStyle(element);
	return style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` || fallback;
}

export async function prepareText(text, font, options = {}) {
	const api = await loadPretext();
	if (!api) {
		return null;
	}

	const normalizedText = String(text || '');
	const normalizedFont = font || '16px Inter';
	const cacheKey = buildCacheKey(normalizedText, normalizedFont, options);
	if (!preparedTextCache.has(cacheKey)) {
		preparedTextCache.set(cacheKey, api.prepare(normalizedText, normalizedFont, options));
	}

	return preparedTextCache.get(cacheKey);
}

export function layoutPreparedText(prepared, maxWidth, lineHeight) {
	if (!prepared || !pretextApi || !Number.isFinite(maxWidth) || maxWidth <= 0) {
		return null;
	}

	return pretextApi.layout(prepared, maxWidth, lineHeight);
}

export async function measureText(text, font, maxWidth, lineHeight, options = {}) {
	const prepared = await prepareText(text, font, options);
	return layoutPreparedText(prepared, maxWidth, lineHeight);
}

export async function estimateQuestionCardHeight(question, cardWidth) {
	if (!question || !Number.isFinite(cardWidth) || cardWidth <= 0) {
		return null;
	}

	const contentWidth = Math.max(160, cardWidth - 32);
	const questionResult = await measureText(question.question, '18px Inter', contentWidth, 27);
	const optionResults = await Promise.all(
		(question.options || []).map((option) => measureText(option, '14px Inter', contentWidth, 20)),
	);

	if (!questionResult || optionResults.some((result) => !result)) {
		return null;
	}

	const questionHeight = Math.max(27, questionResult.height);
	const optionsHeight = optionResults.reduce(
		(total, result) => total + Math.max(48, result.height + 16),
		0,
	);
	const optionGaps = Math.max(0, optionResults.length - 1) * 8;

	return Math.ceil(32 + questionHeight + 12 + optionsHeight + optionGaps);
}

export function clearTextMeasurementCache() {
	preparedTextCache.clear();
	pretextApi?.clearCache?.();
}
