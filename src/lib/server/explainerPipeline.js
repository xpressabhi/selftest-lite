import { GoogleGenAI } from '@google/genai';
import * as z from 'zod';
import { API_TIMEOUT_ERROR_CODE } from '../shared/apiLimitError.js';
import { composeArtifactDocument } from './artifactScaffold.js';
import { validateArtifactPayload } from './artifactValidation.js';
import { parseJsonResponse } from './jsonResponse.js';
import { generateArtifactPrompt, generateConceptBriefPrompt } from './prompt.js';
import { artifactPayloadSchema, conceptBriefSchema } from './quizSchema.js';
import {
	ARTIFACT_BRIEF_MODEL,
	ARTIFACT_DEADLINE_MS,
	ARTIFACT_MODEL,
	ARTIFACT_OPENCODE_MODEL,
	MAX_ARTIFACT_BRIEF_OUTPUT_TOKENS,
	MAX_ARTIFACT_DOCUMENT_BYTES,
	MAX_ARTIFACT_OUTPUT_TOKENS,
	OPENCODE_INFERENCE_BASE_URL,
} from './quizConfig.js';
import { backoffBeforeRetry, isTransientProviderError } from './transientErrors.js';

// The two-call concept-explainer pipeline. This module must stay node-safe
// (no $app/env, no storage) so scripts/eval-artifact.mjs can drive the exact
// production code path with a process-level API key. The wire is pluggable:
// `gemini` uses the @google/genai SDK with a response schema; `opencode`
// talks to the OpenAI-compatible inference gateway and relies on the prompt's
// JSON shape, the parser, and validation/repair for the same guarantees.

export class ExplainerTimeoutError extends Error {
	constructor() {
		super('Explainer timed out after 90 seconds. Please retry.');
		this.name = 'ExplainerTimeoutError';
		this.code = API_TIMEOUT_ERROR_CODE;
	}
}

export class ArtifactInvalidError extends Error {
	constructor(issues) {
		super('The generated explainer did not pass validation.');
		this.name = 'ArtifactInvalidError';
		this.code = 'ARTIFACT_INVALID';
		this.issues = issues;
		this.generationFailure = { stage: 'validation', issues };
	}
}

function stageFailure(stage, cause, issues = []) {
	const error = new Error(cause?.message || `Explainer ${stage} stage failed`);
	error.name = 'ExplainerStageError';
	error.generationFailure = { stage, issues };
	if (cause) {
		error.cause = cause;
	}
	return error;
}

async function withDeadline(promiseFactory, deadline) {
	const remainingMs = deadline - Date.now();
	if (remainingMs <= 0) {
		throw new ExplainerTimeoutError();
	}
	let timeoutHandle;
	try {
		return await Promise.race([
			promiseFactory(),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new ExplainerTimeoutError());
				}, remainingMs);
			}),
		]);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

async function requestGeminiJson({ ai, model, prompt, schema, maxOutputTokens, deadline }) {
	return withDeadline(
		() =>
			ai.models
				.generateContent({
					model,
					contents: prompt,
					config: {
						responseMimeType: 'application/json',
						responseJsonSchema: z.toJSONSchema(schema),
						maxOutputTokens,
					},
				})
				.then((response) => response.text),
		deadline
	);
}

async function requestOpenAiCompatJson({
	apiKey,
	baseUrl,
	model,
	prompt,
	maxOutputTokens,
	deadline,
}) {
	const remainingMs = deadline - Date.now();
	if (remainingMs <= 0) {
		throw new ExplainerTimeoutError();
	}
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => controller.abort(), remainingMs);
	try {
		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				max_tokens: maxOutputTokens,
				response_format: { type: 'json_object' },
			}),
			signal: controller.signal,
		});
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			const error = new Error(
				`Inference provider returned ${response.status}: ${body.slice(0, 300)}`
			);
			// A bare status makes the transient-retry classifier work on 429/5xx.
			error.status = response.status;
			throw error;
		}
		const payload = await response.json();
		return payload?.choices?.[0]?.message?.content ?? '';
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw new ExplainerTimeoutError();
		}
		throw error;
	} finally {
		clearTimeout(timeoutHandle);
	}
}

/** Validation plus the composed-document size check the fragment cannot see. */
function artifactIssues(payload, brief, language) {
	const { issues } = validateArtifactPayload(payload);
	const composed = composeArtifactDocument({ brief, payload, language, theme: 'light' });
	if (Buffer.byteLength(composed, 'utf8') > MAX_ARTIFACT_DOCUMENT_BYTES) {
		issues.push({
			code: 'size',
			detail: `composed document exceeds ${MAX_ARTIFACT_DOCUMENT_BYTES} bytes`,
		});
	}
	return issues;
}

async function generateBrief({
	requestJson,
	model,
	topic,
	question,
	answer,
	language,
	deadline,
}) {
	const prompt = generateConceptBriefPrompt({ topic, question, answer, language });
	let lastError = null;
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		try {
			const text = await requestJson({
				model,
				prompt,
				schema: conceptBriefSchema,
				maxOutputTokens: MAX_ARTIFACT_BRIEF_OUTPUT_TOKENS,
				deadline,
			});
			const validated = conceptBriefSchema.safeParse(parseJsonResponse(text));
			if (validated.success) {
				return validated.data;
			}
			lastError = new Error('Invalid brief response from model');
		} catch (error) {
			lastError = error;
			if (error instanceof ExplainerTimeoutError) {
				throw error;
			}
			if (
				attempt >= 2 ||
				!isTransientProviderError(error) ||
				!(await backoffBeforeRetry(attempt, { deadlineMs: deadline }))
			) {
				break;
			}
		}
	}
	throw stageFailure('brief', lastError);
}

async function generateArtifactBody({ requestJson, model, brief, language, deadline }) {
	const prompt = generateArtifactPrompt({ brief, language });
	let payload = null;
	let lastError = null;

	// One retry for transient provider errors or unparseable JSON.
	for (let attempt = 1; attempt <= 2 && !payload; attempt += 1) {
		try {
			const text = await requestJson({
				model,
				prompt,
				schema: artifactPayloadSchema,
				maxOutputTokens: MAX_ARTIFACT_OUTPUT_TOKENS,
				deadline,
			});
			const validated = artifactPayloadSchema.safeParse(parseJsonResponse(text));
			if (validated.success) {
				payload = validated.data;
				break;
			}
			lastError = new Error('Invalid artifact response from model');
		} catch (error) {
			lastError = error;
			if (error instanceof ExplainerTimeoutError) {
				throw error;
			}
			if (
				attempt >= 2 ||
				!isTransientProviderError(error) ||
				!(await backoffBeforeRetry(attempt, { deadlineMs: deadline }))
			) {
				break;
			}
		}
	}

	if (!payload) {
		throw stageFailure('artifact', lastError);
	}

	const issues = artifactIssues(payload, brief, language);
	if (issues.length === 0) {
		return payload;
	}

	// A payload that parses but breaks the contract gets exactly one repair
	// call carrying the validator's issue list.
	let repaired = null;
	try {
		const text = await requestJson({
			model,
			prompt: generateArtifactPrompt({ brief, language, repairIssues: issues }),
			schema: artifactPayloadSchema,
			maxOutputTokens: MAX_ARTIFACT_OUTPUT_TOKENS,
			deadline,
		});
		const validated = artifactPayloadSchema.safeParse(parseJsonResponse(text));
		if (validated.success) {
			repaired = validated.data;
		}
	} catch (error) {
		if (error instanceof ExplainerTimeoutError) {
			throw error;
		}
		// Fall through to the invalid-artifact error below.
	}

	if (!repaired) {
		throw new ArtifactInvalidError(issues);
	}
	const repairedIssues = artifactIssues(repaired, brief, language);
	if (repairedIssues.length > 0) {
		throw new ArtifactInvalidError(repairedIssues);
	}
	return repaired;
}

/**
 * Runs the production pipeline and returns `{ brief, payload, model, provider }`.
 * Throws `ExplainerTimeoutError`, `ArtifactInvalidError`, or a stage error
 * carrying `generationFailure`.
 */
export async function generateExplainerArtifact({
	topic,
	question,
	answer,
	language,
	apiKey,
	provider = 'gemini',
	baseUrl = OPENCODE_INFERENCE_BASE_URL,
	deadlineMs,
	artifactModel,
	briefModel,
}) {
	if (!apiKey) {
		throw new Error('Inference API key is not configured');
	}
	const deadline = deadlineMs ?? Date.now() + ARTIFACT_DEADLINE_MS;

	if (provider === 'opencode') {
		const model = artifactModel ?? ARTIFACT_OPENCODE_MODEL;
		const requestJson = (args) => requestOpenAiCompatJson({ apiKey, baseUrl, ...args });
		const brief = await generateBrief({
			requestJson,
			model: briefModel ?? model,
			topic,
			question,
			answer,
			language,
			deadline,
		});
		const payload = await generateArtifactBody({
			requestJson,
			model,
			brief,
			language,
			deadline,
		});
		return { brief, payload, model, provider };
	}

	const ai = new GoogleGenAI({ apiKey });
	const model = artifactModel ?? ARTIFACT_MODEL;
	const requestJson = (args) => requestGeminiJson({ ai, ...args });
	const brief = await generateBrief({
		requestJson,
		model: briefModel ?? ARTIFACT_BRIEF_MODEL,
		topic,
		question,
		answer,
		language,
		deadline,
	});
	const payload = await generateArtifactBody({
		requestJson,
		model,
		brief,
		language,
		deadline,
	});
	return { brief, payload, model, provider };
}
