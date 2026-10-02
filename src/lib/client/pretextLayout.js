import { questionTextFor } from '$lib/shared/questionText';

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

/* Canvas text measurement has to run against the font the DOM actually
   renders with. Hardcoding a family name here is how that drifts: the app
   stack is `Inter, ui-sans-serif, system-ui` but no Inter webfont is loaded,
   so every user renders the system UI face while this module measured a
   name the canvas quietly fell back from — producing wrap geometry that
   disagreed with the real layout. Read the resolved stack off the body
   instead, so the two cannot disagree. */
const FALLBACK_STACK =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

let bodyFontStack;

export function resolveFontStack() {
	if (typeof document === 'undefined') {
		return FALLBACK_STACK;
	}
	if (bodyFontStack === undefined) {
		bodyFontStack =
			getComputedStyle(document.body).fontFamily.trim() || FALLBACK_STACK;
	}
	return bodyFontStack;
}

/** Build a canvas font shorthand that uses the app's real family stack. */
export function canvasFont(px, weight = 400) {
	const stack = resolveFontStack();
	return `${weight} ${px}px ${stack.includes(',') ? stack : FALLBACK_STACK}`;
}

export async function prepareText(text, font, options = {}) {
	const api = await loadPretext();
	if (!api) {
		return null;
	}

	const normalizedText = String(text || '');
	const normalizedFont = font || canvasFont(16);
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
	// Structured questions compose their stem from dedicated fields (an
	// assertion-reasoning stem is empty), so measure the composed text.
	const questionResult = await measureText(
		questionTextFor(question),
		canvasFont(18),
		contentWidth,
		27
	);
	const optionResults = await Promise.all(
		(question.options || []).map((option) =>
			measureText(option, canvasFont(14), contentWidth, 20)
		)
	);
	const columnItems =
		question.format === 'matching'
			? [...(question.columnA || []), ...(question.columnB || [])]
			: [];
	const columnResults = await Promise.all(
		columnItems.map((item) =>
			measureText(item, canvasFont(13), Math.max(60, Math.floor(contentWidth / 2) - 24), 18)
		)
	);

	if (
		!questionResult ||
		optionResults.some((result) => !result) ||
		columnResults.some((result) => !result)
	) {
		return null;
	}

	const questionHeight = Math.max(27, questionResult.height);
	const optionsHeight = optionResults.reduce(
		(total, result) => total + Math.max(48, result.height + 16),
		0
	);
	const optionGaps = Math.max(0, optionResults.length - 1) * 8;
	const columnsHeight =
		columnResults.length > 0
			? getMatchingColumnsHeight(columnResults)
			: 0;

	return Math.ceil(32 + questionHeight + 12 + columnsHeight + optionsHeight + optionGaps);
}

/** Height of the two-column grid: four aligned rows plus labels and gaps. */
function getMatchingColumnsHeight(columnResults) {
	const half = Math.ceil(columnResults.length / 2);
	let rowsHeight = 0;
	for (let row = 0; row < half; row += 1) {
		const left = columnResults[row]?.height || 18;
		const right = columnResults[row + half]?.height || 18;
		rowsHeight += Math.max(24, left + 12, right + 12);
	}
	return 6 + 20 + rowsHeight + 6 + 12;
}
