const MATH_SEGMENT_PATTERN = /(\$\$?)([\s\S]*?)\1/g;
const BACKSPACE_LATEX_PATTERN = new RegExp(`${String.fromCharCode(8)}(?=[A-Za-z])`, 'g');

function restoreJsonEscapedLatexCommands(value) {
	return value
		.replace(/\r(?=[A-Za-z])/g, '\\r')
		.replace(/\n(?=[A-Za-z])/g, '\\n')
		.replace(/\t(?=[A-Za-z])/g, '\\t')
		.replace(BACKSPACE_LATEX_PATTERN, '\\b')
		.replace(/\f(?=[A-Za-z])/g, '\\f');
}

export function normalizeMathText(value) {
	return String(value ?? '').replace(MATH_SEGMENT_PATTERN, (fullMatch, delimiter, expression) => {
		return `${delimiter}${restoreJsonEscapedLatexCommands(expression)}${delimiter}`;
	});
}
