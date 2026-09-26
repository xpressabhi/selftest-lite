<script>
	import ExamsHubPage from '$lib/client/pages/ExamsHubPage.svelte';

	let { data } = $props();
</script>

<ExamsHubPage
	notifications={data.notifications}
	lastRunAt={data.lastRunAt}
	lastRunStatus={data.lastRunStatus}
/>
