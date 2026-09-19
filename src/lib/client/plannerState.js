// Pure planner state machine for the conversational home flow.
//
// The module owns the conversation draft (messages, plan, locks, clarification
// history) and its serialization. It performs no I/O except the draft
// persistence helpers, which delegate to storage.js and are no-ops during SSR.

import { readJson, removeKey, writeJson } from './storage';
import { STORAGE_KEYS } from './constants';

export const PLANNER_DRAFT_VERSION = 1;
export const MAX_STORED_MESSAGES = 40;
export const MAX_MODEL_MESSAGES = 8;
export const MAX_MODEL_MESSAGE_CHARS = 300;

let messageCounter = 0;

function nextMessageId() {
	messageCounter += 1;
	return `m${Date.now().toString(36)}${messageCounter.toString(36)}`;
}

export function createPlannerDraft() {
	return {
		version: PLANNER_DRAFT_VERSION,
		messages: [],
		plan: null,
		explicit: {},
		answers: {},
		askedFields: [],
		skippedFields: [],
		round: 0,
		pendingClarify: null,
	};
}

// ---------------------------------------------------------------------------
// Sanitizing and persistence
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set(['user', 'assistant', 'system']);

function sanitizeMessage(message) {
	if (!message || typeof message !== 'object' || !VALID_ROLES.has(message.role)) {
		return null;
	}
	const text = typeof message.text === 'string' ? message.text.slice(0, 1000) : '';
	const modelText =
		typeof message.modelText === 'string' ? message.modelText.slice(0, 1000) : text;
	return {
		id: typeof message.id === 'string' && message.id ? message.id : nextMessageId(),
		role: message.role,
		text,
		modelText,
		messageKey: typeof message.messageKey === 'string' ? message.messageKey : null,
		messageParams:
			message.messageParams && typeof message.messageParams === 'object'
				? message.messageParams
				: {},
		field: typeof message.field === 'string' ? message.field : null,
		value:
			typeof message.value === 'string' || typeof message.value === 'number'
				? message.value
				: null,
	};
}

function sanitizeStringArray(value, max = 20) {
	return Array.isArray(value)
		? value.filter((item) => typeof item === 'string').slice(0, max)
		: [];
}

function sanitizeRecord(value, max = 40) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const result = {};
	for (const [key, entry] of Object.entries(value).slice(0, max)) {
		if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
			result[key] = entry;
		}
	}
	return result;
}

function sanitizeClarify(clarify) {
	if (!clarify || typeof clarify !== 'object' || typeof clarify.id !== 'string') {
		return null;
	}
	const options = Array.isArray(clarify.options)
		? clarify.options
				.filter((option) => option && typeof option.value === 'string')
				.slice(0, 6)
				.map((option) => ({
					value: option.value,
					label: typeof option.label === 'string' ? option.label : option.value,
					labelKey: typeof option.labelKey === 'string' ? option.labelKey : null,
				}))
		: [];
	return {
		id: clarify.id,
		promptKey:
			typeof clarify.promptKey === 'string' ? clarify.promptKey : 'plannerClarifyTopic',
		params: clarify.params && typeof clarify.params === 'object' ? clarify.params : {},
		options,
		allowSkip: clarify.allowSkip !== false,
	};
}

/** Coerces persisted or partially-built drafts into a safe shape. */
export function sanitizePlannerDraft(value) {
	if (!value || typeof value !== 'object') {
		return createPlannerDraft();
	}
	return {
		version: PLANNER_DRAFT_VERSION,
		messages: (Array.isArray(value.messages) ? value.messages : [])
			.map(sanitizeMessage)
			.filter(Boolean)
			.slice(-MAX_STORED_MESSAGES),
		plan: value.plan && typeof value.plan === 'object' ? value.plan : null,
		explicit: sanitizeRecord(value.explicit),
		answers: sanitizeRecord(value.answers),
		askedFields: sanitizeStringArray(value.askedFields),
		skippedFields: sanitizeStringArray(value.skippedFields),
		round: Number.isInteger(value.round) && value.round >= 0 ? Math.min(value.round, 10) : 0,
		pendingClarify: sanitizeClarify(value.pendingClarify),
	};
}

export function readPlannerDraft() {
	return sanitizePlannerDraft(readJson(STORAGE_KEYS.PLANNER_DRAFT, null));
}

export function writePlannerDraft(draft) {
	writeJson(STORAGE_KEYS.PLANNER_DRAFT, sanitizePlannerDraft(draft));
}

export function clearPlannerDraft() {
	removeKey(STORAGE_KEYS.PLANNER_DRAFT);
}

export function hasDraftContent(draft) {
	return Boolean(draft && (draft.messages.length > 0 || draft.plan || draft.pendingClarify));
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export function appendMessage(draft, message) {
	const next = sanitizePlannerDraft(draft);
	const sanitized = sanitizeMessage(message);
	if (sanitized) {
		next.messages = [...next.messages, sanitized].slice(-MAX_STORED_MESSAGES);
	}
	return next;
}

/** Adds the user's message and clears any pending question. */
export function beginTurn(draft, text) {
	const next = sanitizePlannerDraft(draft);
	next.pendingClarify = null;
	return appendMessage(next, { role: 'user', text: String(text || '').trim() });
}

/** Applies a successful `/api/parse-intent` response. */
export function applyTurnResult(draft, response) {
	const next = sanitizePlannerDraft(draft);
	if (response?.plan && typeof response.plan === 'object') {
		next.plan = response.plan;
	}
	next.pendingClarify = sanitizeClarify(response?.clarify);

	const messageKey = typeof response?.messageKey === 'string' ? response.messageKey : null;
	if (messageKey && messageKey !== 'plannerNeedOneThing') {
		next.messages = [
			...next.messages,
			{
				id: nextMessageId(),
				role: 'assistant',
				text: '',
				modelText: buildModelText(messageKey, response?.messageParams, response?.plan),
				messageKey,
				messageParams:
					response?.messageParams && typeof response.messageParams === 'object'
						? response.messageParams
						: {},
			},
		].slice(-MAX_STORED_MESSAGES);
	}

	if (next.pendingClarify) {
		const field = next.pendingClarify.id;
		if (!next.askedFields.includes(field)) {
			next.askedFields = [...next.askedFields, field];
		}
		next.round = Math.min(next.round + 1, 10);
	}

	return next;
}

/** Applies a failed turn: keeps the messages, records the failure line. */
export function applyTurnFailure(draft, messageKey = 'plannerParseFailed') {
	const next = sanitizePlannerDraft(draft);
	next.pendingClarify = null;
	const key = typeof messageKey === 'string' && messageKey ? messageKey : 'plannerParseFailed';
	return appendMessage(next, {
		role: 'assistant',
		text: '',
		modelText:
			key === 'plannerParseFailed'
				? 'Could not understand that message; the user can edit the plan manually.'
				: 'The planner could not finish that turn; the user should retry shortly.',
		messageKey: key,
	});
}

/** Records a clarification answer as authoritative for its field. */
export function beginClarifyAnswer(draft, option) {
	const next = sanitizePlannerDraft(draft);
	const clarify = next.pendingClarify;
	if (!clarify || !option || typeof option.value !== 'string') {
		return next;
	}
	next.answers = { ...next.answers, [clarify.id]: option.value };
	const label =
		typeof option.label === 'string' && option.label ? option.label : String(option.value);
	next.pendingClarify = null;
	return appendMessage(next, {
		role: 'user',
		text: label,
		modelText: `Answer to "${canonicalPromptText(clarify.id)}": ${label}`,
		field: clarify.id,
		value: option.value,
	});
}

/** Skips the pending question; the field stays on defaults forever. */
export function skipClarify(draft) {
	const next = sanitizePlannerDraft(draft);
	const clarify = next.pendingClarify;
	if (!clarify) {
		return next;
	}
	if (!next.skippedFields.includes(clarify.id)) {
		next.skippedFields = [...next.skippedFields, clarify.id];
	}
	next.pendingClarify = null;
	return appendMessage(next, {
		role: 'assistant',
		text: '',
		modelText: `User skipped the ${clarify.id} question; use defaults.`,
		messageKey: 'plannerSkipAck',
		field: null,
	});
}

/** Marks a plan field as user-edited and records the new plan snapshot. */
export function markPlanEdited(draft, plan, field) {
	const next = sanitizePlannerDraft(draft);
	if (field) {
		next.explicit = { ...next.explicit, [field]: true };
	}
	if (plan && typeof plan === 'object') {
		next.plan = plan;
	}
	next.pendingClarify = null;

	const last = next.messages.at(-1);
	if (last && last.role === 'system' && last.messageKey === 'plannerPlanEdited') {
		// Consecutive chip edits collapse into one line instead of stacking.
		next.messages = [
			...next.messages.slice(0, -1),
			{ ...last, field: field || last.field || null, modelText: 'User edited the plan.' },
		];
		return next;
	}

	return appendMessage(next, {
		role: 'system',
		text: '',
		modelText: field ? `User edited ${field}.` : 'User edited the plan.',
		messageKey: 'plannerPlanEdited',
		field: field || null,
	});
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

/** Last few messages as plain text for the model's state. */
export function recentMessagesForModel(draft) {
	return sanitizePlannerDraft(draft)
		.messages.filter((message) => message.role !== 'system')
		.slice(-MAX_MODEL_MESSAGES)
		.map((message) => ({
			role: message.role,
			text: String(message.modelText || message.text || '').slice(0, MAX_MODEL_MESSAGE_CHARS),
		}))
		.filter((message) => message.text.length > 0);
}

/** Payload for POST /api/parse-intent. */
export function buildTurnRequest(draft, text) {
	const safe = sanitizePlannerDraft(draft);
	return {
		intent: String(text || '')
			.trim()
			.slice(0, 500),
		plan: safe.plan,
		explicit: safe.explicit,
		answers: safe.answers,
		askedFields: safe.askedFields,
		skippedFields: safe.skippedFields,
		round: safe.round,
		recentMessages: recentMessagesForModel(safe),
	};
}

// ---------------------------------------------------------------------------
// Model-facing text (canonical English, never user-visible)
// ---------------------------------------------------------------------------

function canonicalPromptText(field) {
	if (field === 'examId' || field === 'exam') {
		return 'Which exam is the user preparing for?';
	}
	if (field === 'difficulty') {
		return 'How difficult should the test be?';
	}
	return 'What subject should the test cover?';
}

export function buildModelText(messageKey, messageParams = {}, plan = null) {
	const topic = messageParams?.topic || plan?.topic || '';
	const count = messageParams?.numQuestions || plan?.numQuestions || '';
	if (messageKey === 'plannerPlanReady') {
		return `Plan ready: ${topic}${count ? `, ${count} questions` : ''}.`;
	}
	if (messageKey === 'plannerPlanUpdated') {
		return `Plan updated: ${topic}${count ? `, ${count} questions` : ''}.`;
	}
	if (messageKey === 'plannerParseFailed') {
		return 'Could not parse that message.';
	}
	if (messageKey === 'plannerSkipAck') {
		return 'Question skipped; defaults apply.';
	}
	if (messageKey === 'plannerPlanEdited') {
		return 'Plan edited by the user.';
	}
	return String(messageKey || '');
}
