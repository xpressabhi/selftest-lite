// Approximate print pagination for /print.
//
// The print stylesheet keeps every question block whole (`break-inside:
// avoid`), which is right for normal questions but leaves a large gap when one
// block is taller than a sheet. This module measures each block with Pretext,
// simulates packing against A4 content height, and reports both the estimated
// page count and the questions that must be allowed to split.
//
// These are estimates: Pretext mirrors the browser's line breaking, but the
// sheet also contains list markers, math and diagrams that are not measured
// here. The count is always shown with "≈".

import { canvasFont } from './fontStack.js';
import { measureText } from './pretextLayout.js';

// A4 (210x297mm) with the @page margins in PrintPaper.svelte (12mm sides,
// 15mm top/bottom), at 96 CSS px per inch.
const A4_CONTENT_WIDTH = Math.round(((210 - 24) * 96) / 25.4); // 703px
const A4_CONTENT_HEIGHT = Math.round(((297 - 30) * 96) / 25.4); // 1009px

function rootFontSize() {
	if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
		return 16;
	}
	const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

async function measure(value, font, width, lineHeight) {
	if (!value) {
		return 0;
	}
	const result = await measureText(value, font, width, lineHeight);
	return result?.height ?? lineHeight;
}

async function measureHeader(paper, root, width) {
	const topic = paper?.topic || '';
	const examMeta = paper?.examMeta || null;
	let height = await measure(topic, canvasFont(Math.round(root * 1.35), 700), width, root * 1.35 * 1.3);
	const examLine = [examMeta?.schoolName, examMeta?.examName, examMeta?.patternYear]
		.filter(Boolean)
		.join(' · ');
	if (examLine) {
		height += 6 + (await measure(examLine, canvasFont(Math.round(root * 0.92), 400), width, root * 0.92 * 1.5));
	}
	const meta = 'meta';
	height += 10 + (await measure(meta, canvasFont(Math.round(root * 0.82), 400), width, root * 0.82 * 1.5));
	// 22px bottom margin, 14px padding and the 2px rule.
	return height + 38;
}

async function measureMatching(question, width, root) {
	const columnA = Array.isArray(question?.columnA) ? question.columnA : [];
	const columnB = Array.isArray(question?.columnB) ? question.columnB : [];
	if (columnA.length === 0 && columnB.length === 0) {
		return 0;
	}
	const columnWidth = Math.floor((width - 6) / 2);
	const textWidth = Math.max(40, columnWidth - 16 - 22 - 6);
	const font = canvasFont(Math.round(root * 0.9), 400);
	const lineHeight = root * 0.9 * 1.3;
	const rows = Math.max(columnA.length, columnB.length);
	let grid = 0;
	for (let row = 0; row < rows; row += 1) {
		const left = await measure(columnA[row], font, textWidth, lineHeight);
		const right = await measure(columnB[row], font, textWidth, lineHeight);
		grid += Math.max(22, left, right) + 12;
	}
	grid += Math.max(0, rows - 1) * 6;
	return root * 0.7 * 1.55 + 6 + grid + 12;
}

async function measureSection(section, root, width) {
	let height = root * 0.85 * 1.45;
	if (section?.instructions) {
		height += 6 + (await measure(section.instructions, canvasFont(Math.round(root * 0.85), 400), width - 24, root * 0.85 * 1.45));
	}
	// 24px top margin, 16px bottom, 8px padding each side.
	return height + 24 + 16 + 16;
}

async function measureQuestion(question, root, width) {
	const bodyWidth = width - 26 - 8;
	const questionFont = canvasFont(Math.round(root * 0.98), 400);
	const questionLineHeight = root * 0.98 * 1.5;
	let height = await measure(question?.question, questionFont, bodyWidth, questionLineHeight);

	if (question?.format === 'matching') {
		height += await measureMatching(question, bodyWidth, root);
	} else if (question?.format === 'assertion-reasoning') {
		// Assertion + reason rows; a conservative three lines.
		height += questionLineHeight * 3;
	}

	const options = Array.isArray(question?.options) ? question.options : [];
	if (options.length > 0) {
		const optionFont = canvasFont(Math.round(root * 0.94), 400);
		const optionLineHeight = root * 0.94 * 1.45;
		const optionWidth = bodyWidth - 22 - 8;
		let optionsHeight = 0;
		for (const option of options) {
			optionsHeight += await measure(option, optionFont, optionWidth, optionLineHeight);
		}
		height += 9 + optionsHeight + Math.max(0, options.length - 1) * 5;
	}

	// print-question margin-bottom.
	return height + 20;
}

/**
 * @returns {{ pages: number, splittable: Set<number> }} `splittable` holds the
 * question indexes whose block is taller than a sheet and therefore must be
 * allowed to break rather than jump to a fresh page.
 */
export async function estimatePrintLayout(paper, options = {}) {
	const width = options.width || A4_CONTENT_WIDTH;
	const pageHeight = options.pageHeight || A4_CONTENT_HEIGHT;
	const root = options.root || rootFontSize();
	const questions = Array.isArray(paper?.questions) ? paper.questions : [];
	const sections = Array.isArray(paper?.sections) ? paper.sections : [];
	const sectionByIndex = new Map();
	for (const section of sections) {
		for (const index of section.questionIndexes || []) {
			sectionByIndex.set(index, section);
		}
	}

	const blocks = [{ height: await measureHeader(paper, root, width) }];
	for (let index = 0; index < questions.length; index += 1) {
		const section = sectionByIndex.get(index);
		if (section && (section.questionIndexes || [])[0] === index) {
			blocks.push({ height: await measureSection(section, root, width) });
		}
		blocks.push({
			height: await measureQuestion(questions[index], root, width),
			index,
		});
	}

	const splittable = new Set();
	let pages = 1;
	let used = 0;
	for (const block of blocks) {
		if (block.height > pageHeight) {
			if (block.index !== undefined) {
				splittable.add(block.index);
			}
			if (used > 0) {
				pages += 1;
			}
			const span = Math.ceil(block.height / pageHeight);
			pages += span - 1;
			used = block.height - (span - 1) * pageHeight;
			if (used === 0) {
				used = pageHeight;
			}
			continue;
		}
		if (used + block.height > pageHeight) {
			pages += 1;
			used = block.height;
		} else {
			used += block.height;
		}
	}

	return { pages, splittable };
}

export { A4_CONTENT_HEIGHT, A4_CONTENT_WIDTH };

let workerRequest = 0;

/**
 * Measures large papers in a module worker (OffscreenCanvas + Pretext) so a
 * 200-question print preview never runs its layout arithmetic on the main
 * thread. Small papers use the idle main-thread path, which avoids fetching
 * the worker bundle at all. Any worker failure falls back to the main thread.
 */
export async function estimatePrintLayoutInWorker(paper, options = {}) {
	const count = Array.isArray(paper?.questions) ? paper.questions.length : 0;
	const threshold = options.threshold ?? 40;
	let offscreen = false;
	if (typeof OffscreenCanvas !== 'undefined') {
		try {
			offscreen = Boolean(new OffscreenCanvas(1, 1).getContext('2d'));
		} catch {
			offscreen = false;
		}
	}
	if (count < threshold || typeof Worker === 'undefined' || !offscreen) {
		return { ...(await estimatePrintLayout(paper, options)), source: 'main' };
	}

	const id = ++workerRequest;
	let payload;
	try {
		// Svelte state is a proxy; worker messaging needs a plain object.
		payload = JSON.parse(JSON.stringify(paper));
	} catch {
		return { ...(await estimatePrintLayout(paper, options)), source: 'main' };
	}
	return new Promise((resolve) => {
		let worker;
		try {
			worker = new Worker(new URL('./printLayout.worker.js', import.meta.url), {
				type: 'module',
			});
		} catch {
			void (async () => {
				resolve({ ...(await estimatePrintLayout(paper, options)), source: 'main' });
			})();
			return;
		}
		const fallback = async () => {
			worker.terminate();
			resolve({ ...(await estimatePrintLayout(paper, options)), source: 'main' });
		};
		worker.onmessage = (event) => {
			const data = event.data;
			if (!data || data.id !== id) {
				return;
			}
			worker.terminate();
			if (!data.ok) {
				void fallback();
				return;
			}
			resolve({ pages: data.pages, splittable: new Set(data.splittable), source: 'worker' });
		};
		worker.onerror = () => void fallback();
		try {
			worker.postMessage({ id, paper: payload, locale: options.locale, root: options.root });
		} catch {
			void fallback();
		}
	});
}
