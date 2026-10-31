// Serializes the Jev request/response payloads stored on api_request_events.
//
// Audit rows can carry the full model payload, but a single turn can include
// the topic Choice with every candidate. Cap each payload so a row never grows
// unbounded; an over-cap payload keeps a marked JSON preview rather than a
// silently truncated document.

export const MAX_AUDIT_PAYLOAD_CHARS = 96 * 1024;

export function serializeAuditPayload(value) {
	if (value === null || value === undefined) {
		return null;
	}
	let json;
	try {
		json = JSON.stringify(value);
	} catch {
		return JSON.stringify({ error: 'serialization_failed' });
	}
	if (typeof json !== 'string') {
		return null;
	}
	if (json.length <= MAX_AUDIT_PAYLOAD_CHARS) {
		return json;
	}
	return JSON.stringify({
		truncated: true,
		chars: json.length,
		preview: json.slice(0, MAX_AUDIT_PAYLOAD_CHARS),
	});
}
