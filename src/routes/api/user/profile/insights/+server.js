import { getStateForIdentity, logApiEvent } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';
import { rateLimited } from '#lib/server/apiResponse.js';
import {
	PROFILE_STATE_KEY,
	isPersonalized,
	parseProfileStateValue,
} from '#lib/shared/userProfile.js';
import {
	buildTailoredSummary,
	computeLearnerSignals,
	mergeFocusTopics,
	resolveDifficulty,
} from '#lib/server/profile.js';

const INSIGHTS_RATE_LIMIT = 30;

export async function GET({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile/insights:get',
			limit: INSIGHTS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/profile/insights',
				action: 'get_profile_insights',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return Response.json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 }
			);
		}

		const storage = await getStateForIdentity({ userId: user?.id, clientId });
		const profile = parseProfileStateValue(storage?.[PROFILE_STATE_KEY]);

		const signals = await computeLearnerSignals({ userId: user?.id, clientId });
		const focusTopics = isPersonalized(profile)
			? mergeFocusTopics({
					declared: profile?.declaredFocus || [],
					weak: signals.weakTopics,
				})
			: [];
		const suggestedDifficulty = isPersonalized(profile)
			? resolveDifficulty({ profile, signals })
			: null;
		const tailoredSummary = isPersonalized(profile)
			? buildTailoredSummary({
					profile,
					signals,
					resolvedDifficulty: suggestedDifficulty,
				})
			: null;

		await logApiEvent({
			route: '/api/user/profile/insights',
			action: 'get_profile_insights',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: {
				hasProfile: profile !== null,
				testsTaken: signals.testsTaken,
				weakTopicCount: signals.weakTopics.length,
			},
		});

		return Response.json({
			profile,
			signals,
			focusTopics,
			suggestedDifficulty,
			tailoredSummary,
		});
	} catch (error) {
		console.error('Failed to fetch profile insights:', error);
		await logApiEvent({
			route: '/api/user/profile/insights',
			action: 'get_profile_insights',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return Response.json(
			{ error: 'Failed to fetch profile insights', code: 'INSIGHTS_FETCH_ERROR' },
			{ status: 500 }
		);
	}
}
