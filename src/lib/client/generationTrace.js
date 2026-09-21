// Pure derivation for the generation trace shown while a paper is generated.
//
// `/api/generate` streams `progress` events; the home page folds each one into
// a small state object. Mapping that state to the visible steps is kept pure so
// the sequence can be unit-tested without a browser.

export const TRACE_STEPS = ['reading', 'drafting', 'refining', 'assembling'];

/**
 * @param {{stage?: string, approved?: number, requested?: number, round?: number,
 *          batchIndex?: number, batchTotal?: number}|null} progress
 * @param {{done?: boolean}} [options]
 */
export function deriveGenerationTrace(progress, options = {}) {
	const done = options?.done === true;
	const stage = typeof progress?.stage === 'string' ? progress.stage : null;
	const approved = Math.max(0, Number(progress?.approved) || 0);
	const requested = Math.max(0, Number(progress?.requested) || 0);
	const complete = requested > 0 && approved >= requested;

	const batchTotal = Number(progress?.batchTotal) || 0;
	const batchIndex = Number(progress?.batchIndex) || 0;
	const batch =
		batchTotal > 1 && batchIndex > 0 ? { index: batchIndex, total: batchTotal } : null;

	const counts = { approved, requested };

	if (done) {
		return {
			steps: TRACE_STEPS.map((id) => ({ id, status: 'done' })),
			currentId: 'ready',
			phase: 'ready',
			counts,
			batch,
		};
	}

	let currentId = 'reading';
	if (complete) {
		currentId = 'assembling';
	} else if (stage && stage !== 'starting') {
		currentId = stage === 'salvaging' ? 'refining' : 'drafting';
	}

	const currentIndex = TRACE_STEPS.indexOf(currentId);
	const steps = TRACE_STEPS.map((id, index) => ({
		id,
		status: index < currentIndex ? 'done' : index === currentIndex ? 'running' : 'pending',
	}));

	return { steps, currentId, phase: 'working', counts, batch };
}
