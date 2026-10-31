<script>
	// A lightweight DOM adaptation of Pretext's Gravity Letters demo: each
	// grapheme is an inline-block that drops and settles, word by word so the
	// browser can still wrap the label. The real text stays in the accessibility
	// tree; the animated copy is aria-hidden.
	import { splitGraphemes } from './cardText.js';

	let { text = '', class: className = '' } = $props();

	const MAX_DELAY = 260;
	const STEP = 10;

	const words = $derived.by(() => {
		let index = 0;
		return String(text || '')
			.split(/\s+/u)
			.filter(Boolean)
			.map((word) => ({
				letters: splitGraphemes(word).map((char) => ({
					char,
					delay: Math.min(index++ * STEP, MAX_DELAY),
				})),
			}));
	});
</script>

<span class={`gravity-text ${className}`} aria-label={text}>
	<span class="gravity-visual" aria-hidden="true">
		{#key text}
			{#each words as word, wordIndex (wordIndex)}
				{#if wordIndex > 0}&#32;{/if}
				<span class="gravity-word">
					{#each word.letters as letter, letterIndex (letterIndex)}
						<span class="gravity-letter" style={`--gravity-delay: ${letter.delay}ms`}>
							{letter.char}
						</span>
					{/each}
				</span>
			{/each}
		{/key}
	</span>
</span>

<style>
	.gravity-text {
		display: inline;
	}

	.gravity-visual {
		display: inline;
	}

	.gravity-word {
		display: inline-block;
		white-space: nowrap;
	}

	.gravity-letter {
		display: inline-block;
		animation: gravity-letter-drop 480ms cubic-bezier(0.18, 0.72, 0.28, 1.08) both;
		animation-delay: var(--gravity-delay, 0ms);
	}

	@keyframes gravity-letter-drop {
		0% {
			opacity: 0;
			transform: translateY(-0.55em) scale(0.92);
		}
		62% {
			opacity: 1;
			transform: translateY(0.06em) scale(1);
		}
		80% {
			transform: translateY(-0.02em);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.gravity-letter {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
