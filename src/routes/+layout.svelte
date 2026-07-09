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
	import '../app/globals.css';
	import 'katex/dist/katex.min.css';

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

	onMount(() => {
		initializePreferences();
		if ('serviceWorker' in navigator) {
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
	<nav class="navbar navbar-expand-lg bg-body border-bottom sticky-top">
		<div class="container">
	<a class="navbar-brand fw-semibold" href="/">selftest.in</a>
	<div class="d-flex align-items-center gap-2">
		<select
			class="form-select form-select-sm nav-select"
			aria-label="Language"
			value={$language}
			onchange={(event) => setLanguage(event.currentTarget.value)}
		>
			<option value="english">{$t('englishLabel')}</option>
			<option value="hindi">{$t('hindiLabel')}</option>
		</select>
		<select
			class="form-select form-select-sm nav-select"
			aria-label="Theme"
			value={$themePreference}
			onchange={(event) => setThemePreference(event.currentTarget.value)}
		>
			<option value="system">{$t('theme')}</option>
			<option value="light">{$t('lightMode')}</option>
			<option value="dark">{$t('darkMode')}</option>
		</select>
		<button
			class="btn btn-sm"
			class:btn-outline-secondary={!$isDataSaverActive}
			class:btn-secondary={$isDataSaverActive}
			type="button"
			onclick={() => setDataSaver(!$isDataSaverActive)}
		>
			{$t('dataSaver')}
		</button>
	</div>
	<a class="btn btn-sm btn-outline-secondary" href="/history">{$t('history')}</a>
	<a class="btn btn-sm btn-primary" href="/">{$t('startNewTest')}</a>
			</div>
	</nav>

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
		class="mobile-main"
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
	>
		{@render children()}
	</main>

	<nav class="bottom-nav border-top bg-body">
		<a class:active={activePath === '/'} href="/"><span aria-hidden="true">＋</span>{$t('home')}</a>
		<a class:active={activePath === '/history'} href="/history"><span aria-hidden="true">◷</span>{$t('history')}</a>
		<a class:active={activePath === '/bookmarks'} href="/bookmarks"><span aria-hidden="true">★</span>{$t('bookmarksTab')}</a>
		<a class:active={activePath === '/about'} href="/about"><span aria-hidden="true">ⓘ</span>{$t('about')}</a>
	</nav>

	{#if toast}
		<div class={`toast-lite ${toast.type}`} role="status">{toast.message}</div>
	{/if}
</div>

<style>
	.app-shell {
		min-height: 100vh;
		background: var(--bg-primary, #f8fafc);
		color: var(--text-primary, #111827);
	}

	.mobile-main {
		min-height: calc(100vh - 56px);
		padding-bottom: calc(72px + env(safe-area-inset-bottom));
	}

	.bottom-nav {
		position: fixed;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 1030;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		padding: 0 8px calc(6px + env(safe-area-inset-bottom));
	}

	.bottom-nav a {
		display: flex;
		min-height: 48px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 2px;
		color: inherit;
		font-size: 0.78rem;
		text-decoration: none;
	}

	.bottom-nav a.active {
		color: var(--bs-primary);
		font-weight: 700;
	}

	.bottom-nav span {
		font-size: 1rem;
		line-height: 1;
	}

	.nav-select {
		width: auto;
		min-width: 68px;
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
		border: 1px solid var(--bs-border-color);
		border-radius: 8px;
		background: var(--bs-body-bg);
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
		background: var(--bs-primary);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 700;
		box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
		translate: -50% 0;
	}

	@media (min-width: 768px) {
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
		.pwa-install-hint {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
