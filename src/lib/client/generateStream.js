// Shared SSE reader for the generation endpoint.
//
// Both the home page and the exam-paper page POST to `/api/generate` with
// `Accept: text/event-stream` and consume the same framing: `progress`
// frames while the server works, then a single `done` or `error` frame.
// Only the framing is shared here; request bodies and end-of-stream error
// handling stay with each caller.

import { parseSseBuffer } from './sse.js';

/**
 * Reads an SSE generation response body, invoking `onEvent(event, data)` for
 * every complete frame.
 *
 * `onEvent` can throw to fail the read (e.g. for `error` frames) or return
 * `{ stop: true, value }` to stop reading early and resolve with `value`.
 * When the stream ends without a stop it resolves `{ stopped: false }`, so
 * callers keep their own end-of-stream handling.
 */
export async function readGenerationStream(response, { onEvent } = {}) {
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) {
			return { stopped: false };
		}
		buffer += decoder.decode(value, { stream: true });
		const { events, rest } = parseSseBuffer(buffer);
		buffer = rest;
		for (const { event, data } of events) {
			const outcome = onEvent?.(event, data);
			if (outcome?.stop) {
				return { stopped: true, value: outcome.value };
			}
		}
	}
}
