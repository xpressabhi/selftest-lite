<script>
	// Canvas adaptation of Pretext's Gravity Letters demo for the live planner
	// topic. Pretext gives the exact wrapped lines; each grapheme becomes a
	// particle that drops, bounces and springs back to its home position.
	//
	// This only runs when Pretext is already in memory (a test, print or chat
	// interaction loaded it) and never on Save-Data or reduced motion. Otherwise
	// the CSS GravityText fallback runs, so the home page never pays for the
	// engine just to decorate a label.
	import { onMount } from 'svelte';
	import GravityText from './GravityText.svelte';
	import { splitGraphemes } from './cardText.js';
	import { isPretextReady, layoutTextLinesIfReady, warmPretext } from './pretextLayout.js';

	let { text = '', class: className = '' } = $props();

	let wrapper;
	let textEl;
	let canvas;
	let mounted = false;
	let lastText = '';
	let raf = 0;
	let safetyTimer = 0;
	let reduced = $state(false);
	let running = $state(false);

	function canAnimate() {
		if (typeof navigator === 'undefined') {
			return false;
		}
		const connection = navigator.connection;
		if (connection?.saveData) {
			return false;
		}
		return !/^(slow-2g|2g)$/.test(connection?.effectiveType || '');
	}

	function cancel() {
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
		if (safetyTimer) {
			clearTimeout(safetyTimer);
			safetyTimer = 0;
		}
	}

	function runCanvas(value) {
		cancel();
		if (!textEl || !canvas || !wrapper) {
			running = false;
			return;
		}
		const style = getComputedStyle(textEl);
		const width = Math.ceil(wrapper.clientWidth);
		const height = Math.ceil(wrapper.clientHeight);
		if (width <= 0 || height <= 0) {
			running = false;
			return;
		}
		// Canvas `font` does not take the line-height the computed shorthand
		// carries, so build a valid shorthand from the parts.
		const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`.trim();
		const fontSize = Number.parseFloat(style.fontSize) || 16;
		const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.25;
		const lines = layoutTextLinesIfReady(value, font, width, lineHeight);
		if (!lines || lines.length === 0) {
			running = false;
			return;
		}

		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.ceil(width * dpr);
		canvas.height = Math.ceil(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			running = false;
			return;
		}
		ctx.scale(dpr, dpr);
		ctx.font = font;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = style.color;

		const letters = [];
		lines.forEach((line, lineIndex) => {
			let x = 0;
			const baseline =
				lineIndex * lineHeight + (lineHeight - fontSize) / 2 + fontSize * 0.8;
			for (const char of splitGraphemes(line)) {
				const charWidth = ctx.measureText(char).width;
				if (char.trim()) {
					letters.push({
						char,
						homeX: x,
						homeY: baseline,
						x,
						y: baseline - 26 - Math.random() * 24,
						vx: (Math.random() - 0.5) * 1.2,
						vy: 0,
						rot: (Math.random() - 0.5) * 0.25,
						vr: (Math.random() - 0.5) * 0.02,
						width: charWidth,
					});
				}
				x += charWidth;
			}
		});
		if (letters.length === 0) {
			running = false;
			return;
		}

		const start = performance.now();
		const gravity = 0.6;
		const damping = 0.985;
		const bounce = 0.5;
		const settleAt = 380;
		let last = start;
		running = true;
		// Never leave the real text hidden if the animation stalls.
		safetyTimer = window.setTimeout(() => {
			running = false;
			cancel();
		}, 1600);

		const frame = (now) => {
			const dt = Math.min(2.5, Math.max(0.5, (now - last) / 16.67));
			last = now;
			const elapsed = now - start;
			for (const letter of letters) {
				if (elapsed > settleAt) {
					letter.vx += (letter.homeX - letter.x) * 0.16;
					letter.vy += (letter.homeY - letter.y) * 0.16;
					letter.vx *= 0.8;
					letter.vy *= 0.8;
					letter.rot *= 0.82;
				} else {
					letter.vy += gravity * dt;
					letter.vx *= damping;
					letter.vy *= damping;
					letter.x += letter.vx * dt;
					letter.y += letter.vy * dt;
					letter.rot += letter.vr * dt;
					letter.vr *= 0.985;
					if (letter.y > height - 2) {
						letter.y = height - 2;
						letter.vy *= -bounce;
						letter.vx *= 0.92;
						letter.vr *= 0.85;
					}
					if (letter.x < 0) {
						letter.x = 0;
						letter.vx *= -bounce;
					}
					if (letter.x > width - letter.width) {
						letter.x = width - letter.width;
						letter.vx *= -bounce;
					}
				}
			}

			ctx.clearRect(0, 0, width, height);
			for (const letter of letters) {
				ctx.save();
				ctx.translate(letter.x, letter.y);
				ctx.rotate(letter.rot);
				ctx.fillText(letter.char, 0, 0);
				ctx.restore();
			}

			const settled =
				elapsed > settleAt &&
				letters.every(
					(letter) =>
						Math.abs(letter.homeX - letter.x) < 0.6 &&
						Math.abs(letter.homeY - letter.y) < 0.6
				);
			if (settled || elapsed > 1200) {
				running = false;
				raf = 0;
				clearTimeout(safetyTimer);
				safetyTimer = 0;
				return;
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}

	onMount(() => {
		mounted = true;
		lastText = text;
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => {
			reduced = media.matches;
		};
		update();
		media.addEventListener?.('change', update);
		return () => {
			cancel();
			media.removeEventListener?.('change', update);
		};
	});

	$effect(() => {
		const value = text;
		if (!mounted) {
			lastText = value;
			return;
		}
		if (value === lastText) {
			return;
		}
		lastText = value;
		if (reduced || !canAnimate()) {
			running = false;
			return;
		}
		if (!isPretextReady()) {
			// This change uses the CSS cascade; load the engine in the background
			// so the next change can use the canvas physics. Four cores keeps it
			// off truly low-end devices; the chunk is cached after that.
			if ((navigator.hardwareConcurrency || 4) >= 4) {
				void warmPretext();
			}
			running = false;
			return;
		}
		// Per-grapheme canvas positioning only matches shaped runs for Latin
		// scripts; Devanagari, Arabic, CJK and emoji keep the CSS cascade.
		if (!/^[\u0020-\u024F\s\d\p{P}\p{S}]+$/u.test(value)) {
			running = false;
			return;
		}
		runCanvas(value);
		return () => cancel();
	});
</script>

<span class={`gravity-topic ${className}`} bind:this={wrapper} data-gravity-topic>
	<span class="gravity-topic-text" class:gravity-hidden={running} bind:this={textEl}>
		<GravityText {text} />
	</span>
	<canvas
		class="gravity-canvas"
		class:gravity-visible={running}
		bind:this={canvas}
		aria-hidden="true"
	></canvas>
</span>

<style>
	.gravity-topic {
		position: relative;
		display: inline-block;
		max-width: 100%;
		vertical-align: top;
	}

	.gravity-topic-text {
		display: inline;
	}

	.gravity-topic-text.gravity-hidden {
		opacity: 0;
	}

	.gravity-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		pointer-events: none;
		transition: opacity 120ms ease;
	}

	.gravity-canvas.gravity-visible {
		opacity: 1;
	}
</style>
