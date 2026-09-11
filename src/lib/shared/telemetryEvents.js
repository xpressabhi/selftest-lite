// Single source of truth for accepted telemetry event names.
//
// Every track()/trackDebounced() call under src/ must use a name from this
// set; telemetryEvents.test.js enforces that in CI. The telemetry API drops
// unknown names, so a missing entry here silently loses data — add the entry
// in the same commit as the new track() call.
//
// Keep this list equal to the events actually emitted. The test also fails
// when an entry has no emit site anywhere, which keeps the allowlist honest
// and forces dead features to be deleted rather than linger.

export const TELEMETRY_EVENTS = new Set([
	// Page views
	'page:view',
	'scroll:depth',

	// Home / smart intent input
	'intent:parse',
	'intent:parsed',
	'intent:parse-failed',
	'preview:edit-chip',
	'welcome:dismiss',

	// Generation
	'generate:start',
	'generate:success',
	'generate:fail',
	'generate:quick-start-exam',
	'generate:quick-start-preset',

	// Test
	'test:start',
	'test:answer',
	'test:prev',
	'test:next',
	'test:jump',
	'test:flag',
	'test:exit',
	'test:submit',
	'test:submit-fail',
	'test:share',

	// Results
	'results:view',
	'results:explain',
	'results:explain-fail',
	'results:bookmark-question',
	'results:toggle-question',
	'results:retake',
	'results:print',
	'results:share',

	// Bookmarks / history
	'bookmarks:view',
	'bookmark:add-exam',
	'bookmark:remove-exam',
	'bookmark:remove-preset',
	'bookmark:remove-question',
	'history:view',
	'history:clear',
	'history:search',
	'history:open-test',
	'history:delete-test',

	// Global settings
	'settings:language-toggle',
	'settings:theme-toggle',
	'settings:data-saver-toggle',

	// PWA / distribution
	'pwa:install-prompt',
	'pwa:install-accepted',
	'pwa:install-dismissed',
	'apk:download',

	// Auth / profile
	'auth:google-sign-in',
	'auth:sign-out',
	'profile:save',
	'profile:reset',
	'profile:opt-out',
]);
