import { buildSitemap } from '$lib/shared/sitemap';

export const prerender = true;

export function GET() {
	return new Response(buildSitemap(), {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
