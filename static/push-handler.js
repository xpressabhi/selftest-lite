// Loaded into the generated Workbox service worker via workbox.importScripts.
// Handles daily reminder pushes and focuses (or opens) the app at the Daily 5.

self.addEventListener('push', (event) => {
	// The sender always carries a day-rotated, language-aware title/body; this
	// default only covers non-JSON payloads (kept in the study-buddy voice).
	let payload = {
		title: 'Yo! Your study buddy called 🎯',
		body: "The table's set, the chai's warm — 5 quick questions?",
		url: '/?daily=1',
	};
	try {
		if (event.data) {
			payload = { ...payload, ...event.data.json() };
		}
	} catch {
		// Non-JSON payloads fall back to the default reminder copy.
	}
	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: '/icons/192.png',
			badge: '/icons/96.png',
			data: { url: payload.url },
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification?.data?.url || '/?daily=1';
	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true,
			});
			for (const client of allClients) {
				if (client.url.includes(self.location.origin)) {
					await client.focus();
					return;
				}
			}
			return self.clients.openWindow(url);
		})()
	);
});
