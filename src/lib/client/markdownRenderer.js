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

export async function renderRichMarkdown(value) {
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
