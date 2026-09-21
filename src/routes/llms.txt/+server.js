import { buildLlmsTxt } from '$lib/shared/llms';

export const prerender = true;

export function GET() {
	return new Response(buildLlmsTxt(), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
