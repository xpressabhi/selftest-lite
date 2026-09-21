<script>
	// Shared SEO head for every indexable page. Pages pass their localized
	// title/description; canonical, alternates, og:url and locales come from
	// `buildSeo` so no page hardcodes the origin. OG/Twitter copy often differs
	// from the meta description for CTR, so all four can be overridden.
	import { buildSeo } from '$lib/shared/seo';

	let {
		path,
		lang = 'english',
		title,
		description,
		type = 'website',
		ogTitle = title,
		ogDescription = description,
		twitterTitle = ogTitle,
		twitterDescription = ogDescription,
	} = $props();

	const seo = $derived(buildSeo({ path, lang, type }));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if seo.indexable}
		<meta name="robots" content="index, follow, max-image-preview:large" />
	{/if}
	{#if seo.canonical}
		<link rel="canonical" href={seo.canonical} />
	{/if}
	{#each seo.alternates as alternate (alternate.hreflang)}
		<link rel="alternate" hreflang={alternate.hreflang} href={alternate.href} />
	{/each}
	<meta property="og:type" content={seo.ogType} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	{#if seo.ogUrl}
		<meta property="og:url" content={seo.ogUrl} />
	{/if}
	<meta property="og:locale" content={seo.ogLocale} />
	<meta property="og:locale:alternate" content={seo.ogLocaleAlternate} />
	<meta name="twitter:title" content={twitterTitle} />
	<meta name="twitter:description" content={twitterDescription} />
</svelte:head>
