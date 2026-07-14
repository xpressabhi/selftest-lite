<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { t } from '$lib/client/i18n';
	import {
		initializePreferences,
		isDataSaverActive,
		language,
		setDataSaver,
		setLanguage,
		setThemePreference,
		themePreference,
	} from '$lib/client/preferences';
	import { STORAGE_KEYS } from '$lib/client/constants';
	import '$lib/styles/globals.css';

	let { children } = $props();
	let isOffline = $state(false);
	let isSlowConnection = $state(false);
	let effectiveType = $state('');
	let showSlowBanner = $state(false);
	let slowBannerDismissed = $state(false);
	let deferredInstallPrompt = $state(null);
	let showInstallHint = $state(false);
	let showInstallGuide = $state(false);
	let isStandalone = $state(false);
	let isInstalling = $state(false);
	let toast = $state(null);
	let toastTimer;
	let pullStartY = 0;
	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let isMenuOpen = $state(false);
	let isSearchOpen = $state(false);
	let searchQuery = $state('');
	let searchResults = $state([]);
	let searchStatus = $state('idle');

	onMount(() => {
		initializePreferences();
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			navigator.serviceWorker
				.register('/sw.js')
				.then(() => {
					toast = { type: 'success', message: $t('offlineReady') };
					window.clearTimeout(toastTimer);
					toastTimer = window.setTimeout(() => {
						toast = null;
					}, 3000);
				})
				.catch(() => {
					// Service worker registration is best-effort; local dev may not serve a built sw.js.
				});
		}

		const updateNetworkState = () => {
			const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
			const nextEffectiveType = String(connection?.effectiveType || '');
			isOffline = !navigator.onLine;
			effectiveType = nextEffectiveType;
			isSlowConnection =
				Boolean(connection?.saveData) ||
				['slow-2g', '2g', '3g'].includes(nextEffectiveType.toLowerCase());
			if (isOffline) {
				slowBannerDismissed = false;
			}
		};
		const updateStandaloneState = () => {
			isStandalone =
				window.matchMedia('(display-mode: standalone)').matches ||
				window.navigator.standalone === true;
		};
		const handleBeforeInstallPrompt = (event) => {
			event.preventDefault();
			deferredInstallPrompt = event;
			const dismissedAt = Number(
				window.localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT) || 0,
			);
			const dismissedRecently =
				Number.isFinite(dismissedAt) && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
			showInstallHint = !dismissedRecently && !isStandalone;
		};
		const handleAppInstalled = () => {
			deferredInstallPrompt = null;
			showInstallHint = false;
			window.localStorage.removeItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT);
		};

		updateNetworkState();
		updateStandaloneState();
		window.addEventListener('online', updateNetworkState);
		window.addEventListener('offline', updateNetworkState);
		window.addEventListener('resize', updateStandaloneState);
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.addEventListener('appinstalled', handleAppInstalled);
		const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
		connection?.addEventListener?.('change', updateNetworkState);

		return () => {
			window.removeEventListener('online', updateNetworkState);
			window.removeEventListener('offline', updateNetworkState);
			window.removeEventListener('resize', updateStandaloneState);
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.removeEventListener('appinstalled', handleAppInstalled);
			connection?.removeEventListener?.('change', updateNetworkState);
			window.clearTimeout(toastTimer);
		};
	});

	let activePath = $derived(page.url.pathname);

	$effect(() => {
		if (isSlowConnection && !isOffline && !slowBannerDismissed) {
			const timer = window.setTimeout(() => {
				showSlowBanner = true;
			}, 1200);
			return () => window.clearTimeout(timer);
		}
		showSlowBanner = false;
	});

	$effect(() => {
		if (isOffline) {
			toast = { type: 'warning', message: $t('offlineToastMessage') };
			window.clearTimeout(toastTimer);
			toastTimer = window.setTimeout(() => {
				toast = null;
			}, 4500);
		}
	});

	function dismissInstallHint() {
		showInstallHint = false;
		showInstallGuide = false;
		window.localStorage.setItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT, String(Date.now()));
	}

	async function installApp() {
		if (!deferredInstallPrompt) {
			showInstallGuide = true;
			return;
		}
		isInstalling = true;
		try {
			await deferredInstallPrompt.prompt();
			const result = await deferredInstallPrompt.userChoice;
			if (result?.outcome !== 'accepted') {
				dismissInstallHint();
			}
		} finally {
			deferredInstallPrompt = null;
			isInstalling = false;
		}
	}

	function handleTouchStart(event) {
		if (window.scrollY > 0 || event.touches.length !== 1) {
			pullStartY = 0;
			return;
		}
		pullStartY = event.touches[0].clientY;
	}

	function handleTouchMove(event) {
		if (!pullStartY || window.scrollY > 0) {
			return;
		}
		const distance = event.touches[0].clientY - pullStartY;
		pullDistance = Math.max(0, Math.min(distance, 86));
	}

	function handleTouchEnd() {
		if (pullDistance > 64 && !isOffline) {
			isRefreshing = true;
			window.location.reload();
			return;
		}
		pullStartY = 0;
		pullDistance = 0;
	}

	function toggleLanguage() {
		setLanguage($language === 'english' ? 'hindi' : 'english');
	}

	function toggleTheme() {
		setThemePreference($themePreference === 'dark' ? 'light' : 'dark');
	}

	function openSearch() {
		isMenuOpen = false;
		isSearchOpen = true;
	}

	function closeSearch() {
		isSearchOpen = false;
		searchStatus = 'idle';
	}

	async function submitSearch(event) {
		event.preventDefault();
		const normalizedQuery = searchQuery.trim();
		if (!normalizedQuery) {
			searchResults = [];
			searchStatus = 'idle';
			return;
		}

		searchStatus = 'loading';
		try {
			const response = await fetch(`/api/test?q=${encodeURIComponent(normalizedQuery)}&limit=10`);
			const payload = await response.json();
			searchResults = response.ok && Array.isArray(payload.tests) ? payload.tests : [];
			searchStatus = 'done';
		} catch {
			searchResults = [];
			searchStatus = 'done';
		}
	}
</script>

<svelte:head>
	<title>AI Quiz & Exam Paper Generator for India | selftest.in</title>
	<meta
		name="description"
		content="Create AI-powered quiz practice and full objective exam papers for Indian competitive exams in Hindi and English."
	/>
	<meta property="og:site_name" content="selftest.in" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://selftest.in" />
	<meta property="og:title" content="AI Quiz & Exam Paper Generator for India" />
	<meta
		property="og:description"
		content="Generate objective quiz practice and full-length exam papers for Indian exams with AI. Supports Hindi and English."
	/>
	<meta property="og:image" content="https://selftest.in/icons/512.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="AI Quiz & Exam Paper Generator for India" />
	<meta
		name="twitter:description"
		content="Generate objective quiz practice and full-length exam papers for Indian exams with AI."
	/>
	<meta name="twitter:image" content="https://selftest.in/icons/512.png" />
	<link rel="canonical" href={`https://selftest.in${page.url.pathname}`} />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": "selftest.in",
			"url": "https://selftest.in",
			"logo": "https://selftest.in/icons/512.png",
			"sameAs": ["https://x.com/selftest_in"]
		}
	</script>
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "WebSite",
			"name": "selftest.in",
			"url": "https://selftest.in",
			"inLanguage": ["en-IN", "hi-IN"],
			"potentialAction": {
				"@type": "SearchAction",
				"target": "https://selftest.in/?q={search_term_string}",
				"query-input": "required name=search_term_string"
			}
		}
	</script>
</svelte:head>

<div class="app-shell">
	<a class="skip-link" href="#main-content">{$t('skipToMainContent')}</a>
	<header class="app-header border-bottom bg-body">
		<nav class="header-inner" aria-label={$t('mainNavigation')}>
			<a class="brand-link" href="/" aria-label={$t('selftestHome')}>
				<span class="brand-mark" aria-hidden="true">▤</span>
				<span>selftest.in</span>
			</a>

			<div class="desktop-nav" aria-label={$t('mainNavigation')}>
				<a href="/about">{$t('about')}</a>
				<a href="/blog">{$t('blog')}</a>
				<a href="/faq">{$t('faq')}</a>
				<a href="/contact">{$t('contact')}</a>
				<a class="create-link" href="/">{$t('createTab')}</a>
			</div>

			<div class="header-actions">
				<button
					class:active={$isDataSaverActive}
					class="header-icon data-saver-control"
					type="button"
					aria-label={$t('dataSaver')}
					title={$t('dataSaver')}
					onclick={() => setDataSaver(!$isDataSaverActive)}
				>
					<span aria-hidden="true">⌁</span>
				</button>
				<button class="header-icon desktop-only" type="button" aria-label={$t('searchTests')} onclick={openSearch}>
					<span aria-hidden="true">⌕</span>
				</button>
				<button class="header-icon" type="button" aria-label={$t('switchLanguageAria')} onclick={toggleLanguage}>
					<span aria-hidden="true">◎</span>
				</button>
				<button class="header-icon" type="button" aria-label={$t('toggleThemeAria')} onclick={toggleTheme}>
					<span aria-hidden="true">{$themePreference === 'dark' ? '☀' : '◐'}</span>
				</button>
				<a class="header-icon desktop-only" href="/history" aria-label={$t('history')}>
					<span aria-hidden="true">◷</span>
				</a>
				<button class="header-icon menu-control" type="button" aria-label={$t('toggleMenu')} onclick={() => (isMenuOpen = !isMenuOpen)}>
					<span aria-hidden="true">☰</span>
				</button>
			</div>
		</nav>

		{#if isMenuOpen}
			<nav class="mobile-menu" aria-label={$t('navigationMenu')}>
				<a href="/about" onclick={() => (isMenuOpen = false)}>{$t('about')}</a>
				<a href="/blog" onclick={() => (isMenuOpen = false)}>{$t('blog')}</a>
				<a href="/faq" onclick={() => (isMenuOpen = false)}>{$t('faq')}</a>
				<a href="/contact" onclick={() => (isMenuOpen = false)}>{$t('contact')}</a>
				<a href="/history" onclick={() => (isMenuOpen = false)}>{$t('history')}</a>
				<button type="button" onclick={openSearch}>{$t('searchTests')}</button>
			</nav>
		{/if}
	</header>

	{#if isOffline}
		<div class="connection-banner offline-banner" role="alert">
			{$t('offlineQuizzesAvailable')}
		</div>
	{:else if showSlowBanner}
		<div class="connection-banner slow-banner" role="alert">
			<span>{$t('slowConnectionUsingOptimized')} {effectiveType ? `(${effectiveType})` : ''}</span>
			<button type="button" class="banner-close" aria-label="Close" onclick={() => (slowBannerDismissed = true)}>
				×
			</button>
		</div>
	{/if}

	{#if showInstallHint && !isStandalone}
		<section class="pwa-install-hint" role="status" aria-live="polite">
			<div>
				<div class="fw-semibold">{$t('installAppPromptTitle')}</div>
				<div class="small text-muted">{$t('installAppPromptBody')}</div>
				{#if showInstallGuide}
					<ol class="small mt-2 mb-0">
						<li>{$t('installGuideAndroidStep1')}</li>
						<li>{$t('installGuideAndroidStep2')}</li>
						<li>{$t('installGuideAndroidStep3')}</li>
					</ol>
				{/if}
			</div>
			<div class="d-flex gap-2">
				<button class="btn btn-sm btn-primary" type="button" disabled={isInstalling} onclick={installApp}>
					{isInstalling ? $t('preparing') : deferredInstallPrompt ? $t('installNow') : $t('openInstallGuide')}
				</button>
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={dismissInstallHint}>
					{$t('later')}
				</button>
			</div>
		</section>
	{/if}

	{#if pullDistance > 8}
		<div class="pull-indicator" style={`transform: translateY(${Math.min(pullDistance - 44, 0)}px);`}>
			{isRefreshing || pullDistance > 64 ? $t('loading') : $t('retrying')}
		</div>
	{/if}

	<main
		id="main-content"
		class="mobile-main"
		tabindex="-1"
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
	>
		{@render children()}
	</main>

	<nav class="bottom-nav border-top bg-body" aria-label={$t('mobileNavigation')}>
		<a class:active={activePath === '/'} href="/"><span aria-hidden="true">⌂</span>{$t('homeTab')}</a>
		<a class:active={activePath === '/bookmarks'} href="/bookmarks"><span aria-hidden="true">☆</span>{$t('bookmarksTab')}</a>
		<a class="create-tab" href="/"><span aria-hidden="true">＋</span>{$t('createTab')}</a>
		<a class:active={activePath === '/history'} href="/history"><span aria-hidden="true">◷</span>{$t('historyTab')}</a>
		<button type="button" onclick={openSearch}><span aria-hidden="true">⌕</span>{$t('searchTab')}</button>
	</nav>

	{#if isSearchOpen}
		<div class="search-backdrop" role="presentation" onclick={closeSearch}></div>
		<dialog open class="search-panel" aria-label={$t('searchPastTests')}>
			<div class="search-panel-heading">
				<h2 class="h5 mb-0">{$t('searchPastTests')}</h2>
				<button class="header-icon" type="button" aria-label={$t('closeSearch')} onclick={closeSearch}>×</button>
			</div>
			<form onsubmit={submitSearch}>
				<label class="visually-hidden" for="global-test-search">{$t('searchByTopic')}</label>
				<div class="input-group">
					<input id="global-test-search" class="form-control" bind:value={searchQuery} placeholder={$t('searchByTopic')} />
					<button class="btn btn-primary" type="submit">{$t('searchTests')}</button>
				</div>
			</form>
			{#if searchStatus === 'loading'}
				<p class="text-muted small mb-0">{$t('loading')}</p>
			{:else if searchStatus === 'done'}
				<div class="search-results">
					{#if searchResults.length === 0}
						<p class="text-muted mb-0">{$t('noTestsFound')}</p>
					{:else}
						{#each searchResults as test (test.id)}
							<a href={`/test?id=${test.id}`} onclick={closeSearch}>
								<strong>{test.topic || $t('untitledTest')}</strong>
								<span>{test.test_mode === 'full-exam' ? $t('fullExamPaper') : $t('quizPractice')}</span>
							</a>
						{/each}
					{/if}
				</div>
			{/if}
		</dialog>
	{/if}

	{#if toast}
		<div class={`toast-lite ${toast.type}`} role="status">{toast.message}</div>
	{/if}
</div>

<style>
	.app-shell {
		min-height: 100vh;
		background: var(--surface-muted);
		color: var(--text);
	}

	.skip-link {
		position: fixed;
		top: -48px;
		left: 12px;
		z-index: 1200;
		padding: 8px 12px;
		border-radius: 0 0 8px 8px;
		background: var(--color-brand-600);
		color: #fff;
		font-weight: 700;
		text-decoration: none;
	}

	.skip-link:focus {
		top: 0;
	}

	.app-header {
		position: sticky;
		top: 0;
		z-index: 1040;
	}

	.header-inner {
		display: flex;
		min-height: 58px;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		max-width: 1320px;
		margin: 0 auto;
		padding: 6px 20px;
	}

	.brand-link {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		color: inherit;
		font-size: 1.1rem;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
	}

	.brand-mark {
		color: var(--color-brand-600);
		font-size: 1.35rem;
		line-height: 1;
	}

	.desktop-nav {
		display: none;
		align-items: center;
		gap: 14px;
		padding: 4px 8px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface) 92%, var(--color-brand-600));
	}

	.desktop-nav a,
	.mobile-menu a,
	.mobile-menu button {
		color: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
	}

	.desktop-nav a {
		padding: 7px 2px;
	}

	.desktop-nav .create-link {
		padding: 7px 15px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-brand-600) 14%, transparent);
		color: var(--color-brand-600);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.header-icon {
		display: grid;
		width: 40px;
		height: 40px;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: inherit;
		font-size: 1.25rem;
		line-height: 1;
		text-decoration: none;
	}

	.header-icon:hover,
	.header-icon:focus-visible,
	.header-icon.active {
		background: color-mix(in srgb, var(--color-brand-600) 13%, transparent);
		color: var(--color-brand-600);
		outline: none;
	}

	.data-saver-control {
		display: none;
	}

	.desktop-only {
		display: none;
	}

	.mobile-menu {
		display: grid;
		gap: 2px;
		padding: 8px 20px 14px;
		border-top: 1px solid var(--line);
		background: var(--surface);
	}

	.mobile-menu a,
	.mobile-menu button {
		min-height: 44px;
		padding: 10px 4px;
		border: 0;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
		background: transparent;
		text-align: left;
	}

	.mobile-main {
		min-height: calc(100vh - 58px);
		padding-bottom: calc(80px + env(safe-area-inset-bottom));
	}

	.bottom-nav {
		position: fixed;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 1030;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		padding: 0 8px calc(6px + env(safe-area-inset-bottom));
	}

	.bottom-nav a,
	.bottom-nav button {
		display: flex;
		min-height: 48px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 2px;
		color: inherit;
		border: 0;
		background: transparent;
		font-size: 0.78rem;
		text-decoration: none;
	}

	.bottom-nav a.active,
	.bottom-nav button:focus-visible {
		color: var(--color-brand-600);
		font-weight: 700;
		outline: none;
	}

	.bottom-nav span {
		font-size: 1rem;
		line-height: 1;
	}

	.create-tab {
		color: var(--color-brand-600) !important;
		font-weight: 700;
	}

	.search-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1090;
		background: rgba(15, 23, 42, 0.48);
	}

	.search-panel {
		position: fixed;
		top: 74px;
		left: 50%;
		z-index: 1100;
		width: min(560px, calc(100vw - 24px));
		max-height: min(70vh, 620px);
		overflow: auto;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface);
		box-shadow: 0 20px 60px rgba(15, 23, 42, 0.26);
		translate: -50% 0;
		margin: 0;
	}

	.search-panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
	}

	.search-results {
		display: grid;
		gap: 8px;
		margin-top: 14px;
	}

	.search-results a {
		display: grid;
		gap: 2px;
		padding: 11px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: inherit;
		text-decoration: none;
	}

	.search-results a:hover {
		border-color: var(--color-brand-600);
	}

	.search-results span {
		color: var(--text-muted);
		font-size: 0.82rem;
	}

	.connection-banner {
		position: sticky;
		top: 56px;
		z-index: 1025;
		display: flex;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 8px 16px;
		color: #fff;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: center;
	}

	.offline-banner {
		background: #b45309;
	}

	.slow-banner {
		background: #4338ca;
	}

	.banner-close {
		display: grid;
		min-width: 32px;
		min-height: 32px;
		place-items: center;
		border: 0;
		background: transparent;
		color: inherit;
		font-size: 1.25rem;
		line-height: 1;
	}

	.pwa-install-hint {
		position: fixed;
		right: 12px;
		bottom: calc(76px + env(safe-area-inset-bottom));
		left: 12px;
		z-index: 1040;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
	}

	.toast-lite {
		position: fixed;
		right: 16px;
		bottom: calc(92px + env(safe-area-inset-bottom));
		z-index: 1100;
		max-width: min(360px, calc(100vw - 32px));
		padding: 10px 12px;
		border-radius: 8px;
		background: #111827;
		color: #fff;
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.2);
	}

	.pull-indicator {
		position: fixed;
		top: calc(58px + env(safe-area-inset-top));
		left: 50%;
		z-index: 1060;
		min-height: 34px;
		padding: 7px 14px;
		border-radius: 999px;
		background: var(--color-brand-600);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 700;
		box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
		translate: -50% 0;
	}

	@media (min-width: 768px) {
		.header-inner {
			padding-inline: 28px;
		}

		.desktop-nav,
		.desktop-only,
		.data-saver-control {
			display: inline-flex;
		}

		.desktop-nav {
			display: flex;
		}

		.menu-control,
		.mobile-menu {
			display: none;
		}

		.bottom-nav {
			display: none;
		}

		.mobile-main {
			padding-bottom: 0;
		}

		.pwa-install-hint {
			right: 24px;
			bottom: 24px;
			left: auto;
			max-width: 440px;
		}
	}

	@media (max-width: 575.98px) {
		.header-inner {
			padding-inline: 12px;
		}

		.header-icon {
			width: 36px;
			height: 36px;
		}

		.pwa-install-hint {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
