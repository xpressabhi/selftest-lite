<script>
	import { onMount } from 'svelte';
	import { isDataSaverActive } from './preferences';

	let {
		children,
		class: className = '',
		duration = 240,
		estimatedHeight = null,
		...restProps
	} = $props();

	let element = $state();
	let contentElement = $state();
	let height = $state('auto');
	let prefersReducedMotion = $state(false);
	let previousHeight = 0;
	let animationFrame = 0;

	let motionDisabled = $derived(prefersReducedMotion || $isDataSaverActive);
	let transition = $derived(
		motionDisabled ? 'none' : `height ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
	);

	function getElementHeight() {
		return element ? Math.ceil(element.getBoundingClientRect().height) : 0;
	}

	function getIntrinsicHeight() {
		if (!element || !contentElement) {
			return 0;
		}

		const style = window.getComputedStyle(element);
		const verticalBox =
			parseFloat(style.paddingTop || '0') +
			parseFloat(style.paddingBottom || '0') +
			parseFloat(style.borderTopWidth || '0') +
			parseFloat(style.borderBottomWidth || '0');
		return Math.ceil(contentElement.getBoundingClientRect().height + verticalBox);
	}

	function animateTo(targetHeight) {
		if (!element || !Number.isFinite(targetHeight) || targetHeight < 0) {
			return;
		}

		const nextHeight = Math.ceil(targetHeight);
		if (!previousHeight) {
			previousHeight = getElementHeight();
		}

		if (motionDisabled || Math.abs(previousHeight - nextHeight) < 1) {
			previousHeight = nextHeight;
			height = 'auto';
			return;
		}

		cancelAnimationFrame(animationFrame);
		height = `${previousHeight}px`;
		void element.offsetHeight;
		animationFrame = requestAnimationFrame(() => {
			height = `${nextHeight}px`;
			previousHeight = nextHeight;
		});
	}

	function handleTransitionEnd(event) {
		if (event.propertyName === 'height') {
			height = 'auto';
		}
	}

	$effect(() => {
		if (element && estimatedHeight !== null) {
			animateTo(estimatedHeight);
		}
	});

	$effect(() => {
		if (motionDisabled && element) {
			cancelAnimationFrame(animationFrame);
			height = 'auto';
		}
	});

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateReducedMotion = () => {
			prefersReducedMotion = mediaQuery.matches;
		};
		const observer = new ResizeObserver(() => {
			animateTo(getIntrinsicHeight());
		});

		updateReducedMotion();
		mediaQuery.addEventListener?.('change', updateReducedMotion);
		previousHeight = getElementHeight();
		observer.observe(contentElement);

		return () => {
			cancelAnimationFrame(animationFrame);
			mediaQuery.removeEventListener?.('change', updateReducedMotion);
			observer.disconnect();
		};
	});
</script>

	<div
	{...restProps}
	bind:this={element}
	class={`animated-height ${className}`}
	style={`height: ${height}; overflow: hidden; transition: ${transition};`}
	ontransitionend={handleTransitionEnd}
>
	<div bind:this={contentElement}>
		{@render children?.()}
	</div>
</div>
