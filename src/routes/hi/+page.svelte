<script>
	import { activeLanguage, t } from '$lib/client/i18n';
	import HomePage from '$lib/client/pages/HomePage.svelte';

	// Same route-level title rule as the English home page.
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
