<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import HomePage from '$lib/client/pages/HomePage.svelte';

	// The title lives at route level on purpose: Svelte 5 drops titles emitted
	// by nested components during streamed SSR, and the home page is the only
	// indexable page served that way. Everything else is prerendered.
	const title = $derived(
		$activeLanguage === 'hindi'
			? `${$t('homeH1')} | selftest.in`
			: 'AI Quiz & Exam Paper Generator for India | selftest.in'
	);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<HomePage />
