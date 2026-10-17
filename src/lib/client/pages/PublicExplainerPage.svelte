<script>
	import { onMount } from 'svelte';
	import ArtifactFrame from '#lib/client/ArtifactFrame.svelte';
	import ExplainerHeader from '#lib/client/ExplainerHeader.svelte';
	import { getClientHeaders } from '#lib/client/identity.js';
	import { activeLanguage, t } from '#lib/client/i18n.js';
	import SeoHead from '#lib/client/SeoHead.svelte';
	import { shareLink } from '#lib/client/shareLink.js';
	import { track } from '#lib/client/telemetry.js';
	import { localizedPath } from '#lib/shared/seo.js';

	// Public explainer page. The artifact renders in the same sandboxed frame
	// as the playground; only the page chrome localizes per route, and the
	// server load already composed both themes so no scaffold ships here.
	let { data } = $props();

	let dark = $state(false);
	let visitors = $state(0);

	onMount(() => {
		dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';

		// Viewer counter: the fetch records this visit, then returns the
		// distinct-viewer count (including this one). Decorative — a failed
		// fetch leaves the line hidden.
		let canceled = false;
		async function loadViews() {
			try {
				const response = await fetch(
					`/api/explain/stats?slug=${encodeURIComponent(data.slug)}`,
					{ cache: 'no-store', headers: getClientHeaders() }
				);
				if (!response.ok) {
					return;
				}
				const payload = await response.json();
				if (!canceled) {
					visitors = Number(payload?.visitors || 0);
				}
			} catch {
				// Decorative: the line stays absent.
			}
		}
		void loadViews();
		return () => {
			canceled = true;
		};
	});

	const html = $derived(dark ? data.htmlDark : data.htmlLight);
	const publicPath = $derived(localizedPath(`/explain/${data.slug}`, $activeLanguage));
	const shareUrl = $derived(
		typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : publicPath
	);

	async function share() {
		const method = await shareLink({ title: data.title, text: data.summary, url: shareUrl });
		track('playground:share', { surface: 'public', method });
	}
</script>

<SeoHead
	path={publicPath}
	lang={$activeLanguage}
	title={`${data.title} | selftest.in`}
	description={data.summary || data.title}
/>

<section class="app-container py-4 py-md-5">
	<ExplainerHeader
		title={data.title}
		summary={data.summary}
		tag="h1"
		size="page"
		views={visitors}
		eyebrow="explainEyebrow"
	>
		<button class="btn btn-sm btn-outline-secondary" type="button" onclick={() => void share()}>
			{$t('playgroundShare')}
		</button>
		<a
			class="btn btn-sm btn-outline-secondary"
			href={localizedPath('/playground', $activeLanguage)}
		>
			{$t('explainCreateOwn')}
		</a>
	</ExplainerHeader>

	<div class="mt-4">
		<ArtifactFrame {html} title={data.title} />
	</div>
</section>
