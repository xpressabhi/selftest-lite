import { json } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '$lib/server/adminAuth';
import { getDatabaseHealth, getRequestHealthMetrics } from '$lib/server/storage';
import { getSystemMetrics } from '$lib/server/systemMetrics';
import { rateLimiter } from '$lib/server/rateLimiter';

const HEALTH_RATE_LIMIT = 60;
const DEFAULT_WINDOW_SECONDS = 60;

async function safely(load) {
	try {
		return await load();
	} catch (error) {
		console.error(error);
		return null;
	}
}

function getDeploymentInfo() {
	const commit = process.env.VERCEL_GIT_COMMIT_SHA || '';
	return {
		provider: process.env.VERCEL === '1' ? 'vercel' : 'local',
		environment: process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || 'local',
		region: process.env.VERCEL_REGION || null,
		deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
		commit: commit ? commit.slice(0, 7) : null,
		branch: process.env.VERCEL_GIT_COMMIT_REF || null,
		runtime: `node ${process.version}`,
	};
}

export async function GET({ request, url }) {
	if (!isAdminConfigured() || !isAdminRequest(request)) {
		return json({ error: 'Unauthorized', code: 'ADMIN_UNAUTHORIZED' }, { status: 401 });
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:health',
			limit: HEALTH_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
				},
				{ status: 429 }
			);
		}

		const windowSeconds = Number(url.searchParams.get('window')) || DEFAULT_WINDOW_SECONDS;
		const [requests, system, database] = await Promise.all([
			safely(() => getRequestHealthMetrics({ windowSeconds })),
			safely(() => getSystemMetrics()),
			safely(() => getDatabaseHealth()),
		]);

		return json(
			{
				generatedAt: new Date().toISOString(),
				status: requests && system && database ? 'ok' : 'degraded',
				deployment: getDeploymentInfo(),
				requests,
				system,
				database,
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		console.error(error);
		return json(
			{ error: 'Failed to load health metrics', code: 'ADMIN_HEALTH_ERROR' },
			{ status: 500 }
		);
	}
}
