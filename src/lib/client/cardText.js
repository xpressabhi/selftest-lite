// Canvas-safe text layout for the 1080x1920 share cards.
//
// The cards paint line by line with `ctx.fillText`, so the browser never wraps
// for them. This module does that wrapping with the canvas' own measurements:
// width, not a character count, decides where a line ends, and a line never
// splits a grapheme cluster (an emoji sequence or a Devanagari syllable).
//
// `measure` is injected so the algorithm stays pure and testable; callers pass
// `(value) => ctx.measureText(value).width` with `ctx.font` already set.

let graphemeSegmenter;

function segmenter() {
	if (graphemeSegmenter !== undefined) {
		return graphemeSegmenter;
	}
	graphemeSegmenter =
		typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
			? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
			: null;
	return graphemeSegmenter;
}

/** Splits text into user-perceived characters, with a code-point fallback. */
export function splitGraphemes(value) {
	const text = String(value ?? '');
	const instance = segmenter();
	if (!instance) {
		return Array.from(text);
	}
	return Array.from(instance.segment(text), (entry) => entry.segment);
}

function normalize(value) {
	return String(value ?? '')
		.replace(/\s+/gu, ' ')
		.trim();
}

function trimTrailingSpaces(value) {
	return value.replace(/\s+$/u, '');
}

function withEllipsis(line, maxWidth, measure, ellipsis) {
	let value = trimTrailingSpaces(line);
	while (value && measure(`${value}${ellipsis}`) > maxWidth) {
		const parts = splitGraphemes(value);
		parts.pop();
		value = trimTrailingSpaces(parts.join(''));
	}
	if (value) {
		return `${value}${ellipsis}`;
	}
	return measure(ellipsis) <= maxWidth ? ellipsis : '';
}

/**
 * Wraps `text` into at most `maxLines` lines no wider than `maxWidth`.
 * When text is left over, the last line is cut at a grapheme boundary and ends
 * with `ellipsis`. Returns `{ lines, truncated }`.
 */
export function wrapTextToWidth(text, { maxWidth, maxLines, measure, ellipsis = '…' }) {
	const empty = { lines: [], truncated: false };
	if (
		typeof measure !== 'function' ||
		!Number.isFinite(maxWidth) ||
		maxWidth <= 0 ||
		!Number.isFinite(maxLines) ||
		maxLines <= 0
	) {
		return empty;
	}

	const normalized = normalize(text);
	if (!normalized) {
		return empty;
	}

	const words = normalized.split(' ');
	const lines = [];
	let current = '';
	let truncated = false;

	const commit = (value) => {
		if (value) {
			lines.push(value);
		}
	};

	for (const word of words) {
		if (lines.length >= maxLines) {
			truncated = true;
			break;
		}

		const candidate = current ? `${current} ${word}` : word;
		if (measure(candidate) <= maxWidth) {
			current = candidate;
			continue;
		}

		if (current) {
			commit(current);
			current = '';
			if (lines.length >= maxLines) {
				truncated = true;
				break;
			}
		}

		if (measure(word) <= maxWidth) {
			current = word;
			continue;
		}

		// A word wider than the line breaks between graphemes, like
		// `overflow-wrap: break-word`.
		let chunk = '';
		for (const grapheme of splitGraphemes(word)) {
			if (measure(chunk + grapheme) <= maxWidth) {
				chunk += grapheme;
				continue;
			}
			if (chunk) {
				commit(chunk);
				chunk = '';
				if (lines.length >= maxLines) {
					truncated = true;
					break;
				}
			}
			chunk = grapheme;
		}
		if (truncated) {
			break;
		}
		current = chunk;
	}

	if (truncated) {
		// `current` and every later word are dropped, so the ellipsis is honest.
	} else if (current) {
		if (lines.length < maxLines) {
			commit(current);
		} else {
			truncated = true;
		}
	}

	if (truncated && lines.length > 0) {
		lines[lines.length - 1] = withEllipsis(
			lines[lines.length - 1],
			maxWidth,
			measure,
			ellipsis
		);
	}

	return { lines: lines.slice(0, maxLines), truncated };
}

/** One line that fits `maxWidth`, ending with an ellipsis when it is cut. */
export function truncateToWidth(text, { maxWidth, measure, ellipsis = '…' }) {
	const { lines } = wrapTextToWidth(text, { maxWidth, maxLines: 1, measure, ellipsis });
	return lines[0] ?? '';
}

/**
 * Tries `sizes` from largest to smallest and returns the first layout that fits
 * `maxLines` without truncation; otherwise the smallest size, truncated.
 * `measureForSize(size)` must return a measure function for that font size.
 */
export function fitTextToLines(
	text,
	sizes,
	{ maxWidth, maxLines, measureForSize, ellipsis = '…' }
) {
	const candidates = Array.isArray(sizes) && sizes.length > 0 ? sizes : [16];
	for (const size of candidates) {
		const result = wrapTextToWidth(text, {
			maxWidth,
			maxLines,
			measure: measureForSize(size),
			ellipsis,
		});
		if (!result.truncated) {
			return { size, ...result };
		}
	}
	const size = candidates[candidates.length - 1];
	const result = wrapTextToWidth(text, {
		maxWidth,
		maxLines,
		measure: measureForSize(size),
		ellipsis,
	});
	return { size, ...result };
}
