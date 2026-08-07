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
	import { initDeepLinks } from '$lib/client/deepLink';
	import { startTelemetry, track } from '$lib/client/telemetry';
	import {
		handleAuthRedirect,
		isAuthLoading,
		loginWithGoogleCredential,
		logout,
		refreshSession,
		user,
	} from '$lib/client/auth';
	import { flushPendingAttempts, startStateSync } from '$lib/client/sync';
	import GoogleSignInButton from '$lib/client/GoogleSignInButton.svelte';
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
	let isAndroidOS = $state(false);
	let isIOS = $state(false);
	let iosBrowser = $state('safari');
	let isInstalling = $state(false);
	let toast = $state(null);
	let toastTimer;
	let pullStartY = 0;
	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let isMenuOpen = $state(false);
	let showSignInModal = $state(false);
	let showUserMenu = $state(false);
	let isSigningIn = $state(false);

	// AdSense is intentionally NOT loaded: adsbygoogle.js is ~1.4MB (the heaviest
	// payload on the site) and there are no ad units placed yet. Re-enable only
	// once real ad slots exist, then load it gated behind `isDataSaverActive`
	// so low-end/slow-connection users never pay the cost.
	// Example (restore when ad units are live):
	//   import { get } from 'svelte/store';
	//   if (get(isDataSaverActive)) return;
	//   const script = document.createElement('script');
	//   script.async = true;
	//   script.dataset.selftestAdsense = 'true';
	//   script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7214001284506571';
	//   document.head.appendChild(script);

	function dismissBootScreen() {
		const bootScreen = document.getElementById('boot-screen');
		if (!bootScreen) {
			return;
		}
		bootScreen.classList.add('is-hidden');
		window.setTimeout(() => bootScreen.remove(), 220);
	}

	onMount(() => {
		dismissBootScreen();
		initializePreferences();
		startTelemetry();
		void initDeepLinks();
		refreshSession();
		void handleAuthRedirect();
		flushPendingAttempts().catch(() => {});
		const stopStateSync = startStateSync();

		const handleOnlineFlush = () => {
			flushPendingAttempts().catch(() => {});
		};
		window.addEventListener('online', handleOnlineFlush);
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
			track('pwa:install-prompt');
			// Android installs via the APK download card, not the PWA prompt —
			// never show both to avoid confusing users.
			if (isAndroidOS) {
				return;
			}
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
			track('pwa:install-accepted');
			window.localStorage.removeItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT);
		};

		updateNetworkState();
		updateStandaloneState();

		// One install path per platform: Android gets the APK download card
		// (home page), iOS and desktop keep the PWA install prompt/steps.
		const platformUa = window.navigator.userAgent || '';
		isAndroidOS = /android/i.test(platformUa);
		isIOS =
			/iphone|ipad|ipod/i.test(platformUa) ||
			(window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
		if (isIOS) {
			// Safari has no CriOS/FxiOS/EdgiOS marker in its UA; anything else
			// gets the generic steps.
			if (/crios/i.test(platformUa)) {
				iosBrowser = 'chrome';
			} else if (/fxios|edgios/i.test(platformUa)) {
				iosBrowser = 'other';
			} else {
				iosBrowser = 'safari';
			}
		}
		if (isIOS && !isStandalone) {
			const dismissedAt = Number(
				window.localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT) || 0,
			);
			const dismissedRecently =
				Number.isFinite(dismissedAt) && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
			if (!dismissedRecently) {
				track('pwa:install-prompt');
				showInstallHint = true;
			}
		}

		window.addEventListener('online', updateNetworkState);
		window.addEventListener('offline', updateNetworkState);
		window.addEventListener('resize', updateStandaloneState);
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.addEventListener('appinstalled', handleAppInstalled);
		const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
		connection?.addEventListener?.('change', updateNetworkState);

		return () => {
			stopStateSync();
			window.removeEventListener('online', updateNetworkState);
			window.removeEventListener('offline', updateNetworkState);
			window.removeEventListener('online', handleOnlineFlush);
			window.removeEventListener('resize', updateStandaloneState);
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.removeEventListener('appinstalled', handleAppInstalled);
			connection?.removeEventListener?.('change', updateNetworkState);
			window.clearTimeout(toastTimer);
		};
	});

	let activePath = $derived(page.url.pathname);
	let isImmersive = $derived(page.url.pathname === '/test');

	$effect(() => {
		track('page:view', { route: page.url.pathname });
	});

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

	$effect(() => {
		if (!showInstallHint) {
			return;
		}
		const timer = window.setTimeout(() => {
			showInstallHint = false;
		}, 10000);
		const hideOnScroll = () => {
			if (window.scrollY > 150) {
				showInstallHint = false;
			}
		};
		window.addEventListener('scroll', hideOnScroll, { passive: true });
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener('scroll', hideOnScroll);
		};
	});

	function dismissInstallHint() {
		showInstallHint = false;
		showInstallGuide = false;
		track('pwa:install-dismissed');
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
		if (isImmersive || window.scrollY > 0 || event.touches.length !== 1) {
			pullStartY = 0;
			return;
		}
		pullStartY = event.touches[0].clientY;
	}

	function handleTouchMove(event) {
		if (isImmersive || !pullStartY || window.scrollY > 0) {
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
		const next = $language === 'english' ? 'hindi' : 'english';
		track('settings:language-toggle', { language: next });
		setLanguage(next);
	}

	function toggleTheme() {
		const next = $themePreference === 'dark' ? 'light' : 'dark';
		track('settings:theme-toggle', { theme: next });
		setThemePreference(next);
	}

	function toggleDataSaver() {
		const next = !$isDataSaverActive;
		track('settings:data-saver-toggle', { enabled: next });
		setDataSaver(next);
	}

	async function handleGoogleCredential(credential) {
		isSigningIn = true;
		try {
			await loginWithGoogleCredential(credential);
			showSignInModal = false;
			showUserMenu = false;
			track('auth:google-sign-in');
		} catch (error) {
			console.error('Google sign-in failed:', error);
			toast = { type: 'error', message: $t('signInFailed') };
		} finally {
			isSigningIn = false;
		}
	}

	async function handleSignOut() {
		await logout();
		showUserMenu = false;
		track('auth:sign-out');
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

<div class="app-shell" class:immersive-mode={isImmersive}>
	<a class="skip-link" href="#main-content">{$t('skipToMainContent')}</a>
	{#if !isImmersive}
		<header class="app-header border-bottom bg-body">
		<nav class="header-inner" aria-label={$t('mainNavigation')}>
			<a class="brand-link" href="/">
				<img class="brand-mark" src="/icons/96.png" alt="" width="32" height="32" />
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
					onclick={toggleDataSaver}
				>
					<span aria-hidden="true">⌁</span>
				</button>
				<button class="header-icon" type="button" aria-label={$t('switchLanguageAria')} onclick={toggleLanguage}>
					<span aria-hidden="true">◎</span>
				</button>
				<button class="header-icon" type="button" aria-label={$t('toggleThemeAria')} onclick={toggleTheme}>
					<span aria-hidden="true">{$themePreference === 'dark' ? '☀' : '☾'}</span>
				</button>
				<a class="header-icon desktop-only" href="/history" aria-label={$t('history')}>
					<span aria-hidden="true">◷</span>
				</a>
				{#if $user}
					<div class="user-menu-wrap">
						<button
							class="user-chip"
							type="button"
							aria-label={$t('signedInAs')}
							aria-expanded={showUserMenu}
							onclick={() => {
								showUserMenu = !showUserMenu;
								isMenuOpen = false;
							}}
						>
							{#if $user.pictureUrl}
								<img src={$user.pictureUrl} alt="" width="28" height="28" referrerpolicy="no-referrer" />
							{:else}
								<span class="user-initial">{($user.name || $user.email || '?').charAt(0).toUpperCase()}</span>
							{/if}
						</button>
						{#if showUserMenu}
							<div class="user-menu">
								<div class="user-menu-header">
									<div class="fw-semibold">{($user.name || $user.email).slice(0, 40)}</div>
									<div class="small text-muted">{$t('signedInAs')}</div>
								</div>
								<a href="/history" onclick={() => (showUserMenu = false)}>◷ {$t('history')}</a>
								<button type="button" onclick={handleSignOut}>⏻ {$t('signOut')}</button>
							</div>
						{/if}
					</div>
				{:else if !$isAuthLoading}
					<button class="header-icon sign-in-control" type="button" aria-label={$t('signIn')} onclick={() => (showSignInModal = true)}>
						<span aria-hidden="true">▣</span>
					</button>
				{/if}
				<button class="header-icon menu-control" type="button" aria-label={$t('toggleMenu')} onclick={() => (isMenuOpen = !isMenuOpen)}>
					<span aria-hidden="true">☰</span>
				</button>
			</div>
		</nav>

		{#if isMenuOpen}
			<nav class="mobile-menu" aria-label={$t('navigationMenu')}>				{#if $user}
					<div class="menu-user">
						<span class="menu-user-initial">{(($user.name || $user.email || '?')).charAt(0).toUpperCase()}</span>
						<span class="menu-user-name">{$user.name || $user.email}</span>
					</div>
				{/if}
				<div class="menu-section-label">{$t('menuSectionExplore')}</div>
				<a href="/about" onclick={() => (isMenuOpen = false)}>{$t('about')}</a>
				<a href="/blog" onclick={() => (isMenuOpen = false)}>{$t('blog')}</a>
				<a href="/faq" onclick={() => (isMenuOpen = false)}>{$t('faq')}</a>
				<a href="/contact" onclick={() => (isMenuOpen = false)}>{$t('contact')}</a>
				<div class="menu-section-label">{$t('menuSectionActions')}</div>
				{#if $user}
					<a href="/profile" onclick={() => (isMenuOpen = false)}>☺ {$t('profileMenuLabel')}</a>
				{/if}
				<a href="/history" onclick={() => (isMenuOpen = false)}>◷ {$t('history')}</a>
				<button type="button" class:active={$isDataSaverActive} onclick={toggleDataSaver}>⌁ {$t('dataSaver')}</button>
				{#if $user}
					<button type="button" class="menu-signout" onclick={() => {
						isMenuOpen = false;
						void handleSignOut();
					}}>⏻ {$t('signOut')}</button>
				{:else if !$isAuthLoading}
					<button type="button" onclick={() => {
						isMenuOpen = false;
						showSignInModal = true;
					}}>▣ {$t('signIn')}</button>
				{/if}
			</nav>
		{/if}
	</header>
	{/if}

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

	{#if showInstallHint && !isStandalone && !isAndroidOS && !isImmersive}
		<section class="pwa-install-hint" role="status" aria-live="polite">
			<div>
				<div class="fw-semibold">{$t('installAppPromptTitle')}</div>
				<div class="small text-muted">{$t('installAppPromptBody')}</div>
				{#if showInstallGuide}
					<ol class="small mt-2 mb-0">
						{#if isIOS && iosBrowser === 'chrome'}
							<li>{$t('installGuideIosChromeStep1')}</li>
							<li>{$t('installGuideIosChromeStep2')}</li>
							<li>{$t('installGuideIosChromeStep3')}</li>
						{:else if isIOS && iosBrowser === 'safari'}
							<li>{$t('installGuideIosSafariStep1')}</li>
							<li>{$t('installGuideIosSafariStep2')}</li>
							<li>{$t('installGuideIosSafariStep3')}</li>
						{:else if isIOS}
							<li>{$t('installGuideIosStep1')}</li>
							<li>{$t('installGuideIosStep2')}</li>
							<li>{$t('installGuideIosStep3')}</li>
						{:else}
							<li>{$t('installGuideAndroidStep1')}</li>
							<li>{$t('installGuideAndroidStep2')}</li>
							<li>{$t('installGuideAndroidStep3')}</li>
						{/if}
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

	{#if !isImmersive}
		<nav class="bottom-nav border-top bg-body" aria-label={$t('mobileNavigation')}>
		<a class:active={activePath === '/'} href="/"><span aria-hidden="true">⌂</span>{$t('homeTab')}</a>
		<a class:active={activePath === '/bookmarks'} href="/bookmarks"><span aria-hidden="true">☆</span>{$t('bookmarksTab')}</a>
		<a class="create-tab" href="/"><span aria-hidden="true">＋</span>{$t('createTab')}</a>
		<a class:active={activePath === '/history'} href="/history"><span aria-hidden="true">◷</span>{$t('historyTab')}</a>
	</nav>
	{/if}

	{#if !isImmersive}
		<footer class="site-footer border-top bg-body">
		<div class="footer-inner">
			<a class="brand-link" href="/">
				<img class="brand-mark" src="/icons/96.png" alt="" width="32" height="32" />
				<span>selftest.in</span>
			</a>
			<p class="footer-tagline small text-muted">{$t('footerTagline')}</p>
			<nav class="footer-links" aria-label={$t('footerNav')}>
				<a href="/about">{$t('about')}</a>
				<a href="/blog">{$t('blog')}</a>
				<a href="/faq">{$t('faq')}</a>
				<a href="/contact">{$t('contact')}</a>
				<a href="/privacy">{$t('privacy')}</a>
				<a href="/terms">{$t('terms')}</a>
			</nav>
			<p class="footer-copy small text-muted">© {new Date().getFullYear()} selftest.in — {$t('allRightsReserved')}</p>
		</div>
	</footer>
	{/if}

	{#if toast}
		<div class={`toast-lite ${toast.type}`} role="status">{toast.message}</div>
	{/if}

	{#if showSignInModal}
		<div class="modal-backdrop" role="presentation" onclick={() => (showSignInModal = false)}>
			<div
				class="sign-in-modal"
				role="dialog"
				aria-modal="true"
				aria-label={$t('signInTitle')}
				onclick={(event) => event.stopPropagation()}
			>
				<button class="modal-close" type="button" aria-label={$t('close')} onclick={() => (showSignInModal = false)}>
					×
				</button>
				<div class="h5 fw-bold mb-1">{$t('signInTitle')}</div>
				<p class="text-muted small">{$t('signInBody')}</p>
				{#if isSigningIn}
					<div class="text-center py-3 text-muted">{$t('signingIn')}</div>
				{:else}
					<div class="d-flex justify-content-center py-2">
						<GoogleSignInButton
							onCredential={handleGoogleCredential}
							disabled={false}
						/>
					</div>
				{/if}
				<p class="small text-muted mt-2 mb-0">{$t('signInAnonymousNote')}</p>
			</div>
		</div>
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
		width: 32px;
		height: 32px;
		object-fit: contain;
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
		width: 44px;
		height: 44px;
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

	.menu-section-label {
		padding: 14px 4px 4px;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.menu-user {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 4px 12px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 4px;
	}

	.menu-user-initial {
		display: grid;
		width: 36px;
		height: 36px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-brand-600) 18%, transparent);
		color: var(--color-brand-600);
		font-weight: 700;
	}

	.menu-user-name {
		overflow: hidden;
		font-size: 0.9rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mobile-menu a,
	.mobile-menu button {
		min-height: 44px;
		padding: 10px 4px;
		border: 0;
		background: transparent;
		text-align: left;
	}

	.mobile-menu a:hover,
	.mobile-menu button:hover,
	.mobile-menu button.active {
		color: var(--color-brand-600);
	}

	.mobile-menu button.active {
		font-weight: 700;
	}

	.menu-signout {
		color: var(--text-muted);
	}

	.mobile-main {
		min-height: calc(100vh - 58px);
		padding-bottom: calc(80px + env(safe-area-inset-bottom));
	}

	.immersive-mode .mobile-main {
		min-height: 100vh;
		padding-bottom: 0;
	}

	.immersive-mode .app-header,
	.immersive-mode .bottom-nav,
	.immersive-mode .site-footer {
		display: none;
	}

	.site-footer {
		display: none;
	}

	.footer-inner {
		display: grid;
		gap: 12px;
		max-width: 920px;
		margin: 0 auto;
		padding: 28px;
	}

	.footer-tagline {
		max-width: 420px;
		margin: 0;
	}

	.footer-links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
	}

	.footer-links a {
		padding: 8px 0;
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
	}

	.footer-links a:hover {
		color: var(--color-brand-600);
	}

	.footer-copy {
		margin: 4px 0 0;
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

	:global(.dark) .bottom-nav a.active,
	:global(.dark) .bottom-nav button:focus-visible,
	:global(.dark) .create-tab {
		color: var(--color-brand-100) !important;
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
		min-width: 44px;
		min-height: 44px;
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

	.user-menu-wrap {
		position: relative;
		display: inline-flex;
	}

	.user-chip {
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
		overflow: hidden;
		padding: 0;
	}

	.user-chip img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

	.user-initial {
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		background: color-mix(in srgb, var(--color-brand-600) 18%, transparent);
		color: var(--color-brand-600);
		font-weight: 700;
	}

	.user-menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 1080;
		min-width: 220px;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
	}

	.user-menu-header {
		padding: 6px 10px 10px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 6px;
	}

	.user-menu a,
	.user-menu button {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		gap: 8px;
		padding: 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: left;
		text-decoration: none;
	}

	.user-menu a:hover,
	.user-menu button:hover {
		background: color-mix(in srgb, var(--color-brand-600) 10%, transparent);
	}

	.sign-in-control {
		color: var(--color-brand-600);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1120;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(15, 23, 42, 0.55);
	}

	.sign-in-modal {
		position: relative;
		width: 100%;
		max-width: 400px;
		padding: 22px 20px 18px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
		text-align: center;
	}

	.modal-close {
		position: absolute;
		top: 8px;
		right: 8px;
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: 1.4rem;
		line-height: 1;
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

		.site-footer {
			display: block;
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

		.pwa-install-hint {
			align-items: flex-start;
			flex-direction: column;
		}
	}

	@media (max-width: 359.98px) {
		.brand-link span {
			display: none;
		}
	}
</style>
