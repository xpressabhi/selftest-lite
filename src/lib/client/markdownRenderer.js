import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkRehype from 'remark-rehype';
import { get } from 'svelte/store';
import { isDataSaverActive } from './preferences';

const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [...(defaultSchema.attributes?.code || []), ['className', /^language-./]],
		span: [...(defaultSchema.attributes?.span || []), ['className']],
		div: [...(defaultSchema.attributes?.div || []), ['className']],
	},
};

const MAX_CACHE_ENTRIES = 250;
const renderCache = new Map();

function cacheGet(key) {
	if (!renderCache.has(key)) {
		return undefined;
	}
	const value = renderCache.get(key);
	renderCache.delete(key);
	renderCache.set(key, value);
	return value;
}

function cacheSet(key, value) {
	if (renderCache.size >= MAX_CACHE_ENTRIES) {
		renderCache.delete(renderCache.keys().next().value);
	}
	renderCache.set(key, value);
}

function escapeHtml(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

async function renderOnce(value) {
	try {
		const file = await unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkMath)
			.use(remarkRehype)
			.use(rehypeSanitize, sanitizeSchema)
			.use(rehypeKatex)
			.use(rehypeStringify)
			.process(value || '');

		return String(file);
	} catch {
		// A pipeline failure must never surface as an unhandled rejection.
		return null;
	}
}

export async function renderRichMarkdown(value) {
	const normalized = String(value || '');
	const cached = cacheGet(normalized);
	if (cached !== undefined) {
		return cached;
	}
	const rendered = await renderOnce(normalized);
	if (rendered === null) {
		// Plain-text fallback; deliberately not cached so a transient failure
		// does not pin degraded output.
		return escapeHtml(normalized).replaceAll('\n', '<br>');
	}
	cacheSet(normalized, rendered);
	return rendered;
}

const prewarmQueue = new Set();
let prewarmScheduled = false;

function flushPrewarmQueue() {
	prewarmScheduled = false;
	const pending = [...prewarmQueue];
	prewarmQueue.clear();
	for (const text of pending) {
		void renderRichMarkdown(text).catch(() => {});
	}
}

function schedulePrewarm() {
	if (prewarmScheduled) {
		return;
	}
	prewarmScheduled = true;
	if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(flushPrewarmQueue, { timeout: 2000 });
		return;
	}
	setTimeout(flushPrewarmQueue, 200);
}

/**
 * Renders text(s) in the background so the unified pipeline never runs on the
 * interaction path. Used to warm the cache for upcoming questions. Skipped in
 * data-saver mode and deferred to idle time so navigation never blocks.
 */
export function prewarmRichMarkdown(values) {
	if (get(isDataSaverActive)) {
		return;
	}
	const texts = Array.isArray(values) ? values : [values];
	for (const text of texts) {
		const normalized = String(text || '');
		if (normalized && !renderCache.has(normalized)) {
			prewarmQueue.add(normalized);
		}
	}
	if (prewarmQueue.size > 0) {
		schedulePrewarm();
	}
}
