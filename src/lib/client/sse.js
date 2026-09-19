// Incremental parser for `text/event-stream` bodies.
//
// The generation endpoint streams `progress` events while it works and one
// `done` (or `error`) event at the end. This parser is pure so the framing
// rules can be unit-tested without a browser.

/**
 * Consumes as much of `buffer` as contains complete frames and returns the
 * parsed events plus the unconsumed remainder (a partial frame).
 * `data:` payloads are JSON-decoded when possible.
 */
export function parseSseBuffer(buffer) {
	const events = [];
	let rest = String(buffer || '').replace(/\r\n/g, '\n');
	let separatorIndex = rest.indexOf('\n\n');
	while (separatorIndex !== -1) {
		const frame = rest.slice(0, separatorIndex);
		rest = rest.slice(separatorIndex + 2);
		let event = 'message';
		const dataLines = [];
		for (const line of frame.split('\n')) {
			if (line.startsWith(':')) continue;
			if (line.startsWith('event:')) {
				event = line.slice(6).trim();
			} else if (line.startsWith('data:')) {
				dataLines.push(line.slice(5).replace(/^ /, ''));
			}
		}
		if (dataLines.length > 0) {
			const raw = dataLines.join('\n');
			let data = raw;
			try {
				data = JSON.parse(raw);
			} catch {
				// Keep the raw string; callers can ignore unknown frames.
			}
			events.push({ event, data });
		}
		separatorIndex = rest.indexOf('\n\n');
	}
	return { events, rest };
}

/**
 * Detects an error payload from a streamed `error` event and throws an Error
 * shaped like the JSON endpoint's failures (code/status/retryable).
 */
export function streamErrorToError(data) {
	const error = new Error(data?.error || 'Generation failed');
	error.code = typeof data?.code === 'string' ? data.code : null;
	error.status = Number(data?.status) || 0;
	error.details = typeof data?.details === 'string' ? data.details : null;
	error.retryable = error.status === 429 || error.status >= 500 || error.status === 0;
	return error;
}
