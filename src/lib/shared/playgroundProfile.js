// Client capability buckets for concept-artifact generation. The artifact is
// generated for a *class* of device, never a fingerprint: coarse signals are
// bucketed here, only the buckets travel to the server, and the buckets are
// part of the explainer cache key (so phone-lite and wide-full users share
// stable artifacts per class).

export const VIEWPORT_CLASSES = ['phone', 'wide'];
export const BUDGET_CLASSES = ['lite', 'full'];

export const PHONE_MAX_WIDTH = 600;

/**
 * Buckets raw browser signals. Unknown signals count as capable: the default
 * is the full experience, and only positive evidence (small width, save-data,
 * slow effective type, few cores/memory, reduced motion) downgrades it.
 */
export function bucketClientProfile(raw = {}) {
	const width = Number(raw?.width);
	const viewport = Number.isFinite(width) && width > 0 && width <= PHONE_MAX_WIDTH ? 'phone' : 'wide';

	const effectiveType = String(raw?.effectiveType ?? '').toLowerCase();
	const deviceMemory = Number(raw?.deviceMemory);
	const hardwareConcurrency = Number(raw?.hardwareConcurrency);

	const slowNetwork =
		raw?.saveData === true || ['slow-2g', '2g', '3g'].includes(effectiveType);
	const lowDevice =
		(Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4) ||
		(Number.isFinite(hardwareConcurrency) &&
			hardwareConcurrency > 0 &&
			hardwareConcurrency <= 4);
	const budget =
		raw?.reducedMotion === true || slowNetwork || lowDevice ? 'lite' : 'full';

	return { viewport, budget };
}

/** Validates a profile that arrived over the wire; invalid values default. */
export function normalizePlaygroundProfile(value) {
	const viewport = VIEWPORT_CLASSES.includes(value?.viewport) ? value.viewport : 'wide';
	const budget = BUDGET_CLASSES.includes(value?.budget) ? value.budget : 'full';
	return { viewport, budget };
}
