<script>
	import { t } from '$lib/client/i18n';

	let { data } = $props();
</script>

<svelte:head>
	<title>{$t(data.post.titleKey)} | selftest.in</title>
	<meta name="description" content={$t(data.post.excerptKey)} />
	<link rel="canonical" href={`https://selftest.in/blog/${data.slug}`} />
</svelte:head>

<article class="container py-4 py-md-5">
	<div class="mx-auto" style="max-width: 820px;">
		<div class="d-flex flex-wrap gap-2 mb-3">
			<span class="badge text-bg-primary">{$t(data.post.categoryKey)}</span>
			<span class="small text-muted">{$t(data.post.dateKey)} · {$t(data.post.readTimeKey)}</span>
		</div>
		<h1 class="h2 fw-bold">{$t(data.post.titleKey)}</h1>
		<p class="lead text-muted">{$t(data.post.excerptKey)}</p>
		<div class="bg-body border rounded-3 p-3 p-md-4">
			<ul class="mb-0">
				{#each data.post.pointKeys as pointKey (pointKey)}
					<li class="mb-2">{$t(pointKey)}</li>
				{/each}
			</ul>
		</div>
		<a class="btn btn-primary mt-4" href="/">{$t('aboutCtaButton')}</a>
	</div>
</article>
