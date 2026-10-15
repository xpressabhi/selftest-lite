// The review card asks POST /api/visual-fit before it offers to build a
// visual. Specs that are not about the gate itself stub the verdict, so a live
// TYPESAFE_API_KEY in .env.local can never turn a suite run into a model
// provider call. The gate's own behavior is pinned with bespoke stubs in
// visual-explanation.e2e.js.
// Spec: docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md §7.1

/** A no-link card keeps its build offer, the behavior from before the gate. */
const WORTH_IT = {
	suggested: true,
	category: 'worth_it',
	confidence: 0.9,
	cached: false,
	degraded: false,
};

/**
 * Stubs the visual-fit verdict for specs that do not exercise the gate.
 * Pass a partial verdict to pin a different outcome (e.g. not_visual).
 */
export async function stubVisualFit(page, verdict = {}) {
	await page.route('**/api/visual-fit', async (route) => {
		await route.fulfill({ status: 200, json: { ...WORTH_IT, ...verdict } });
	});
}
