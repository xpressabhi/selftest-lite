// Pure settle layer for the conversational planner's live previews.
//
// Previews arrive from two tiers (the local lexicon and the slim Jev call) and
// used to be applied immediately, which made the plan card flicker while the
// user typed. This module turns that stream into calm commits: a candidate
// value only reaches the card when it wins twice in a row, carries strong
// evidence, or the text direction makes it an explicit edit. See
// docs/superpowers/specs/2026-09-23-calm-morph-planner-design.md.

/** Jev field confidence at or above which a candidate commits on sight. */
export const STRONG_CONFIDENCE = 0.85;

/** Consecutive identical candidates needed before a weak challenger commits. */
export const WINS_REQUIRED = 2;

/** Quiet-time before HomePage re-runs the local preview to settle a challenger. */
export const SETTLE_TICK_MS = 400;

/** Plan fields the settler governs. */
export const SETTLE_FIELDS = [
	'topic',
	'testType',
	'difficulty',
	'numQuestions',
	'language',
	'examId',
];

/** @typedef {{ value: string|number, strong: boolean }} PreviewCandidate */
/** @typedef {{ value: string|number, lastText: string, challenger: { value: string|number, wins: number, source: string } | null }} SettleFieldState */

function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStrictPrefix(shorter, longer) {
	return (
		typeof shorter === 'string' &&
		typeof longer === 'string' &&
		shorter.length > 0 &&
		shorter.length < longer.length &&
		longer.startsWith(shorter)
	);
}

function normalizeCandidate(candidate, field) {
	if (!isPlainObject(candidate)) {
		return null;
	}
	const { value } = candidate;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed ? { value: trimmed, strong: Boolean(candidate.strong) } : null;
	}
	// Only the question count is numeric; numbers are malformed everywhere else.
	if (field === 'numQuestions' && typeof value === 'number' && Number.isFinite(value)) {
		return { value, strong: Boolean(candidate.strong) };
	}
	return null;
}

/** @returns {{ fields: Record<string, SettleFieldState> }} */
export function createSettleState() {
	return { fields: {} };
}

/** @returns {{ fields: Record<string, SettleFieldState> }} */
export function resetSettleState() {
	return createSettleState();
}

export function hasPendingChallenger(state) {
	if (!isPlainObject(state) || !isPlainObject(state.fields)) {
		return false;
	}
	return Object.values(state.fields).some((field) => Boolean(field?.challenger));
}

function commitField(fieldState, value, text) {
	return { ...fieldState, value, lastText: text, challenger: null };
}

/**
 * Folds one preview result into the settle state.
 *
 * @param {{ fields: Record<string, SettleFieldState> }} state
 * @param {{
 *   source?: 'local'|'jev',
 *   text?: string,
 *   candidates?: Record<string, PreviewCandidate>,
 *   explicit?: Record<string, boolean>,
 * }} input
 * @returns {{
 *   state: { fields: Record<string, SettleFieldState> },
 *   committed: Record<string, string|number>,
 *   changedFields: string[],
 *   held: Record<string, string|number>,
 *   status: 'settling'|'ready',
 * }}
 */
export function settlePreview(state, input = {}) {
	const base = isPlainObject(state) && isPlainObject(state.fields) ? state : createSettleState();
	const fields = { ...base.fields };
	const committed = {};
	const changedFields = [];
	const held = {};
	const source = input.source === 'jev' ? 'jev' : 'local';
	const text = typeof input.text === 'string' ? input.text : '';
	const candidates = isPlainObject(input.candidates) ? input.candidates : {};
	const explicit = isPlainObject(input.explicit) ? input.explicit : {};

	for (const field of SETTLE_FIELDS) {
		const current = fields[field] || { value: undefined, lastText: '', challenger: null };

		// 1. User-edited fields are never touched by previews.
		if (explicit[field]) {
			fields[field] = { ...current, challenger: null };
			continue;
		}

		const candidate = normalizeCandidate(candidates[field], field);

		// 2. Silence is not evidence: an absent candidate never clears a value.
		//    It only withdraws a challenger raised by the same tier.
		if (!candidate) {
			if (current.challenger && current.challenger.source === source) {
				fields[field] = { ...current, challenger: null };
			}
			continue;
		}

		// 3. Agreement refreshes the value and calms the field. Jev agreement is
		//    authoritative; the local tier cannot clear a Jev challenger.
		if (candidate.value === current.value) {
			const clearChallenger =
				source === 'jev' || !current.challenger || current.challenger.source === source;
			fields[field] = {
				...current,
				lastText: text,
				challenger: clearChallenger ? null : current.challenger,
			};
			continue;
		}

		// 4. Strong evidence commits on sight.
		if (candidate.strong) {
			fields[field] = commitField(current, candidate.value, text);
			committed[field] = candidate.value;
			changedFields.push(field);
			continue;
		}

		// 5. Topic direction rules: appending is the typing path, shrinking is
		//    the deleting path; a shrink while typing forward waits for wins.
		if (
			field === 'topic' &&
			typeof candidate.value === 'string' &&
			typeof current.value === 'string'
		) {
			const appendGrowth = candidate.value.startsWith(`${current.value} `);
			const deleting =
				text.length < current.lastText.length && current.lastText.startsWith(text);
			const shrinking = isStrictPrefix(candidate.value, current.value);
			if (appendGrowth || (deleting && shrinking)) {
				fields[field] = commitField(current, candidate.value, text);
				committed[field] = candidate.value;
				changedFields.push(field);
				continue;
			}
		}

		// 6. Otherwise the candidate is a challenger: two consecutive wins commit
		//    (across tiers — agreement counts as confirmation).
		const previous = current.challenger;
		if (previous && previous.value === candidate.value) {
			const wins = previous.wins + 1;
			if (wins >= WINS_REQUIRED) {
				fields[field] = commitField(current, candidate.value, text);
				committed[field] = candidate.value;
				changedFields.push(field);
			} else {
				fields[field] = {
					...current,
					lastText: text,
					challenger: { value: candidate.value, wins, source },
				};
			}
		} else {
			fields[field] = {
				...current,
				lastText: text,
				challenger: { value: candidate.value, wins: 1, source },
			};
		}
	}

	// Explicit fields are excluded from `held` by construction above.
	for (const field of SETTLE_FIELDS) {
		const fieldState = fields[field];
		if (fieldState?.challenger) {
			held[field] = fieldState.challenger.value;
		}
	}

	return {
		state: { fields },
		committed,
		changedFields,
		held,
		status: Object.keys(held).length > 0 ? 'settling' : 'ready',
	};
}

/** Maps a local Tier 0 reading (`buildLocalPreview`) to settle candidates. */
export function candidatesFromLocal(local) {
	if (!isPlainObject(local)) {
		return {};
	}
	const candidates = {};
	if (typeof local.topic === 'string' && local.topic.trim()) {
		// Lexicon topic spans are ranked guesses, never strong on their own.
		candidates.topic = { value: local.topic.trim(), strong: false };
	}
	if (typeof local.numQuestions === 'number' && Number.isFinite(local.numQuestions)) {
		candidates.numQuestions = { value: local.numQuestions, strong: true };
	}
	if (typeof local.examId === 'string' && local.examId) {
		candidates.examId = { value: local.examId, strong: true };
	}
	if (typeof local.difficulty === 'string' && local.difficulty) {
		candidates.difficulty = {
			value: local.difficulty,
			strong: !local.difficultyContradiction,
		};
	}
	if (typeof local.language === 'string' && local.language) {
		candidates.language = { value: local.language, strong: true };
	}
	if (typeof local.testType === 'string' && local.testType) {
		candidates.testType = { value: local.testType, strong: true };
	}
	return candidates;
}

/** Maps a Jev plan (+ field confidences) to settle candidates. */
export function candidatesFromPlan(plan, fieldConfidence) {
	if (!isPlainObject(plan)) {
		return {};
	}
	const confidence = isPlainObject(fieldConfidence) ? fieldConfidence : {};
	const candidates = {};
	const addString = (field) => {
		const value = plan[field];
		if (typeof value === 'string' && value.trim()) {
			candidates[field] = {
				value: value.trim(),
				strong: Number(confidence[field]) >= STRONG_CONFIDENCE,
			};
		}
	};
	for (const field of ['topic', 'testType', 'difficulty', 'language', 'examId']) {
		addString(field);
	}
	if (typeof plan.numQuestions === 'number' && Number.isFinite(plan.numQuestions)) {
		candidates.numQuestions = {
			value: plan.numQuestions,
			strong: Number(confidence.numQuestions) >= STRONG_CONFIDENCE,
		};
	}
	return candidates;
}
