import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	dismissToast,
	runToastAction,
	runToastDismiss,
	showToast,
	showToastWithAction,
	toast,
} from './toast.js';

describe('toast store', () => {
	it('publishes a toast with an incrementing id', () => {
		const firstId = showToast('Saved', 'success', 2000);
		expect(get(toast)).toEqual({
			id: firstId,
			message: 'Saved',
			type: 'success',
			durationMs: 2000,
		});
		const secondId = showToast('Saved again');
		expect(secondId).toBeGreaterThan(firstId);
		expect(get(toast).message).toBe('Saved again');
	});

	it('defaults the type and duration', () => {
		showToast('Heads up');
		expect(get(toast).type).toBe('info');
		expect(get(toast).durationMs).toBe(3000);
	});

	it('publishes an action toast with an undo affordance', () => {
		const onAction = vi.fn();
		const id = showToastWithAction('Test deleted', {
			type: 'success',
			actionLabel: 'Undo',
			onAction,
			durationMs: 4000,
		});
		expect(get(toast)).toMatchObject({ id, actionLabel: 'Undo', durationMs: 4000 });
		expect(runToastAction(get(toast))).toBe(true);
		expect(onAction).toHaveBeenCalledTimes(1);
	});

	it('drops non-function actions', () => {
		showToastWithAction('Deleted', { actionLabel: 'Undo', onAction: 'nope' });
		expect(get(toast).onAction).toBeNull();
		expect(runToastAction(get(toast))).toBe(false);
	});

	it('swallows action errors', () => {
		showToastWithAction('Deleted', {
			actionLabel: 'Undo',
			onAction: () => {
				throw new Error('undo failed');
			},
		});
		expect(() => runToastAction(get(toast))).not.toThrow();
	});

	it('only dismisses the toast that matches the id', () => {
		const id = showToast('First');
		dismissToast(id + 1);
		expect(get(toast)).not.toBeNull();
		dismissToast(id);
		expect(get(toast)).toBeNull();
	});

	it('dismisses without an id', () => {
		showToast('Any');
		dismissToast();
		expect(get(toast)).toBeNull();
	});

	it('runs the dismiss callback with its reason and swallows errors', () => {
		const onDismiss = vi.fn();
		showToastWithAction('Update', { onDismiss });
		expect(runToastDismiss(get(toast), 'timeout')).toBe(true);
		expect(onDismiss).toHaveBeenCalledWith('timeout');

		showToastWithAction('Update', {
			onDismiss: () => {
				throw new Error('dismiss failed');
			},
		});
		expect(() => runToastDismiss(get(toast), 'close')).not.toThrow();
		expect(runToastDismiss({ onDismiss: 'nope' }, 'close')).toBe(false);
		expect(runToastDismiss(null, 'close')).toBe(false);
	});
});
