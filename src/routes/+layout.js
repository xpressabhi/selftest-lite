import { injectAnalytics } from '@vercel/analytics/sveltekit';

const isLocalDevelopment =
	typeof window !== 'undefined' &&
	['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

injectAnalytics({
	// Do not rely on esm-env's build-time mode resolution; deployed builds can
	// otherwise be emitted as development and silently disable tracking.
	mode: isLocalDevelopment ? 'development' : 'production',
});
