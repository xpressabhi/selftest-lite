import { ensureStorageSchema, normalizeUserIdValue, query } from './storage';

export const TELEMETRY_EVENTS = new Set([
	// Page views
	'page:view',
	// Quiz setup (home form)
	'setup:mode',
	'setup:language',
	'setup:difficulty',
	'setup:test-type',
	'setup:category',
	'setup:topic-toggle',
	'setup:topic-input',
	'setup:exam-select',
	'setup:exam-search',
	'setup:exam-group-filter',
	'setup:syllabus-toggle',
	'setup:questions-count',
	// Generation
	'generate:start',
	'generate:success',
	'generate:fail',
	'generate:quick-start-exam',
	'generate:quick-start-preset',
	'generate:save-preset',
	// Search
	'search:open',
	'search:keystroke',
	'search:submit',
	'search:result-click',
	'search:scroll-more',
	'search:close',
	// Test
	'test:start',
	'test:answer',
	'test:prev',
	'test:next',
	'test:jump',
	'test:panel-toggle',
	'test:submit',
	'test:submit-fail',
	'test:share',
	// Results
	'results:view',
	'results:explain',
	'results:explain-fail',
	'results:bookmark-question',
	'results:print',
	'results:share',
	// Bookmarks / history
	'bookmarks:view',
	'bookmark:add-exam',
	'bookmark:remove-exam',
	'bookmark:add-preset',
	'bookmark:remove-preset',
	'bookmark:remove-question',
	'history:view',
	'history:clear',
	'history:search',
	'history:open-test',
	// Global
	'settings:language-toggle',
	'settings:theme-toggle',
	'settings:data-saver-toggle',
	'pwa:install-prompt',
	'pwa:install-accepted',
	'pwa:install-dismissed',
	// APK distribution
	'apk:download',
	// Auth
	'auth:google-sign-in',
	'auth:sign-out',
	'auth:view',
	'auth:failed',
	// Profile / personalization
	'profile:save',
	'profile:reset',
	'profile:opt-out',
	// Scroll depth
	'scroll:depth',
]);

const MAX_EVENTS_PER_REQUEST = 50;
const MAX_EVENT_NAME_LENGTH = 64;
const MAX_PAGE_LENGTH = 64;
const MAX_SESSION_LENGTH = 64;
const MAX_PROPS_BYTES = 2048;

export { MAX_EVENTS_PER_REQUEST };

/**
 * Validates and normalizes a telemetry POST payload.
 * Pure function (no DB) so it is unit-testable.
 * @param {unknown} body
 * @returns {{ events: Array<{event: string, page: string|null, props: Record<string, unknown>, created_at?: string}> } | { error: string, status: number }}
 */
export function validateTelemetryPayload(body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return { error: 'Invalid payload', status: 400 };
	}

	const rawEvents = Array.isArray(body.events) ? body.events : null;
	if (!rawEvents || rawEvents.length === 0) {
		return { error: 'No events', status: 400 };
	}
	if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
		return { error: 'Too many events', status: 413 };
	}

	const sessionId =
		typeof body.sessionId === 'string' && body.sessionId.length <= MAX_SESSION_LENGTH
			? body.sessionId
			: null;
	const clientId =
		typeof body.clientId === 'string' &&
		body.clientId.length >= 8 &&
		body.clientId.length <= MAX_SESSION_LENGTH
			? body.clientId
			: null;

	const events = [];
	for (const rawEvent of rawEvents) {
		if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
			continue;
		}
		const event = rawEvent.event;
		if (
			typeof event !== 'string' ||
			event.length === 0 ||
			event.length > MAX_EVENT_NAME_LENGTH
		) {
			continue;
		}
		if (!TELEMETRY_EVENTS.has(event)) {
			continue;
		}
		const page =
			typeof rawEvent.page === 'string' && rawEvent.page.length <= MAX_PAGE_LENGTH
				? rawEvent.page
				: null;
		let props = {};
		if (
			rawEvent.props &&
			typeof rawEvent.props === 'object' &&
			!Array.isArray(rawEvent.props)
		) {
			const serialized = JSON.stringify(rawEvent.props);
			if (serialized && serialized.length <= MAX_PROPS_BYTES) {
				props = rawEvent.props;
			}
		}
		const created_at =
			typeof rawEvent.created_at === 'string' &&
			!Number.isNaN(Date.parse(rawEvent.created_at))
				? rawEvent.created_at
				: undefined;
		events.push({ event, page, props, sessionId, created_at });
	}

	if (events.length === 0) {
		return { error: 'No valid events', status: 400 };
	}

	return { events, clientId };
}

export async function recordTelemetryEvents(events, identity = {}) {
	if (!Array.isArray(events) || events.length === 0) {
		return 0;
	}

	await ensureStorageSchema();

	const clientId =
		typeof identity.clientId === 'string' && identity.clientId.length <= 64
			? identity.clientId
			: null;
	const userId = normalizeUserIdValue(identity.userId);

	const nowIso = new Date().toISOString();
	const values = [];
	const params = [];
	let placeholderIndex = 1;

	for (const event of events) {
		values.push(
			`($${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++})`
		);
		params.push(
			event.event,
			event.page || null,
			JSON.stringify(event.props || {}),
			event.sessionId || null,
			event.created_at || nowIso,
			clientId,
			userId
		);
	}

	const result = await query(
		`INSERT INTO feature_events (event, page, props, session_id, created_at, client_id, user_id)
		 VALUES ${values.join(', ')}`,
		params
	);

	return result.rowCount || 0;
}
