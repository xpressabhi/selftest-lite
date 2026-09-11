// Tolerant JSON extraction for model responses.
//
// Gemini is asked for JSON (responseMimeType + responseJsonSchema), but live
// traffic shows occasional malformed payloads: markdown fences, surrounding
// prose, raw control characters, and invalid escape sequences. A strict
// JSON.parse on those used to surface as 500s, so parsing now walks through
// progressively more forgiving candidates and sanitizes the common
// malformations before giving up.

function sanitizeJsonControlCharacters(text) {
	let result = '';
	let inString = false;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (!inString) {
			if (char === '"') {
				inString = true;
			}
			result += char;
			continue;
		}
		if (char === '\\') {
			const next = text[index + 1];
			if (next && /["\\/bfnrtu]/.test(next)) {
				result += char + next;
				index += 1;
			} else {
				// Lone backslash: escape it so JSON.parse treats it as literal.
				result += '\\\\';
			}
			continue;
		}
		if (char === '"') {
			inString = false;
			result += char;
			continue;
		}
		const code = char.charCodeAt(0);
		if (code < 0x20) {
			if (char === '\n') result += '\\n';
			else if (char === '\r') result += '\\r';
			else if (char === '\t') result += '\\t';
			else result += `\\u${code.toString(16).padStart(4, '0')}`;
			continue;
		}
		result += char;
	}
	return result;
}

function extractBalancedJson(text, startIndex) {
	const open = text[startIndex];
	const close = open === '{' ? '}' : ']';
	let depth = 0;
	let inString = false;
	for (let index = startIndex; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (char === '\\') {
				index += 1;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
		} else if (char === open) {
			depth += 1;
		} else if (char === close) {
			depth -= 1;
			if (depth === 0) {
				return text.slice(startIndex, index + 1);
			}
		}
	}
	return null;
}

/**
 * Parses JSON emitted by the model, tolerating fences, prose, and the common
 * malformations seen in production before throwing.
 * @param {string} text
 * @returns {unknown}
 */
export function parseJsonResponse(text) {
	if (typeof text !== 'string' || text.trim().length === 0) {
		throw new Error('Model returned an empty response');
	}
	const trimmed = text.trim();
	const candidates = [];
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);
	if (fenced) {
		candidates.push(fenced[1]);
	}
	candidates.push(trimmed);
	for (const start of ['{', '[']) {
		const startIndex = trimmed.indexOf(start);
		if (startIndex !== -1) {
			const balanced = extractBalancedJson(trimmed, startIndex);
			if (balanced) {
				candidates.push(balanced);
			}
		}
	}

	let lastError = null;
	for (const candidate of candidates) {
		try {
			return JSON.parse(sanitizeJsonControlCharacters(candidate));
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError || new Error('Model response was not valid JSON');
}
