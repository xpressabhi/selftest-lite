// Off-main-thread print measurement for large papers. Pretext uses
// OffscreenCanvas when no DOM canvas exists, so the same estimator runs here
// unchanged. The locale is set explicitly because a worker has no <html lang>.

import { estimatePrintLayout } from './printLayout.js';
import { setPretextLocale } from './pretextLayout.js';

self.onmessage = async (event) => {
	const { id, paper, locale, root } = event.data || {};
	try {
		await setPretextLocale(locale);
		const result = await estimatePrintLayout(paper, { root });
		self.postMessage({
			id,
			ok: true,
			pages: result.pages,
			splittable: [...result.splittable],
		});
	} catch (error) {
		self.postMessage({ id, ok: false, error: String(error?.message || error) });
	}
};
