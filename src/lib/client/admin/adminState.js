// URL state for the admin dashboard. Keeping this pure means the back
// button, a reload and a shared link all land on the same view.

export const ADMIN_TABS = [
	{ id: 'overview', label: 'Overview', group: 'Insights' },
	{ id: 'traffic', label: 'Traffic', group: 'Insights' },
	{ id: 'engagement', label: 'Engagement', group: 'Insights' },
	{ id: 'reliability', label: 'Reliability', group: 'Insights' },
	{ id: 'logs', label: 'Logs', group: 'Ops' },
	{ id: 'health', label: 'Health', group: 'Ops' },
	{ id: 'manage', label: 'Manage', group: 'Ops' },
];

export const ADMIN_TAB_IDS = new Set(ADMIN_TABS.map((tab) => tab.id));
export const INSIGHT_TABS = new Set(['overview', 'traffic', 'engagement', 'reliability']);
export const COMPARE_TABS = new Set(['overview', 'traffic', 'engagement']);

export const DURATION_OPTIONS = [
	{ value: 1, label: '24h' },
	{ value: 7, label: '7d' },
	{ value: 30, label: '30d' },
	{ value: 90, label: '90d' },
	{ value: 0, label: 'All time' },
];

export const HEALTH_WINDOWS = [
	{ value: 60, label: '1m' },
	{ value: 300, label: '5m' },
	{ value: 900, label: '15m' },
	{ value: 3600, label: '1h' },
];

export const LOG_STATUS_OPTIONS = [
	{ value: '', label: 'Any status' },
	{ value: '2xx', label: '2xx success' },
	{ value: '3xx', label: '3xx redirect' },
	{ value: '4xx', label: '4xx client error' },
	{ value: '429', label: '429 rate limited' },
	{ value: '5xx', label: '5xx server error' },
	{ value: 'other', label: 'Other' },
];

const DAY_VALUES = new Set(DURATION_OPTIONS.map((option) => option.value));
const WINDOW_VALUES = new Set(HEALTH_WINDOWS.map((option) => option.value));
const STATUS_VALUES = new Set(LOG_STATUS_OPTIONS.map((option) => option.value));

const DEFAULTS = {
	tab: 'overview',
	days: 1,
	compare: true,
	window: 60,
	route: '',
	status: '',
	country: '',
	q: '',
};

function text(value, limit) {
	return typeof value === 'string' ? value.slice(0, limit) : '';
}

/** Parses a URLSearchParams string into a validated dashboard state. */
export function parseAdminState(search = '') {
	const params = new URLSearchParams(search);
	const tab = params.get('tab');
	const daysParam = params.get('days');
	const days = daysParam === null ? DEFAULTS.days : Number(daysParam);
	const windowValue = Number(params.get('window'));
	const status = params.get('status') || '';
	return {
		tab: ADMIN_TAB_IDS.has(tab) ? tab : DEFAULTS.tab,
		days: DAY_VALUES.has(days) ? days : DEFAULTS.days,
		compare: params.get('compare') !== '0',
		window: WINDOW_VALUES.has(windowValue) ? windowValue : DEFAULTS.window,
		route: text(params.get('route'), 200),
		status: STATUS_VALUES.has(status) ? status : '',
		country: text(params.get('country'), 100),
		q: text(params.get('q'), 80),
	};
}

/** Serializes dashboard state, omitting defaults to keep links tidy. */
export function buildAdminSearch(state = {}) {
	const next = { ...DEFAULTS, ...state };
	const params = new URLSearchParams();
	if (next.tab !== DEFAULTS.tab) params.set('tab', next.tab);
	if (next.days !== DEFAULTS.days) params.set('days', String(next.days));
	if (!next.compare) params.set('compare', '0');
	if (next.tab === 'health' && next.window !== DEFAULTS.window) {
		params.set('window', String(next.window));
	}
	if (next.tab === 'logs') {
		if (next.route) params.set('route', next.route);
		if (next.status) params.set('status', next.status);
		if (next.country) params.set('country', next.country);
		if (next.q) params.set('q', next.q);
	}
	return params.toString();
}

export function isInsightTab(tab) {
	return INSIGHT_TABS.has(tab);
}

export function supportsCompare(tab) {
	return COMPARE_TABS.has(tab);
}

/** “Last 7 days” / “All time” — used by chart captions and deltas. */
export function windowLabel(days) {
	if (days === 0) return 'All time';
	if (days === 1) return 'Last 24 hours';
	return `Last ${days} days`;
}
