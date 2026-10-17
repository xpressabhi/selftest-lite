<script>
	// Dedicated print view: /print?t=<testId> resolves the same record the
	// results page does (local history first, then /api/test, which strips the
	// answer key server-side) and renders a clean, chrome-free paper.
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '#lib/client/Icon.svelte';
	import PrintPaper from '#lib/client/PrintPaper.svelte';
	import { activeLanguage, t } from '#lib/client/i18n.js';
	import { resolveTestRecord } from '#lib/client/storage.js';

	let paper = $state(null);
	let loading = $state(true);
	let error = $state('');

	const testId = $derived(page.url.searchParams.get('t'));

	onMount(async () => {
		try {
			const resolved = await resolveTestRecord(testId);
			if (
				!resolved ||
				!Array.isArray(resolved.questions) ||
				resolved.questions.length === 0
			) {
				error = $t('resultNotFound');
				return;
			}
			paper = resolved;
		} catch (caughtError) {
			error = caughtError?.message || $t('failedToLoadResult');
		} finally {
			loading = false;
		}
	});

	function printPage() {
		window.print();
	}
</script>

<svelte:head>
	<title>{paper?.topic ? `${paper.topic} · ` : ''}{$t('print')} | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="print-page">
	<div class="print-toolbar no-print">
		<a
			class="print-back"
			href={testId ? `/results?id=${encodeURIComponent(testId)}` : '/history'}
		>
			<Icon name="arrow-left" size={16} />
			{$t('printBack')}
		</a>
		<button
			class="print-btn"
			type="button"
			disabled={loading || Boolean(error) || !paper}
			onclick={printPage}
		>
			<Icon name="print" size={16} />
			{$t('print')}
		</button>
	</div>

	{#if loading}
		<p class="print-status" role="status">{$t('printLoading')}</p>
	{:else if error}
		<div class="print-status">
			<p class="print-error">{error}</p>
			<p class="print-error-hint">{$t('printErrorHint')}</p>
			<div class="d-flex flex-wrap gap-2">
				<a class="print-back" href="/history">{$t('history')}</a>
				<a class="print-back" href="/">{$t('startNewTest')}</a>
			</div>
		</div>
	{:else if paper}
		<PrintPaper {paper} language={$activeLanguage} />
	{/if}
</div>

<style>
	.print-page {
		min-height: 100vh;
		min-height: 100dvh;
		background: #eef1f4;
	}

	.print-toolbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: calc(8px + var(--sat, env(safe-area-inset-top, 0px))) 16px 8px;
		border-bottom: 1px solid #d1d5db;
		background: #fff;
	}

	.print-back {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 6px;
		color: #374151;
		font-weight: 600;
		text-decoration: none;
	}

	.print-back:hover {
		color: #111827;
	}

	.print-btn {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 8px;
		padding: 0 20px;
		border: 0;
		border-radius: 999px;
		background: var(--color-brand-600, #1d4ed8);
		color: #fff;
		font-weight: 700;
	}

	.print-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.print-status {
		max-width: 820px;
		margin: 0 auto;
		padding: 40px 26px;
		color: #4b5563;
	}

	.print-error {
		color: #b91c1c;
	}

	.print-error-hint {
		margin: 0 0 12px;
		color: #4b5563;
		font-size: 0.9rem;
	}

	@media print {
		.print-page {
			background: #fff;
		}

		.print-toolbar {
			display: none;
		}
	}
</style>
