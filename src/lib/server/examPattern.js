import { GoogleGenAI } from '@google/genai';
import * as z from 'zod';
import { env } from '$env/dynamic/private';
import { ensureStorageSchema, query } from './storage.js';
import { parseJsonResponse } from './jsonResponse.js';

const PATTERN_MODEL = 'gemini-flash-lite-latest';
const PATTERN_TIMEOUT_MS = 45000;
export const PATTERN_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_SECTIONS = 20;

/** Raw model answer for "what is the actual pattern of this paper". */
export const examPatternSchema = z.object({
	examName: z.string().min(1),
	board: z.string().nullable(),
	classLevel: z.string().nullable(),
	subject: z.string().nullable(),
	patternYear: z.string().min(1),
	durationMinutes: z.number().int().positive(),
	totalMarks: z.number().positive().nullable(),
	negativeMarking: z.number().min(0).nullable(),
	sections: z
		.array(
			z.object({
				name: z.string().min(1),
				questionTypes: z.array(z.string()).min(1),
				questionCount: z.number().int().positive(),
				marksPerQuestion: z.number().positive(),
				negativeMarks: z.number().min(0).nullable(),
				instructions: z.string().nullable(),
			})
		)
		.min(1)
		.max(MAX_SECTIONS),
	generalInstructions: z.array(z.string()).nullable(),
});

function slugify(value, fallback = 'section') {
	const slug = String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return slug || fallback;
}

function toIso(value) {
	if (!value) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Adds stable section ids and trims text so stored patterns are uniform no
 * matter which model revision produced them.
 */
export function normalizeExamPattern(pattern) {
	const parsed = examPatternSchema.parse(pattern);
	const seen = new Map();
	const sections = parsed.sections.map((section) => {
		const base = slugify(section.name);
		const count = (seen.get(base) || 0) + 1;
		seen.set(base, count);
		return {
			id: count === 1 ? base : `${base}-${count}`,
			name: section.name.trim(),
			questionTypes: [...new Set(section.questionTypes.map((type) => type.trim()).filter(Boolean))],
			questionCount: section.questionCount,
			marksPerQuestion: section.marksPerQuestion,
			negativeMarks: section.negativeMarks ?? null,
			instructions: section.instructions ? section.instructions.trim() : null,
		};
	});
	return {
		...parsed,
		examName: parsed.examName.trim(),
		board: parsed.board?.trim() || null,
		classLevel: parsed.classLevel?.trim() || null,
		subject: parsed.subject?.trim() || null,
		sections,
		generalInstructions: (parsed.generalInstructions || [])
			.map((line) => line.trim())
			.filter(Boolean),
	};
}

/** Stable cache key for the different ways a paper can be identified. */
export function patternKeyFor({ examId = null, board = null, classLevel = null, subject = null, paperName = null } = {}) {
	if (examId) {
		return `exam:${slugify(examId)}`;
	}
	if (paperName) {
		return `paper:${slugify(paperName)}`;
	}
	if (board && classLevel && subject) {
		return `board:${slugify(board)}:${slugify(classLevel)}:${slugify(subject)}`;
	}
	return null;
}

export function isPatternExpired(expiresAt, now = new Date()) {
	const iso = toIso(expiresAt);
	if (!iso) {
		return true;
	}
	return new Date(iso).getTime() <= now.getTime();
}

function patternSource({ examId = null, paperName = null } = {}) {
	if (examId) {
		return 'exam';
	}
	if (paperName) {
		return 'paper';
	}
	return 'board';
}

/**
 * Assigns the pattern's sections to a generated flat question list. Ranges
 * are sequential (the batch plan generates section by section); the last
 * section absorbs any extra questions, empty sections are dropped.
 */
export function assignSectionsToPaper(questions = [], pattern = null, { section = null, now = new Date() } = {}) {
	const normalizedQuestions = Array.isArray(questions) ? questions : [];
	if (normalizedQuestions.length === 0 || (!pattern && !section)) {
		return { questions: normalizedQuestions, sections: [], examMeta: null };
	}

	const sourceSections = section
		? [{ ...section, questionCount: normalizedQuestions.length }]
		: (pattern?.sections || []).map((entry) => ({ ...entry }));
	const sections = [];
	let index = 0;
	for (const entry of sourceSections) {
		const count = Math.max(0, Math.min(Number(entry.questionCount) || 0, normalizedQuestions.length - index));
		if (count <= 0) {
			continue;
		}
		sections.push({
			id: entry.id,
			name: entry.name,
			questionTypes: entry.questionTypes,
			marksPerQuestion: entry.marksPerQuestion,
			negativeMarks: entry.negativeMarks ?? null,
			instructions: entry.instructions ?? null,
			questionCount: count,
			questionIndexes: Array.from({ length: count }, (_, offset) => index + offset),
		});
		index += count;
	}
	if (sections.length > 0 && index < normalizedQuestions.length) {
		const lastSection = sections[sections.length - 1];
		const extras = Array.from(
			{ length: normalizedQuestions.length - index },
			(_, offset) => index + offset
		);
		lastSection.questionIndexes = [...lastSection.questionIndexes, ...extras];
		lastSection.questionCount = lastSection.questionIndexes.length;
	}

	const examMeta = {
		examName: pattern?.examName || section?.name || null,
		board: pattern?.board || null,
		classLevel: pattern?.classLevel || null,
		durationMinutes: pattern?.durationMinutes || null,
		totalMarks: pattern?.totalMarks || null,
		negativeMarking: pattern?.negativeMarking ?? null,
		patternYear: pattern?.patternYear || null,
		patternCheckedAt: toIso(now),
		sectionOnly: Boolean(section),
	};

	return { questions: normalizedQuestions, sections, examMeta };
}

/**
 * Prompt constraint block that turns a discovered pattern into authoritative
 * generation instructions. A focused section narrows generation to that
 * section's real format only.
 */
export function buildPatternConstraint(pattern, section = null) {
	if (!pattern) {
		return null;
	}
	const lines = [
		`EXAM PATTERN (authoritative, modelled for ${pattern.patternYear}): ${pattern.examName}`,
		`Full paper duration: ${pattern.durationMinutes} minutes${
			pattern.totalMarks ? `, total marks: ${pattern.totalMarks}` : ''
		}${pattern.negativeMarking ? `, negative marking: ${pattern.negativeMarking}` : ''}.`,
	];
	if (section) {
		lines.push(
			`Generate ONLY the "${section.name}" section: ${section.questionCount} questions, format ${section.questionTypes.join(
				'/'
			)}, ${section.marksPerQuestion} marks each${
				section.negativeMarks ? `, ${section.negativeMarks} negative` : ''
			}.`
		);
	} else {
		lines.push(
			`Distribute the questions across these sections in this exact order: ${pattern.sections
				.map(
					(entry) =>
						`${entry.name} (${entry.questionTypes.join('/')}, ${entry.questionCount} questions, ${entry.marksPerQuestion} marks each)`
				)
				.join('; ')}.`
		);
	}
	const instructionLines = [
		...(section?.instructions ? [section.instructions] : []),
		...pattern.sections
			.filter((entry) => !section || entry.id === section.id)
			.map((entry) => entry.instructions)
			.filter(Boolean),
		...(pattern.generalInstructions || []),
	];
	if (instructionLines.length > 0) {
		lines.push(`Follow these paper instructions: ${instructionLines.join(' ')}`);
	}
	lines.push(
		'These constraints override generic difficulty or length preferences; do not add sections that are not listed.'
	);
	return lines.join('\n');
}

/** The generic research prompt: the model must state the real current format. */
export function buildPatternResearchPrompt(target, { language = 'english' } = {}) {
	const label = [
		target.paperName || target.examName || null,
		target.board ? `${target.board} board` : null,
		target.classLevel ? `class ${target.classLevel}` : null,
		target.subject || null,
	]
		.filter(Boolean)
		.join(', ');
	if (!label) {
		// Fail closed: without a name the model would invent an exam and the
		// hallucinated pattern would be cached under a real key.
		throw new Error('Pattern target needs an exam name, paper name, or board details');
	}
	return `You are an exam pattern researcher. Using your most recent verified knowledge of the official current pattern for: ${label}.

Determine the ACTUAL current structure of this paper and return it as JSON:
- The sections (or subjects) in the order they appear, with the real number of questions, the question format used (for example multiple-choice, matching, assertion-reasoning), the marks per question, any negative marking, and the instructions printed for that section.
- The full duration, total marks, and the year/session you are modelling (for example "2026" or "2025-26").
- Use the most recent official pattern you know. If the pattern changed recently, model the latest version. Do not invent a generic paper; follow the real exam.
- Section names must be written in ${language === 'hindi' ? 'Hindi' : 'English'}.
- If this is a school/board paper, use the current syllabus structure for that board, class and subject.

Return ONLY the JSON object matching the schema.`;
}

async function requestPatternText(ai, prompt, deadlineMs) {
	const remainingMs = deadlineMs - Date.now();
	if (remainingMs <= 0) {
		throw new Error('Pattern discovery timed out');
	}
	let timeoutHandle;
	try {
		const response = await Promise.race([
			ai.models.generateContent({
				model: PATTERN_MODEL,
				contents: prompt,
				config: {
					responseMimeType: 'application/json',
					responseJsonSchema: z.toJSONSchema(examPatternSchema),
				},
			}),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new Error('Pattern discovery timed out'));
				}, remainingMs);
			}),
		]);
		return response.text;
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

/** One model call that returns a normalized, validated pattern. */
export async function discoverExamPattern(target, { language = 'english' } = {}) {
	const apiKey = env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('Gemini API key is not configured');
	}
	const ai = new GoogleGenAI({ apiKey });
	const prompt = buildPatternResearchPrompt(target, { language });
	const deadlineMs = Date.now() + PATTERN_TIMEOUT_MS;
	let lastError = null;
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		try {
			const text = await requestPatternText(ai, prompt, deadlineMs);
			return normalizeExamPattern(parseJsonResponse(text));
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError || new Error('Pattern discovery failed');
}

async function readPatternRow(patternKey) {
	await ensureStorageSchema();
	const result = await query(
		`SELECT pattern_key, source, payload, model, fetched_at, expires_at
		 FROM exam_patterns
		 WHERE pattern_key = $1`,
		[patternKey]
	);
	return result.rows[0] || null;
}

async function saveExamPattern({ patternKey, source, payload, model }) {
	await ensureStorageSchema();
	await query(
		`INSERT INTO exam_patterns (pattern_key, source, payload, model, fetched_at, expires_at)
		 VALUES ($1, $2, $3, $4, NOW(), NOW() + ($5::text || ' milliseconds')::interval)
		 ON CONFLICT (pattern_key) DO UPDATE
		   SET payload = EXCLUDED.payload,
		       model = EXCLUDED.model,
		       source = EXCLUDED.source,
		       fetched_at = NOW(),
		       expires_at = EXCLUDED.expires_at`,
		[patternKey, source, JSON.stringify(payload), model, PATTERN_TTL_MS]
	);
}

const inFlightPatterns = new Map();

async function refreshPattern(patternKey, target, language) {
	if (inFlightPatterns.has(patternKey)) {
		return inFlightPatterns.get(patternKey);
	}
	const promise = (async () => {
		const payload = await discoverExamPattern(target, { language });
		await saveExamPattern({
			patternKey,
			source: patternSource(target),
			payload,
			model: PATTERN_MODEL,
		});
		const row = await readPatternRow(patternKey);
		return {
			...payload,
			fetchedAt: toIso(row?.fetched_at) || new Date().toISOString(),
			source: row?.source || patternSource(target),
			stale: false,
		};
	})().finally(() => {
		inFlightPatterns.delete(patternKey);
	});
	inFlightPatterns.set(patternKey, promise);
	return promise;
}

/**
 * Resolves the pattern for a target. Fresh cache wins; a stale entry is served
 * immediately while a background refresh runs; a miss discovers synchronously.
 * With `discover: false` a miss returns null and stale entries still refresh in
 * the background, which is what the standard exam flow uses.
 */
export async function getExamPattern(
	target,
	{ language = 'english', refresh = false, discover = true } = {}
) {
	const patternKey = patternKeyFor(target);
	if (!patternKey) {
		return null;
	}
	let row;
	try {
		row = await readPatternRow(patternKey);
	} catch (error) {
		if (!discover) {
			return null;
		}
		throw error;
	}

	if (row && !refresh) {
		const stale = isPatternExpired(row.expires_at);
		if (stale) {
			// Refresh after responding; a stale pattern still beats none.
			void refreshPattern(patternKey, target, language).catch((error) => {
				console.error('Background pattern refresh failed:', error);
			});
		}
		return {
			...row.payload,
			fetchedAt: toIso(row.fetched_at),
			source: row.source,
			stale,
		};
	}

	if (row && refresh) {
		return refreshPattern(patternKey, target, language);
	}

	if (!discover) {
		return null;
	}
	return refreshPattern(patternKey, target, language);
}
