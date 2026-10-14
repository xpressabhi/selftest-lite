import { error } from '@sveltejs/kit';
import { composeArtifactDocument } from './artifactScaffold.js';
import { getExplainerBySlug } from './explainerCache.js';

// Shared loader for the public explainer pages (/explain/<slug> and its /hi
// twin). Both language routes render the same artifact; the page chrome is
// localized by the route and hreflang declares the pair. Composing light and
// dark here lets the client pick by theme without shipping the scaffold.
export async function loadPublicExplainer({ params }) {
	const slug = String(params.slug ?? '');
	const row = slug ? await getExplainerBySlug(slug) : null;
	if (!row) {
		throw error(404, 'Explainer not found');
	}

	const brief = row.payload ?? {};
	const payload = row.payload ?? {};
	return {
		slug: row.slug,
		title: brief.title || row.concept || 'Explainer',
		summary: brief.summary || '',
		language: row.language === 'hindi' ? 'hindi' : 'english',
		htmlLight: composeArtifactDocument({ brief, payload, language: row.language, theme: 'light' }),
		htmlDark: composeArtifactDocument({ brief, payload, language: row.language, theme: 'dark' }),
	};
}
