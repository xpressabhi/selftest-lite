import webpush from 'web-push';

// Framework-neutral push sender: the API route passes env values, and the
// reminder script passes process.env. Keeping config explicit means plain Node
// scripts can import this module without SvelteKit's $env alias.

let configuredKey = null;

export function isPushConfigured({ publicKey, privateKey } = {}) {
	return Boolean(publicKey && privateKey);
}

function configure({ publicKey, privateKey, subject }) {
	const key = `${publicKey}:${subject || ''}`;
	if (configuredKey !== key) {
		webpush.setVapidDetails(subject || 'mailto:hello@selftest.in', publicKey, privateKey);
		configuredKey = key;
	}
}

export async function sendPushNotification(subscription, payload, config = {}) {
	if (!isPushConfigured(config)) {
		throw new Error('Push is not configured');
	}
	configure(config);
	const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
	const p256dh = typeof subscription?.p256dh === 'string' ? subscription.p256dh : '';
	const auth = typeof subscription?.auth === 'string' ? subscription.auth : '';
	if (!endpoint || !p256dh || !auth) {
		throw new Error('Invalid push subscription');
	}
	return webpush.sendNotification(
		{ endpoint, keys: { p256dh, auth } },
		JSON.stringify(payload),
		{ TTL: 12 * 60 * 60 }
	);
}
