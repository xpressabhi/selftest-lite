// Shared focus management for modal dialogs.
//
// Usage: add `tabindex="-1"` to the dialog element and
// `use:focusTrap={{ onEscape: closeDialog }}` on it. The action moves focus
// into the dialog, keeps Tab/Shift+Tab cycling inside it, calls `onEscape`
// for the Escape key, and restores focus to the previously active element
// when the dialog unmounts.

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(element) {
	return element.getClientRects().length > 0;
}

export function focusTrap(node, options = {}) {
	let { onEscape } = options;
	const previouslyFocused =
		typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;

	function focusableItems() {
		return [...node.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isVisible);
	}

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			if (typeof onEscape === 'function') {
				event.preventDefault();
				event.stopPropagation();
				onEscape();
			}
			return;
		}
		if (event.key !== 'Tab') {
			return;
		}
		const items = focusableItems();
		if (items.length === 0) {
			event.preventDefault();
			node.focus?.({ preventScroll: true });
			return;
		}
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || !node.contains(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || !node.contains(active))) {
			event.preventDefault();
			first.focus();
		}
	}

	if (typeof window !== 'undefined') {
		window.requestAnimationFrame(() => {
			const target = node.querySelector('[data-autofocus]') || focusableItems()[0] || node;
			target.focus?.({ preventScroll: true });
		});
	}

	node.addEventListener('keydown', handleKeydown);

	return {
		update(nextOptions = {}) {
			onEscape = nextOptions.onEscape;
		},
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
			if (previouslyFocused && previouslyFocused.isConnected) {
				previouslyFocused.focus({ preventScroll: true });
			}
		},
	};
}
