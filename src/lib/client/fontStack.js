// One resolver for "what font is the app actually rendering in?".
//
// Canvas text measurement (`pretextLayout.js`) and the share-card renderers
// (`cardKit.js`) both need to name a font in a `ctx.font` shorthand, and both
// must name the *same* one the DOM is painting with.
//
// An earlier version of this tried to be clever: it read the declared
// `font-family` and filtered out families the browser "could not render",
// using `document.fonts.check()`. That does not work. Per the CSS Font Loading
// spec `check()` returns **true** when no matching FontFace exists, because
// the browser will fall back to a system font — so it returns true for any
// invented family name too. Verified in WebKit with `document.fonts.size === 0`:
// `check('16px "Inter"')` and `check('16px "NotAFontAtAll123"')` are both true.
// The filter therefore removed nothing and the bug it claimed to fix was still
// there.
//
// So the resolution is not clever: keep the declared stack truthful (Inter is
// not in it, because no Inter webfont is loaded) and hand that same stack to
// the canvas. The two then cannot disagree, because they are the same string.
//
// Lives in its own module because two unrelated consumers need it and it is
// about fonts, not about text measurement.

const FALLBACK_STACK =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The app's declared font stack, which is what the DOM renders with.
 * Safe to call during SSR (returns the fallback stack).
 */
export function resolveFontStack() {
	if (typeof document === 'undefined' || typeof window === 'undefined') {
		return FALLBACK_STACK;
	}
	const declared = getComputedStyle(document.body).fontFamily.trim();
	return declared || FALLBACK_STACK;
}

/** Canvas `font` shorthand on the app's real stack. */
export function canvasFont(px, weight = 400) {
	return `${weight} ${px}px ${resolveFontStack()}`;
}
