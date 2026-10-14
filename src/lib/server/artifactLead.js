import { parseFragment, serialize } from 'parse5';

// Models keep writing their own title/summary lead block ("<header
// class=lead><h2>Title</h2><p>summary</p></header>") even though the host page
// renders both above the artifact. The prompt forbids it, but compliance is
// not something a user should see. This pure, deterministic pass removes that
// duplicated LEAD block at compose time — so already-cached artifacts are
// fixed too, without regeneration — and leaves everything else untouched.

const LEAD_WRAPPER_TAGS = new Set(['header', 'div', 'section', 'article', 'main']);
const LEAD_HEADING_TAGS = new Set(['h1', 'h2', 'h3']);
const MAX_DEPTH = 5;

function normalizeText(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function nodeText(node) {
	let text = '';
	for (const child of node.childNodes ?? []) {
		if (child.nodeName === '#text') {
			text += child.value;
		} else {
			// Element boundaries need a separator or "<h2>Title</h2><p>Body</p>"
			// concatenates into "TitleBody" and never matches the expected lead.
			text += `${nodeText(child)} `;
		}
	}
	return text;
}

function elementChildren(node) {
	return (node.childNodes ?? []).filter((child) => child.tagName);
}

function isTitleHeading(node, title) {
	return LEAD_HEADING_TAGS.has(node.tagName) && normalizeText(nodeText(node)) === title;
}

function isSummaryParagraph(node, summary) {
	return node.tagName === 'p' && normalizeText(nodeText(node)) === summary;
}

function removeChild(parent, child) {
	const index = parent.childNodes.indexOf(child);
	if (index !== -1) {
		parent.childNodes.splice(index, 1);
	}
}

/**
 * Removes the leading duplicated title/summary block from `html` when it
 * matches `brief`. Returns the input unchanged when nothing matches.
 */
export function stripRepeatedLead(html, brief = {}) {
	const source = String(html ?? '');
	const title = normalizeText(brief?.title);
	const summary = normalizeText(brief?.summary);
	if (!source || (!title && !summary)) {
		return source;
	}

	let fragment;
	try {
		fragment = parseFragment(source);
	} catch {
		return source;
	}

	const expectedText = [title, summary].filter(Boolean).join(' ');

	// A wrapper is "lead-only" when every element child is the title heading
	// and/or the summary paragraph and its whole text is exactly the lead.
	function isLeadOnly(node) {
		const children = elementChildren(node);
		if (children.length === 0 || children.length > 2) {
			return false;
		}
		const allMatch = children.every(
			(child) =>
				(title && isTitleHeading(child, title)) ||
				(summary && isSummaryParagraph(child, summary))
		);
		return allMatch && normalizeText(nodeText(node)) === expectedText;
	}

	// Walk down the chain of first-element wrappers: drop a lead-only wrapper
	// whole, otherwise drop a matching heading (and summary paragraph) found as
	// the first elements inside.
	function stripInside(container, depth) {
		if (depth > MAX_DEPTH) {
			return false;
		}
		const children = elementChildren(container);
		const first = children[0];
		if (!first) {
			return false;
		}

		if (LEAD_WRAPPER_TAGS.has(first.tagName)) {
			if (isLeadOnly(first)) {
				removeChild(container, first);
				return true;
			}
			if (stripInside(first, depth + 1)) {
				// The wrapper itself stays unless stripping emptied it out; an
				// empty lead wrapper is noise.
				if (
					elementChildren(first).length === 0 &&
					normalizeText(nodeText(first)) === ''
				) {
					removeChild(container, first);
				}
				return true;
			}
			return false;
		}

		if (title && isTitleHeading(first, title)) {
			removeChild(container, first);
			const next = elementChildren(container)[0];
			if (next && summary && isSummaryParagraph(next, summary)) {
				removeChild(container, next);
			}
			return true;
		}

		return false;
	}

	if (!stripInside(fragment, 0)) {
		return source;
	}

	return serialize(fragment);
}
