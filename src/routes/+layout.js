import { injectAnalytics } from '@vercel/analytics/sveltekit';

const isLocalDevelopment =
	typeof window !== 'undefined' &&
	['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

// Data-saver users opted into saving bandwidth: skip the analytics script
// (~2KB + tracking calls) for them. Reads localStorage directly because the
// store in preferences.js isn't hydrated yet at module load time.
const dataSaverKey =
	typeof window !== 'undefined' ? window.localStorage.getItem('dataSaverMode') : null;
const connection =
	typeof navigator !== 'undefined'
		? navigator.connection || navigator.mozConnection || navigator.webkitConnection
		: null;
const slowConnection =
	Boolean(connection?.saveData) ||
	['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || '').toLowerCase());
const isDataSaverActive = dataSaverKey === 'true' || (dataSaverKey === null && slowConnection);

if (!isDataSaverActive) {
	injectAnalytics({
		// Do not rely on esm-env's build-time mode resolution; deployed builds can
		// otherwise be emitted as development and silently disable tracking.
		mode: isLocalDevelopment ? 'development' : 'production',
	});
}
