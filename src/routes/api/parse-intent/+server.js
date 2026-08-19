import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { rateLimiter } from '$lib/server/rateLimiter';
import { getClientKey, getStateForIdentity, logApiEvent } from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { PROFILE_STATE_KEY, parseProfileStateValue } from '$lib/shared/userProfile';
import { buildStudentContext } from '$lib/server/profile';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '$lib/shared/apiLimitError';
import * as z from 'zod';

const MODEL_NAME = 'gemini-flash-lite-latest';
const PARSE_TIMEOUT_MS = 15000;

const parseIntentSchema = z.object({
	intent: z.string().min(2).max(500),
});

const responseSchema = z.object({
	topic: z.string(),
	testType: z.enum(['multiple-choice', 'true-false', 'coding', 'speed-challenge']),
	difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
	numQuestions: z.number().int().min(5).max(50),
	examId: z.string().nullable(),
	isFullExam: z.boolean(),
	language: z.enum(['english', 'hindi']),
	confidence: z.enum(['high', 'medium', 'low']),
});

const PARSE_PROMPT = `You are a smart test configuration parser. Given a user's natural language intent, extract structured parameters for generating a quiz or exam paper.

The platform supports:
- Any topic: school subjects, competitive exams, coding, languages, professional skills, hobbies, trivia, anything
- Test types: multiple-choice, true-false, coding, speed-challenge
- Difficulty: beginner, intermediate, advanced, expert
- Languages: english, hindi
- Question count: 5-50
- Indian exam papers (set isFullExam=true and examId) or general quizzes (isFullExam=false)

Rules:
- If the intent mentions a specific Indian exam (SSC, NEET, JEE, UPSC, Banking, Railways, etc.) or sounds like exam prep, treat it as a full exam
- If the intent is a general topic, coding, interview prep, language learning, or hobby, treat it as a quiz
- For "easy / simple / basic / for kids / introduction" → beginner difficulty
- For "hard / tough / difficult / advanced / expert" → advanced or expert
- For no difficulty hint → intermediate
- For "quick / fast / rapid / speed" → speed-challenge test type
- For "coding / programming / code" → coding test type  
- For "true false / binary / yes no" → true-false test type
- Default test type is multiple-choice
- Default question count: 10 for quizzes, 20 for exams
- If the user mentions a number like "5 questions" or "20 Qs", use that number
- For Hindi requests (Hindi words, Devanagari script, "Hindi mein") → language: hindi
- For examId: try to match common Indian exam abbreviations (upsc, ssc-cgl, ssc-chsl, neet, jee-main, jee-advanced, cat, gate, ibps-po, ibps-clerk, sbi-po, sbi-clerk, rrb-ntpc, rrb-group-d, nda, cds, uppsc, bpsc, mppsc, rpsc, etc.)
- Confidence: high if the intent is clear and specific, medium if somewhat vague, low if very ambiguous

Return ONLY a JSON object. No other text. The JSON must match:
{
  "topic": "clear topic description",
  "testType": "multiple-choice",
  "difficulty": "intermediate",
  "numQuestions": 10,
  "examId": null,
  "isFullExam": false,
  "language": "english",
  "confidence": "high"
}`;

function parseGeneratedJson(text) {
	const trimmedText = text.trim();
	const fencedJson = trimmedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
	return JSON.parse(fencedJson ? fencedJson[1] : trimmedText);
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		let body;
		try {
			body = await request.json();
		} catch {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}

		const parsed = parseIntentSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					error: 'Intent must be a string between 2 and 500 characters',
					code: 'INVALID_INTENT',
				},
				{ status: 400 }
			);
		}

		const { intent } = parsed.data;

		const rateLimit = await rateLimiter(request, { bucket: '/api/parse-intent' });
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					remaining: rateLimit.remaining,
				},
				{ status: 429 }
			);
		}

		const apiKey = env.GEMINI_API_KEY;
		if (!apiKey) {
			return json({ error: 'Gemini API key is not configured' }, { status: 500 });
		}

		const ai = new GoogleGenAI({ apiKey });

		let studentContext = null;
		if (user?.id || clientId) {
			try {
				const storage = await getStateForIdentity({ userId: user?.id, clientId });
				const profile = parseProfileStateValue(storage?.[PROFILE_STATE_KEY]);
				studentContext = buildStudentContext(profile);
			} catch (profileError) {
				console.error('Failed to load student context:', profileError);
			}
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

			const aiResponse = await Promise.race([
				ai.models.generateContent({
					model: MODEL_NAME,
					contents: `${PARSE_PROMPT}\n\n${
						studentContext ? `${studentContext}\n\n` : ''
					}User intent: "${intent}"`,
					config: {
						responseMimeType: 'application/json',
						responseJsonSchema: z.toJSONSchema(responseSchema),
						thinkingConfig: {
							thinkingLevel: 'minimal',
						},
					},
				}),
				new Promise((_, reject) => {
					setTimeout(() => {
						reject(new Error('Parse intent timed out'));
					}, PARSE_TIMEOUT_MS);
				}),
			]);

			clearTimeout(timeoutId);

			const parsedResponse = parseGeneratedJson(aiResponse.text);
			const validated = responseSchema.parse(parsedResponse);

			await logApiEvent({
				route: '/api/parse-intent',
				action: 'parse_intent',
				clientKey,
				clientId,
				request,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
				metadata: {
					intent: intent.slice(0, 200),
					confidence: validated.confidence,
					isFullExam: validated.isFullExam,
					usedStudentContext: studentContext !== null,
				},
			});

			return json(validated);
		} catch (aiError) {
			console.error('Intent parsing failed:', aiError);

			const { statusCode, code, message } = classifyApiError(aiError, {
				fallbackCode: 'PARSE_FAILED',
				fallbackMessage: 'Failed to parse intent. Please try again.',
				limitMessage: 'API limit exceeded. Please retry later.',
				timeoutMessage: 'Intent parsing timed out.',
			});

			await logApiEvent({
				route: '/api/parse-intent',
				action: 'parse_intent',
				clientKey,
				request,
				statusCode,
				durationMs: Date.now() - startedAt,
				errorMessage: aiError.message,
			});

			return json({ error: message, code }, { status: statusCode });
		}
	} catch (error) {
		console.error('Parse intent unexpected error:', error);

		await logApiEvent({
			route: '/api/parse-intent',
			action: 'parse_intent',
			clientKey,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return json(
			{ error: 'An unexpected error occurred', code: 'PARSE_UNEXPECTED' },
			{ status: 500 }
		);
	}
}
