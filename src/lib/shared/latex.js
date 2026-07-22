const MATH_SEGMENT_PATTERN = /(\$\$?)([\s\S]*?)\1/g;
const BACKSPACE_LATEX_PATTERN = new RegExp(`${String.fromCharCode(8)}(?=[A-Za-z])`, 'g');
const BARE_MATH_PATTERN = /\\(?:frac|dfrac|tfrac|sqrt|binom|vec|hat|bar|overline|underline|mathrm|mathbf|mathbb|mathcal|infty|pm|mp|cdot|times|leq|geq|neq|approx|sum|prod|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|pi|sigma|omega|circ|Delta|Sigma|Omega|begin|end)\b|(?:[A-Za-z0-9)])\s*[\^_]\s*(?:\{[^{}]*\}|[A-Za-z0-9])/;

function restoreJsonEscapedLatexCommands(value) {
	return value
		.replace(/\r(?=[A-Za-z])/g, '\\r')
		.replace(/\n(?=[A-Za-z])/g, '\\n')
		.replace(/\t(?=[A-Za-z])/g, '\\t')
		.replace(BACKSPACE_LATEX_PATTERN, '\\b')
		.replace(/\f(?=[A-Za-z])/g, '\\f');
}

function normalizeUnbracedFunctionSuperscripts(value) {
	return value.replace(/\^\\(ln|log|sin|cos|tan)\s+([A-Za-z0-9]+)/g, (match, command, argument) => {
		return `^{\\${command} ${argument}}`;
	});
}

export function normalizeMathText(value) {
	return String(value ?? '').replace(MATH_SEGMENT_PATTERN, (fullMatch, delimiter, expression) => {
		const restoredExpression = restoreJsonEscapedLatexCommands(expression);
		return `${delimiter}${normalizeUnbracedFunctionSuperscripts(restoredExpression)}${delimiter}`;
	});
}

export function prepareMathTextForRendering(value) {
	const normalizedValue = normalizeMathText(value);

	if (/\$\$?/.test(normalizedValue) || !BARE_MATH_PATTERN.test(normalizedValue)) {
		return normalizedValue;
	}

	return `$${normalizedValue}$`;
}
