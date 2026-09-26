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

	// Exam notification hub
	'exams:view',
	'exams:search',
	'exams:filter',
	'exams:notice-open',
	'exams:practice-click',

	// Home / smart intent input
	'intent:parse',
	'intent:parsed',
	'intent:parse-failed',
	'intent:clarification-asked',
	'intent:clarification-answered',
	'intent:preview',
	'preview:edit-toggle',
	'preview:edit-chip',
	'planner:example-tap',
	'home:manual-expand',
	'home:resume-test',
	'streak:view',
	'streak:share',

	// Generation
	'generate:start',
	'generate:success',
	'generate:fail',
	'generate:cancel',
	'generate:trimmed',
	'generate:quick-start-exam',
	'generate:quick-start-preset',
	'generate:quick-start-daily',

	// Premium exam papers
	'exam-paper:open',
	'exam-paper:pattern',
	'exam-paper:generate',

	// Search (smart intent dropdown)
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
	'test:flag',
	'test:exit',
	'test:submit',
	'test:submit-fail',
	'test:share',
	'test:swipe',
	'test:hint-offer',
	'test:hint-use',
	'test:hint-fail',

	// Results
	'results:view',
	'results:explain',
	'results:explain-fail',
	'results:bookmark-question',
	'results:toggle-question',
	'results:retake',
	'results:print',
	'results:share',
	'results:share-card',
	'results:challenge-accept',
	'results:challenge-view',
	'results:auto-explain-toggle',
	'results:practice-weak',
	'question:report',
	'test:rating',

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
	'history:undo-delete',

	// Global settings
	'settings:language-toggle',
	'settings:theme-toggle',
	'settings:data-saver-toggle',
	'settings:auto-advance-toggle',

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

	// Reminders
	'reminder:opt-in',
	'reminder:time-set',

	// Nudge engine (fail-open; suppression reasons are machine codes)
	'nudge:shown',
	'nudge:clicked',
	'nudge:dismissed',
	'nudge:suppressed',

	// In-app exam update inbox
	'notifications:view',
	'notifications:item-open',
	'notifications:practice-click',
	'notifications:badge-shown',
	'notifications:all-read',

	// Native shell / interaction quality
	'app:open',
	'app:deep-link',
	'ui:rage-tap',

	// Device & network profile
	'device:profile',
	'net:change',

	// Personalization router (fail-open; fallback keeps current UI)
	'personalize:request',
	'personalize:applied',
	'personalize:fallback',
]);
