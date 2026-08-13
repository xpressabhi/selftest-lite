import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkRehype from 'remark-rehype';

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

async function renderOnce(value) {
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
}

export async function renderRichMarkdown(value) {
	const normalized = String(value || '');
	const cached = cacheGet(normalized);
	if (cached !== undefined) {
		return cached;
	}
	const rendered = await renderOnce(normalized);
	cacheSet(normalized, rendered);
	return rendered;
}

/**
 * Renders text(s) in the background so the unified pipeline never runs on the
 * interaction path. Used to warm the cache for upcoming questions.
 */
export function prewarmRichMarkdown(values) {
	const texts = Array.isArray(values) ? values : [values];
	for (const text of texts) {
		const normalized = String(text || '');
		if (normalized && !renderCache.has(normalized)) {
			void renderRichMarkdown(normalized).catch(() => {});
		}
	}
}
