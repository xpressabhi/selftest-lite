import { json } from '@sveltejs/kit';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import { getExamPattern, patternKeyFor } from '$lib/server/examPattern';
import { getIndianExamById } from '$lib/data/indianExams';
import { isAdminConfigured, isAdminRequest } from '$lib/server/adminAuth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { VALID_LANGUAGES } from '$lib/server/quizConfig';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';

const PATTERN_RATE_LIMIT = 10;

/**
 * Resolves the actual exam pattern for a target (exam id, board/class/subject,
 * or a named paper), discovering and caching it when missing. Public and
 * rate-limited: discovery costs one model call per pattern key and TTL.
 */
export async function GET({ request, url }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/exam:pattern',
			limit: PATTERN_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/exam:pattern',
				action: 'get_exam_pattern',
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': String(PATTERN_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const examId = url.searchParams.get('examId');
		// Discovery needs the human-readable name; without it the model would
		// invent an exam for a bare id.
		const exam = examId ? getIndianExamById(examId) : null;
		const target = {
			examId,
			examName: exam?.name || url.searchParams.get('examName') || null,
			board: url.searchParams.get('board'),
			classLevel: url.searchParams.get('class'),
			subject: url.searchParams.get('subject'),
			paperName: url.searchParams.get('paper'),
		};
		const patternKey = patternKeyFor(target);
		if (!patternKey) {
			return json(
				{
					error: 'Provide an exam, a paper name, or board + class + subject',
					code: 'INVALID_PATTERN_TARGET',
				},
				{ status: 400 }
			);
		}

		const requestedLanguage = String(url.searchParams.get('language') || 'english').toLowerCase();
		const language = VALID_LANGUAGES.includes(requestedLanguage) ? requestedLanguage : 'english';
		// Forced refreshes are an admin tool: public callers are rate-limited
		// to 10/min and must not turn discovery into a model-call button.
		const requestedRefresh = url.searchParams.get('refresh') === '1';
		const isAdmin = isAdminConfigured() && isAdminRequest(request);
		const refresh = requestedRefresh && isAdmin;
		const discover = url.searchParams.get('discover') !== '0';

		const pattern = await getExamPattern(target, { language, refresh, discover });
		if (!pattern) {
			return json(
				{ error: 'Pattern is not cached yet', code: 'PATTERN_NOT_FOUND' },
				{ status: 404 }
			);
		}

		await logApiEvent({
			route: '/api/exam:pattern',
			action: 'get_exam_pattern',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: {
				patternKey,
				source: pattern?.source || null,
				stale: pattern?.stale ?? null,
				requestedRefresh,
				refresh,
				discover,
				language,
			},
		});

		return json({ pattern, key: patternKey }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('Exam pattern discovery failed:', error);
		await logApiEvent({
			route: '/api/exam:pattern',
			action: 'get_exam_pattern',
			clientKey,
			request,
			statusCode: 502,
			durationMs: Date.now() - startedAt,
			errorMessage: String(error.message || '').slice(0, 500),
		});
		return json(
			{
				error: 'Could not determine the exam pattern right now. Please retry.',
				code: 'PATTERN_DISCOVERY_FAILED',
			},
			{ status: 502 }
		);
	}
}
