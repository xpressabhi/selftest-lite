<script>
	import BlogPostPage from '$lib/client/pages/BlogPostPage.svelte';

	let { data } = $props();
</script>

<BlogPostPage slug={data.slug} post={data.post} related={data.related}/>
