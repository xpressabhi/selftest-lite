/**
 * Structured data helper.
 *
 * Svelte treats the contents of `<script>` elements as raw text, so a mustache
 * inside `<script type="application/ld+json">` is never interpolated. Pages
 * therefore build the complete tag here and render it with `{@html}`.
 *
 * `<` is escaped so no string in the payload can terminate the script tag.
 */
export function jsonLdScript(data) {
	const json = JSON.stringify(data).replace(/</g, '\\u003c');
	return `<script type="application/ld+json">${json}</script>`;
}
