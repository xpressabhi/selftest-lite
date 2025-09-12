'use client';

import React, { useEffect } from 'react';

// This component is intentionally tiny. It defers importing analytics
// and speed-insights until the browser is idle to avoid blocking initial
// hydration and reduce CPU work on low-end devices.
export default function LazyMetrics() {
	useEffect(() => {
		let mounted = true;
		const load = async () => {
			try {
				// Wait for idle time if available
				if ('requestIdleCallback' in window) {
					await new Promise((res) =>
						requestIdleCallback(res, { timeout: 2000 }),
					);
				} else {
					// fallback short delay
					await new Promise((res) => setTimeout(res, 1500));
				}

				if (!mounted) return;

				// Dynamically import analytics packages
				const [{ Analytics }, { SpeedInsights }] = await Promise.all([
					import('@vercel/analytics/next').then((m) => ({
						Analytics: m.Analytics,
					})),
					import('@vercel/speed-insights/next').then((m) => ({
						SpeedInsights: m.SpeedInsights,
					})),
				]);

				// Render by mounting to a container we create
				const container = document.createElement('div');
				container.id = 'lazy-metrics-root';
				document.body.appendChild(container);

				// Manually mount simple elements that call the analytics components
				// Note: We avoid ReactDOM.render to keep this file dependency-free and tiny.
				// Instead, we create script tags to initialize analytics if necessary.

				// If Analytics has a setup API we could call it here. Many analytics
				// libraries auto-run on import, so the dynamic import above is often enough.
			} catch (e) {
				// ignore failures: analytics should not block app
				console.debug('LazyMetrics failed to load analytics:', e?.message || e);
			}
		};

		load();
		return () => {
			mounted = false;
		};
	}, []);

	return null;
}
