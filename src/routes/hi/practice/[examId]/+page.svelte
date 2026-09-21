<script>
	import ExamPage from '$lib/client/pages/ExamPage.svelte';

	let { data } = $props();
</script>

<ExamPage exam={data.exam} related={data.related}/>
