<script>
	import { onDestroy, onMount } from 'svelte';

	// The only place generated HTML/JS ever executes. The sandbox attribute is
	// contractual: allow-scripts and nothing else, so the artifact runs in an
	// opaque origin with no reach back into the app (docs/superpowers/specs/
	// 2026-10-14-playground-explainer-design.md, section 6). The scaffold
	// injects a ResizeObserver that reports the document height; this component
	// clamps it and falls back to a fixed height when no message arrives.
	let { html = '', title = '' } = $props();

	const MIN_HEIGHT = 320;
	const FALLBACK_HEIGHT = 560;

	let frame = $state();
	let height = $state(FALLBACK_HEIGHT);
	let reportedHeight = null;
	let rafHandle = null;

	function clampHeight(value) {
		const maxHeight =
			typeof window !== 'undefined' ? window.innerHeight * 0.85 : FALLBACK_HEIGHT * 1.5;
		return Math.min(Math.max(value, MIN_HEIGHT), maxHeight);
	}

	function commitHeight() {
		rafHandle = null;
		if (reportedHeight === null) {
			return;
		}
		height = clampHeight(reportedHeight);
	}

	function onMessage(event) {
		if (!frame || event.source !== frame.contentWindow) {
			return;
		}
		const data = event.data;
		if (!data || data.type !== 'selftest-explainer-height') {
			return;
		}
		const reported = Number(data.height);
		if (!Number.isFinite(reported)) {
			return;
		}
		reportedHeight = reported;
		if (rafHandle === null && typeof window !== 'undefined') {
			rafHandle = window.requestAnimationFrame(commitHeight);
		}
	}

	// A resize or rotation re-clamps the last reported height: the ceiling is
	// a share of the viewport, so a fixed height would stop being responsive.
	function onResize() {
		if (reportedHeight !== null) {
			height = clampHeight(reportedHeight);
		}
	}

	onMount(() => {
		window.addEventListener('message', onMessage);
		window.addEventListener('resize', onResize);
	});

	onDestroy(() => {
		// SSR teardown also runs this callback; window exists only in the
		// browser.
		if (typeof window === 'undefined') {
			return;
		}
		window.removeEventListener('message', onMessage);
		window.removeEventListener('resize', onResize);
		if (rafHandle !== null) {
			window.cancelAnimationFrame(rafHandle);
		}
	});
</script>

<iframe
	bind:this={frame}
	class="artifact-frame"
	{title}
	sandbox="allow-scripts"
	referrerpolicy="no-referrer"
	srcdoc={html}
	style={`height: ${Math.round(height)}px;`}
></iframe>

<style>
	.artifact-frame {
		width: 100%;
		border: 0;
		display: block;
		background: var(--surface, #ffffff);
		border-radius: var(--radius-control, 12px);
	}
</style>
