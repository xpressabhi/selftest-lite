// One resolver for "what font is the app actually rendering in?".
//
// Canvas text measurement (`pretextLayout.js`) and the share-card renderers
// (`cardKit.js`) both need to name a font in a `ctx.font` shorthand, and both
// must name the *same* one the DOM is painting with. Reading the declared
// `font-family` off the body is not enough on its own: the declared stack
// leads with `Inter`, but no Inter webfont is loaded (no @font-face, no
// `<link>`, no fontsource dependency), so every user actually sees the system
// UI face. Passing the declared list to a canvas makes it silently fall back,
// and the wrap geometry it computes can disagree with the real layout.
//
// So this filters the declared stack down to the families the browser can
// genuinely render, using `document.fonts.check()`. System families and
// generic keywords always check true; a webfont that has not loaded checks
// false and gets dropped — which is exactly the distinction we need. If Inter
// is ever loaded, this starts keeping it and nothing else has to change.
//
// Lives in its own module because it is shared by two unrelated consumers and
// is about fonts, not about text measurement.

const FALLBACK_STACK =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Generic keywords must never be dropped, even though `fonts.check` is
// permissive about them — keeping them is what guarantees a valid answer.
const GENERIC = new Set([
	'ui-sans-serif',
	'ui-serif',
	'ui-rounded',
	'ui-monospace',
	'sans-serif',
	'serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'emoji',
	'math',
	'fangsong'
]);

let cached;

function canRender(family) {
	if (GENERIC.has(family)) return true;
	// No FontFaceSet (very old engines, or a non-browser host) means we cannot
	// tell. Keep the family: measuring against a family the user does have is
	// no worse than the previous hardcoded guess.
	if (typeof document === 'undefined' || !document.fonts?.check) return true;
	try {
		return document.fonts.check(`16px "${family}"`);
	} catch {
		return true;
	}
}

/**
 * The app's font stack, minus any family the browser cannot currently render.
 * Safe to call during SSR (returns the fallback stack).
 */
export function resolveFontStack() {
	if (typeof document === 'undefined' || typeof window === 'undefined') {
		return FALLBACK_STACK;
	}
	if (cached !== undefined) return cached;

	const declared =
		getComputedStyle(document.body).fontFamily.trim() || FALLBACK_STACK;
	const kept = declared
		.split(',')
		.map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
		.filter((family) => family.length > 0 && canRender(family));

	// If filtering removed everything (unexpected), keep the generic tail so we
	// never hand a canvas an empty stack.
	cached = kept.some((family) => GENERIC.has(family)) ? kept.join(', ') : FALLBACK_STACK;

	// A webfont can finish loading after the first call. Recompute once the
	// FontFaceSet settles so a late load is picked up without a reload.
	if (document.fonts?.addEventListener) {
		document.fonts.addEventListener('loadingdone', () => {
			cached = undefined;
		});
	}

	return cached;
}

/** Canvas `font` shorthand on the app's real stack. */
export function canvasFont(px, weight = 400) {
	return `${weight} ${px}px ${resolveFontStack()}`;
}
