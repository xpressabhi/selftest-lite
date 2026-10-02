<script>
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { activeLanguage, t } from '$lib/client/i18n';
	import {
		initializePreferences,
		language,
		setLanguage,
		setThemePreference,
		themePreference,
	} from '$lib/client/preferences';
	import { STORAGE_KEYS } from '$lib/client/constants';
	import NotificationsBell from '$lib/client/NotificationsBell.svelte';
	import { initDeepLinks } from '$lib/client/deepLink';
	import { startDeviceProfileTracking } from '$lib/client/deviceProfile';
	import { focusTrap } from '$lib/client/focusTrap';
	import { initNativeShell } from '$lib/client/nativeShell';
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
	import { showToast, toast } from '$lib/client/toast';
	import GoogleSignInButton from '$lib/client/GoogleSignInButton.svelte';
	import Icon from '$lib/client/Icon.svelte';
	import Toast from '$lib/client/Toast.svelte';
	import { jsonLdScript } from '$lib/shared/jsonLd';
	import { SITE_ORIGIN, languageHref, localizedPath } from '$lib/shared/seo';
	import '$lib/styles/globals.css';

	let { children, data } = $props();

	// SSR renders one request synchronously, so re-pinning the store here (after
	// every load resolved, before any child renders) keeps the language from
	// leaking between concurrent server renders. On the client the +layout.js
	// load and saved preferences own this store.
	if (typeof window === 'undefined') {
		// untrack: the server read is deliberate and must not be treated as a
		// reactive dependency (there is no later value to observe).
		activeLanguage.set(untrack(() => data?.lang ?? null));
	}

	let isOffline = $state(false);
	let deferredInstallPrompt = $state(null);
	let showInstallHint = $state(false);
	let showInstallGuide = $state(false);
	let isStandalone = $state(false);
	let isAndroidOS = $state(false);
	let isIOS = $state(false);
	let iosBrowser = $state('safari');
	let isInstalling = $state(false);
	let pullStartY = 0;
	let pullRafId = 0;
	let pullMoveY = 0;
	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let isMenuOpen = $state(false);
	let showSignInModal = $state(false);
	let showUserMenu = $state(false);
	let userMenuTrigger = $state(null);
	let userMenuElement = $state(null);
	let isSigningIn = $state(false);

	const PWA_DISMISS_WINDOW = 7 * 24 * 60 * 60 * 1000;
	const PWA_PROMPT_COOLDOWN = 14 * 24 * 60 * 60 * 1000;
	const PWA_PROMPT_SESSION_KEY = 'selftest_pwa_prompt_shown';

	function isPwaInstallDismissed() {
		if (typeof window === 'undefined') return true;
		const dismissedAt = Number(
			window.localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT) || 0
		);
		return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < PWA_DISMISS_WINDOW;
	}

	function wasPwaPromptShownRecently() {
		if (typeof window === 'undefined') return true;
		try {
			if (window.sessionStorage.getItem(PWA_PROMPT_SESSION_KEY) === '1') {
				return true;
			}
			const promptedAt = Number(
				window.localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_PROMPTED_AT) || 0
			);
			return Number.isFinite(promptedAt) && Date.now() - promptedAt < PWA_PROMPT_COOLDOWN;
		} catch {
			return true;
		}
	}

	function markPwaPromptShown() {
		try {
			window.sessionStorage.setItem(PWA_PROMPT_SESSION_KEY, '1');
			window.localStorage.setItem(STORAGE_KEYS.PWA_INSTALL_PROMPTED_AT, String(Date.now()));
		} catch {
			// Best effort: a missing marker only costs one extra prompt.
		}
	}

	// Shown at most once per session and once per cooldown window. Telemetry is
	// emitted here so it only counts prompts users actually saw.
	function maybeShowInstallHint() {
		if (isStandalone || isPwaInstallDismissed() || wasPwaPromptShownRecently()) {
			return false;
		}
		showInstallHint = true;
		track('pwa:install-prompt');
		markPwaPromptShown();
		return true;
	}

	// AdSense is intentionally NOT loaded: adsbygoogle.js is ~1.4MB (the heaviest
	// payload on the site) and there are no ad units placed yet. Re-enable only
	// once real ad slots exist.
	// Example (restore when ad units are live):
	//   const script = document.createElement('script');
	//   script.async = true;
	//   script.dataset.selftestAdsense = 'true';
	//   script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7214001284506571';
	//   document.head.appendChild(script);

	onMount(() => {
		initializePreferences();
		startTelemetry();
		startDeviceProfileTracking();
		void initDeepLinks();
		void initNativeShell();
		void handleAuthRedirect();
		// Session, state, and history hydration wait until the browser is idle
		// so the first paint and first tap are never blocked by cold API calls.
		let stopStateSync = () => {};
		const scheduleIdle = (callback) => {
			if (typeof window.requestIdleCallback === 'function') {
				window.requestIdleCallback(callback, { timeout: 2000 });
			} else {
				window.setTimeout(callback, 1500);
			}
		};
		scheduleIdle(() => {
			refreshSession();
			stopStateSync = startStateSync();
			flushPendingAttempts().catch(() => {});
		});

		const handleOnlineFlush = () => {
			flushPendingAttempts().catch(() => {});
		};
		window.addEventListener('online', handleOnlineFlush);
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {
				// Service worker registration is best-effort; local dev may not serve a built sw.js.
			});
		}

		const updateNetworkState = () => {
			isOffline = !navigator.onLine;
		};
		const updateStandaloneState = () => {
			isStandalone =
				window.matchMedia('(display-mode: standalone)').matches ||
				window.navigator.standalone === true;
		};
		const handleBeforeInstallPrompt = (event) => {
			event.preventDefault();
			deferredInstallPrompt = event;
			// Android installs via the APK download card, not the PWA prompt —
			// never show both to avoid confusing users.
			if (isAndroidOS) {
				return;
			}
			maybeShowInstallHint();
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
			maybeShowInstallHint();
		}

		window.addEventListener('online', updateNetworkState);
		window.addEventListener('offline', updateNetworkState);
		window.addEventListener('resize', updateStandaloneState);
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.addEventListener('appinstalled', handleAppInstalled);
		const connection =
			navigator.connection || navigator.mozConnection || navigator.webkitConnection;
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
		};
	});

	let activePath = $derived(page.url.pathname);
	let homeHref = $derived(localizedPath('/', $activeLanguage));
	let practiceHref = $derived(localizedPath('/practice', $activeLanguage));

	// A destination is active for its own path and any child route (the
	// practice hub and every exam below it), not for paths that merely share
	// a prefix. `exact` pins single-page entries like the Create tab.
	function isActivePath(href, { exact = false } = {}) {
		return exact ? activePath === href : activePath === href || activePath.startsWith(`${href}/`);
	}

	// Hamburger menu tiles: the same destinations as the desktop nav, paired
	// with one local icon each so the compact grid stays scannable.
	const exploreLinks = $derived([
		{ href: localizedPath('/about', $activeLanguage), icon: 'info', label: $t('about') },
		{ href: practiceHref, icon: 'target', label: $t('practiceTitle') },
		{ href: localizedPath('/blog', $activeLanguage), icon: 'book', label: $t('blog') },
		{ href: localizedPath('/faq', $activeLanguage), icon: 'note', label: $t('faq') },
		{ href: localizedPath('/contact', $activeLanguage), icon: 'mail', label: $t('contact') },
		{ href: localizedPath('/privacy', $activeLanguage), icon: 'shield', label: $t('privacy') },
		{ href: localizedPath('/terms', $activeLanguage), icon: 'scale', label: $t('terms') }
	]);

	// Social card language follows the URL-driven store the layout pins before
	// children render: English pages ship the English poster, /hi the Hindi one.
	let socialImagePath = $derived(
		$activeLanguage === 'hindi' ? '/og-cover-hi.jpg' : '/og-cover.jpg'
	);
	// Chrome-free routes: the test runner and the printable paper.
	let isImmersive = $derived(
		page.url.pathname === '/test' || page.url.pathname === '/print'
	);

	// Indexable pages get their language from the URL in +layout.js. App-shell
	// pages have no language in the URL, so follow the saved preference there.
	$effect(() => {
		const next = data?.lang ?? $language;
		if (get(activeLanguage) !== next) {
			activeLanguage.set(next);
		}
	});

	// Site-wide structured data, identical on every page.
	const siteJsonLd = jsonLdScript([
		{
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: 'selftest.in',
			url: SITE_ORIGIN,
			logo: `${SITE_ORIGIN}/icons/512.png`,
			sameAs: ['https://x.com/selftest_in'],
		},
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: 'selftest.in',
			url: SITE_ORIGIN,
			inLanguage: ['en-IN', 'hi-IN'],
		},
	]);

	$effect(() => {
		track('page:view', { route: page.url.pathname });
	});

	$effect(() => {
		if (isOffline) {
			showToast($t('offlineToastMessage'), 'warning', 4500);
		}
	});

	$effect(() => {
		if (!showInstallHint) {
			return;
		}
		const timer = window.setTimeout(() => {
			showInstallHint = false;
		}, 10000);
		// Hide once the user scrolls past the top: the sentinel sits at the
		// document top, and the expanded top root margin means it stops
		// intersecting after ~150px of scroll. No scroll listener.
		let observer;
		const sentinel = document.querySelector('.scroll-sentinel');
		if (sentinel && typeof IntersectionObserver !== 'undefined') {
			observer = new IntersectionObserver(
				([entry]) => {
					if (!entry.isIntersecting) {
						showInstallHint = false;
					}
				},
				{ rootMargin: '150px 0px 0px 0px' }
			);
			observer.observe(sentinel);
		}
		return () => {
			window.clearTimeout(timer);
			observer?.disconnect();
		};
	});

	// Close the account menu on Escape or an outside click, and hand focus back
	// to the trigger so keyboard users keep their place.
	$effect(() => {
		if (!showUserMenu) {
			return;
		}
		const handleOutsidePointer = (event) => {
			if (
				userMenuElement?.contains(event.target) ||
				userMenuTrigger?.contains(event.target)
			) {
				return;
			}
			showUserMenu = false;
		};
		const handleEscape = (event) => {
			if (event.key === 'Escape') {
				showUserMenu = false;
			}
		};
		document.addEventListener('pointerdown', handleOutsidePointer);
		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('pointerdown', handleOutsidePointer);
			document.removeEventListener('keydown', handleEscape);
			if (userMenuTrigger?.isConnected) {
				userMenuTrigger.focus({ preventScroll: true });
			}
		};
	});

	// Lock background scrolling while the sign-in dialog is open.
	$effect(() => {
		if (!showSignInModal) {
			return;
		}
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
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
		pullMoveY = event.touches[0].clientY;
		if (pullRafId) {
			return;
		}
		pullRafId = window.requestAnimationFrame(() => {
			pullRafId = 0;
			if (isImmersive || !pullStartY || window.scrollY > 0) {
				return;
			}
			const distance = pullMoveY - pullStartY;
			pullDistance = Math.max(0, Math.min(distance, 86));
		});
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
		// On indexable pages the URL is the language, so switching navigates to
		// the twin URL. App pages exist once and just flip the store.
		const current = data?.lang ?? $language;
		const next = current === 'english' ? 'hindi' : 'english';
		track('settings:language-toggle', { language: next });
		// Keep the saved preference in sync so the app stays in the language
		// the visitor just chose.
		setLanguage(next);
		const twin = languageHref(page.url.pathname, next);
		if (twin) {
			goto(twin);
		}
	}

	function toggleTheme() {
		const next = $themePreference === 'dark' ? 'light' : 'dark';
		track('settings:theme-toggle', { theme: next });
		setThemePreference(next);
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
			showToast($t('signInFailed'), 'error', 6000);
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
	{#if data?.googleSiteVerification}
		<meta name="google-site-verification" content={data.googleSiteVerification} />
	{/if}
	<meta name="author" content="selftest.in" />
	<meta property="og:site_name" content="selftest.in" />
	<meta property="og:image" content={`${SITE_ORIGIN}${socialImagePath}`} />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={$t('socialImageAlt')} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@selftest_in" />
	<meta name="twitter:image" content={`${SITE_ORIGIN}${socialImagePath}`} />
	<meta name="twitter:image:alt" content={$t('socialImageAlt')} />
	<link rel="alternate" type="application/rss+xml" title="selftest.in blog" href="/rss.xml" />
	{@html siteJsonLd}
</svelte:head>

<div class="app-shell" class:immersive-mode={isImmersive}>
	<a class="skip-link" href="#main-content">{$t('skipToMainContent')}</a>
	{#if !isImmersive}
		<header class="app-header border-bottom bg-body">
			<nav class="app-container header-inner" aria-label={$t('mainNavigation')}>
				<a class="brand-link" href={localizedPath('/', $activeLanguage)}>
					<img class="brand-mark" src="/icons/96.png" alt="" width="32" height="32" />
					<span>selftest.in</span>
				</a>

				<nav class="desktop-nav" aria-label={$t('mainNavigation')}>
					<a href={localizedPath('/about', $activeLanguage)}>{$t('about')}</a>
					<a href={localizedPath('/practice', $activeLanguage)}>{$t('practiceTitle')}</a>
					<a href={localizedPath('/blog', $activeLanguage)}>{$t('blog')}</a>
					<a href={localizedPath('/faq', $activeLanguage)}>{$t('faq')}</a>
					<a href={localizedPath('/contact', $activeLanguage)}>{$t('contact')}</a>
					<a class="create-link" href={localizedPath('/', $activeLanguage)}>{$t('createTab')}</a>
				</nav>

				<div class="header-actions">
					<button
						class="header-icon lang-toggle"
						type="button"
						aria-label={$t('switchLanguageAria')}
						onclick={toggleLanguage}
					>
						<Icon name="globe" />
					</button>
					<button
						class="header-icon"
						type="button"
						aria-label={$t('toggleThemeAria')}
						onclick={toggleTheme}
					>
						<Icon name={$themePreference === 'dark' ? 'sun' : 'moon'} />
					</button>
					<NotificationsBell />
					<a class="header-icon desktop-only" href="/history" aria-label={$t('history')}>
						<Icon name="clock" />
					</a>
					{#if $user}
						<div class="user-menu-wrap">
							<button
								class="user-chip"
								type="button"
								bind:this={userMenuTrigger}
								aria-label={$t('signedInAs')}
								aria-expanded={showUserMenu}
								aria-controls="user-menu"
								onclick={() => {
									showUserMenu = !showUserMenu;
									isMenuOpen = false;
								}}
							>
								{#if $user.pictureUrl}
									<img
										src={$user.pictureUrl}
										alt=""
										width="28"
										height="28"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<span class="user-initial"
										>{($user.name || $user.email || '?')
											.charAt(0)
											.toUpperCase()}</span
									>
								{/if}
							</button>
							{#if showUserMenu}
								<div class="user-menu" id="user-menu" bind:this={userMenuElement}>
									<div class="user-menu-header">
										<div class="fw-semibold">
											{($user.name || $user.email).slice(0, 40)}
										</div>
										<div class="small text-muted">{$t('signedInAs')}</div>
									</div>
									<a href="/history" onclick={() => (showUserMenu = false)}
										><Icon name="clock" size={18} /> {$t('history')}</a
									>
									<button type="button" onclick={handleSignOut}
										><Icon name="logout" size={18} /> {$t('signOut')}</button
									>
								</div>
							{/if}
						</div>
					{:else if !$isAuthLoading}
						<button
							class="header-icon sign-in-control"
							type="button"
							aria-label={$t('signIn')}
							onclick={() => (showSignInModal = true)}
						>
							<Icon name="login" />
						</button>
					{/if}
					<button
						class="header-icon menu-control"
						type="button"
						aria-label={$t('toggleMenu')}
						aria-expanded={isMenuOpen}
						aria-controls="mobile-nav-menu"
						onclick={() => (isMenuOpen = !isMenuOpen)}
					>
						<Icon name={isMenuOpen ? 'close' : 'menu'} size={22} />
					</button>
				</div>
			</nav>

			{#if isMenuOpen}
				<nav class="mobile-menu" id="mobile-nav-menu" aria-label={$t('navigationMenu')}>
					{#if $user}
						<div class="menu-user">
							<span class="menu-user-initial"
								>{($user.name || $user.email || '?').charAt(0).toUpperCase()}</span
							>
							<span class="menu-user-name">{$user.name || $user.email}</span>
						</div>
					{/if}
					<div class="menu-section-label">{$t('menuSectionExplore')}</div>
					<div class="menu-grid">
						{#each exploreLinks as link (link.href)}
							<a
								class="menu-tile"
								class:active={isActivePath(link.href)}
								href={link.href}
								aria-current={isActivePath(link.href) ? 'page' : undefined}
								onclick={() => (isMenuOpen = false)}
							>
								<Icon name={link.icon} size={18} />
								<span class="menu-tile-label">{link.label}</span>
							</a>
						{/each}
					</div>
					<div class="menu-section-label">{$t('menuSectionActions')}</div>
					<div class="menu-actions">
						{#if $user}
							<a
								class="menu-action"
								class:active={activePath === '/profile'}
								href="/profile"
								aria-current={activePath === '/profile' ? 'page' : undefined}
								onclick={() => (isMenuOpen = false)}
							>
								<Icon name="user" size={18} />{$t('profileMenuLabel')}
							</a>
						{/if}
						<a
							class="menu-action"
							class:active={activePath === '/history'}
							href="/history"
							aria-current={activePath === '/history' ? 'page' : undefined}
							onclick={() => (isMenuOpen = false)}
						>
							<Icon name="clock" size={18} />{$t('history')}
						</a>
						{#if $user}
							<button
								type="button"
								class="menu-action menu-signout"
								onclick={() => {
									isMenuOpen = false;
									void handleSignOut();
								}}
							>
								<Icon name="logout" size={18} />{$t('signOut')}
							</button>
						{:else if !$isAuthLoading}
							<button
								type="button"
								class="menu-action"
								onclick={() => {
									isMenuOpen = false;
									showSignInModal = true;
								}}
							>
								<Icon name="login" size={18} />{$t('signIn')}
							</button>
						{/if}
					</div>
				</nav>
			{/if}
		</header>
	{/if}

	{#if isOffline}
		<div class="connection-banner offline-banner" role="alert">
			{$t('offlineQuizzesAvailable')}
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
				<button
					class="btn btn-sm btn-primary"
					type="button"
					disabled={isInstalling}
					onclick={installApp}
				>
					{isInstalling
						? $t('preparing')
						: deferredInstallPrompt
							? $t('installNow')
							: $t('openInstallGuide')}
				</button>
				<button
					class="btn btn-sm btn-outline-secondary"
					type="button"
					onclick={dismissInstallHint}
				>
					{$t('later')}
				</button>
			</div>
		</section>
	{/if}

	{#if pullDistance > 8}
		<div
			class="pull-indicator"
			style={`transform: translateY(${Math.min(pullDistance - 44, 0)}px);`}
		>
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
		<div class="scroll-sentinel" aria-hidden="true"></div>
		{@render children()}
	</main>

	{#if !isImmersive}
		<nav class="bottom-nav border-top bg-body" aria-label={$t('mobileNavigation')}>
			<a
				class:active={isActivePath(homeHref, { exact: true })}
				href={homeHref}
				aria-current={isActivePath(homeHref, { exact: true }) ? 'page' : undefined}
				><Icon name="home" size={18} /><span class="tab-label">{$t('homeTab')}</span></a
			>
			<a
				class:active={isActivePath(practiceHref)}
				href={practiceHref}
				aria-current={isActivePath(practiceHref) ? 'page' : undefined}
				><Icon name="target" size={18} /><span class="tab-label">{$t('practiceTab')}</span></a
			>
			<a class="create-tab" href={homeHref}
				><Icon name="plus" size={20} /><span class="tab-label">{$t('createTab')}</span></a
			>
			<a
				class:active={activePath === '/bookmarks'}
				href="/bookmarks"
				aria-current={activePath === '/bookmarks' ? 'page' : undefined}
				><Icon name="bookmark" size={18} /><span class="tab-label">{$t('bookmarksTab')}</span></a
			>
			<a
				class:active={activePath === '/history'}
				href="/history"
				aria-current={activePath === '/history' ? 'page' : undefined}
				><Icon name="clock" size={18} /><span class="tab-label">{$t('historyTab')}</span></a
			>
		</nav>
	{/if}

	{#if !isImmersive}
		<footer class="site-footer border-top bg-body">
			<div class="app-container footer-inner">
				<a class="brand-link" href={localizedPath('/', $activeLanguage)}>
					<img class="brand-mark" src="/icons/96.png" alt="" width="32" height="32" />
					<span>selftest.in</span>
				</a>
				<p class="footer-tagline small text-muted">{$t('footerTagline')}</p>
				<nav class="footer-links" aria-label={$t('footerNav')}>
					<a href={localizedPath('/about', $activeLanguage)}>{$t('about')}</a>
					<a href={localizedPath('/practice', $activeLanguage)}>{$t('practiceTitle')}</a>
					<a href={localizedPath('/blog', $activeLanguage)}>{$t('blog')}</a>
					<a href={localizedPath('/faq', $activeLanguage)}>{$t('faq')}</a>
					<a href={localizedPath('/contact', $activeLanguage)}>{$t('contact')}</a>
					<a href={localizedPath('/privacy', $activeLanguage)}>{$t('privacy')}</a>
					<a href={localizedPath('/terms', $activeLanguage)}>{$t('terms')}</a>
				</nav>
				<p class="footer-copy small text-muted">
					© {new Date().getFullYear()} selftest.in · {$t('allRightsReserved')}
				</p>
			</div>
		</footer>
	{/if}

	{#if $toast}
		{#key $toast.id}
			<Toast entry={$toast} />
		{/key}
	{/if}

	{#if showSignInModal}
		<button
			type="button"
			class="modal-backdrop"
			aria-label={$t('close')}
			tabindex="-1"
			onclick={() => (showSignInModal = false)}
		></button>
		<div
			class="sign-in-modal"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label={$t('signInTitle')}
			use:focusTrap={{ onEscape: () => (showSignInModal = false) }}
		>
			<button
				class="modal-close"
				type="button"
				aria-label={$t('close')}
				onclick={() => (showSignInModal = false)}
			>
				<Icon name="close" size={22} />
			</button>
			<div class="h5 fw-bold mb-1">{$t('signInTitle')}</div>
			<p class="text-muted small">{$t('signInBody')}</p>
			{#if isSigningIn}
				<div class="text-center py-3 text-muted">{$t('signingIn')}</div>
			{:else}
				<div class="d-flex justify-content-center py-2">
					<GoogleSignInButton onCredential={handleGoogleCredential} disabled={false} />
				</div>
			{/if}
			<p class="small text-muted mt-2 mb-0">{$t('signInAnonymousNote')}</p>
		</div>
	{/if}
</div>

<style>
	.app-shell {
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--surface-muted);
		color: var(--text);
	}

	.scroll-sentinel {
		height: 1px;
		margin-bottom: -1px;
	}

	.skip-link {
		position: fixed;
		top: -48px;
		left: max(12px, var(--sal));
		z-index: var(--z-skip);
		padding: 8px 12px;
		border-radius: 0 0 var(--radius-control) var(--radius-control);
		background: var(--color-brand-600);
		color: var(--on-brand);
		font-weight: 700;
		text-decoration: none;
	}

	.skip-link:focus {
		top: 0;
	}

	.app-header {
		position: sticky;
		top: 0;
		/* Installed PWA / Capacitor: keep the header content below the
		   status bar. --sat comes from env() (iOS) or the injected
		   --safe-area-inset-* (Android WebView). */
		padding-top: var(--sat, env(safe-area-inset-top, 0px));
		z-index: var(--z-header);
	}

	.header-inner {
		display: flex;
		min-height: 58px;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding-block: 6px;
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
		color: var(--brand-text);
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
		flex: none;
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
	.header-icon:focus-visible {
		background: color-mix(in srgb, var(--color-brand-600) 13%, transparent);
		color: var(--brand-text);
	}

	.desktop-only {
		display: none;
	}

	.mobile-menu {
		display: grid;
		gap: 2px;
		/* Bounded so a long menu can never be clipped by the sticky header:
		   every row stays reachable through scrolling. */
		max-height: calc(100vh - 58px - var(--sat, env(safe-area-inset-top, 0px)));
		max-height: calc(100dvh - 58px - var(--sat, env(safe-area-inset-top, 0px)));
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-block: 8px 14px;
		padding-inline: max(20px, var(--sal)) max(20px, var(--sar));
		border-top: 1px solid var(--line);
		background: var(--surface);
	}

	.menu-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.menu-tile-label {
		min-width: 0;
		line-height: 1.2;
	}

	.menu-actions {
		display: grid;
		gap: 2px;
	}

	.menu-action {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.mobile-menu a.active {
		color: var(--brand-text);
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
		color: var(--brand-text);
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

	.menu-grid .menu-tile {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
	}

	.menu-tile.active {
		border-color: var(--brand-text);
		background: color-mix(in srgb, var(--color-brand-600) 10%, transparent);
	}

	.mobile-menu a:hover,
	.mobile-menu button:hover {
		color: var(--brand-text);
	}

	.menu-grid .menu-tile:hover {
		border-color: var(--brand-text);
	}

	.menu-signout {
		color: var(--text-muted);
	}

	.mobile-main {
		min-height: calc(100vh - 58px);
		min-height: calc(100dvh - 58px);
		padding-bottom: calc(80px + var(--sab, env(safe-area-inset-bottom, 0px)));
	}

	.immersive-mode .mobile-main {
		min-height: 100vh;
		min-height: 100dvh;
		padding-bottom: 0;
	}

	.immersive-mode .app-header,
	.immersive-mode .bottom-nav,
	.immersive-mode .site-footer {
		display: none;
	}

	.site-footer {
		display: block;
	}

	.footer-inner {
		display: grid;
		gap: 12px;
		padding-block: 28px;
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
		display: inline-flex;
		align-items: center;
		/* 44px tap target. These measured ~37.6px before (0.9rem text plus 8px
	   padding), the only sub-44px control left in the shell. */
		min-height: 44px;
		padding: 8px 0;
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
	}

	.footer-links a:hover {
		color: var(--brand-text);
	}

	.footer-copy {
		margin: 4px 0 0;
	}

	.bottom-nav {
		position: fixed;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: var(--z-bottom-nav);
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		padding-block: 0 calc(6px + var(--sab, env(safe-area-inset-bottom, 0px)));
		padding-inline: max(8px, var(--sal)) max(8px, var(--sar));
	}

	:global(html.keyboard-open) .bottom-nav {
		display: none;
	}

	.bottom-nav a {
		display: flex;
		min-width: 0;
		min-height: 48px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 2px;
		padding-inline: 0;
		color: inherit;
		border: 0;
		background: transparent;
		font-size: 0.74rem;
		text-decoration: none;
	}

	.bottom-nav a.active,
	.bottom-nav a:focus-visible {
		color: var(--brand-text);
		font-weight: 700;
	}

	.tab-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.create-tab {
		color: var(--brand-text) !important;
		font-weight: 700;
	}

	:global(.dark) .bottom-nav a.active,
	:global(.dark) .bottom-nav a:focus-visible,
	:global(.dark) .create-tab {
		color: var(--color-brand-100) !important;
	}

	.connection-banner {
		position: sticky;
		/* 58px header + its safe-area padding. */
		top: calc(58px + var(--sat, env(safe-area-inset-top, 0px)));
		z-index: var(--z-banner);
		display: flex;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding-block: 8px;
		padding-inline: max(16px, var(--sal)) max(16px, var(--sar));
		color: var(--on-brand);
		font-size: 0.9rem;
		font-weight: 600;
		text-align: center;
	}

	.offline-banner {
		background: var(--warn-fill);
	}

	.pwa-install-hint {
		position: fixed;
		right: max(12px, var(--sar));
		bottom: calc(76px + var(--sab, env(safe-area-inset-bottom, 0px)));
		left: max(12px, var(--sal));
		z-index: var(--z-header);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		box-shadow: var(--shadow-2);
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
		color: var(--brand-text);
		font-weight: 700;
	}

	.user-menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: var(--z-dropdown);
		min-width: 220px;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: var(--shadow-2);
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
		border-radius: var(--radius-control);
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
		color: var(--brand-text);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal-backdrop);
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: var(--backdrop);
	}

	.sign-in-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: var(--z-modal);
		translate: -50% -50%;
		width: calc(100% - 40px);
		max-width: 400px;
		padding: 22px 20px 18px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: var(--shadow-2);
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
		top: calc(58px + var(--sat, env(safe-area-inset-top, 0px)));
		left: 50%;
		z-index: var(--z-overlay);
		min-height: 34px;
		padding: 7px 14px;
		border-radius: 999px;
		background: var(--color-brand-600);
		color: var(--on-brand);
		font-size: 0.8rem;
		font-weight: 700;
		box-shadow: var(--shadow-2);
		translate: -50% 0;
	}

	/* Tablet (768–1023) keeps the hamburger: the full nav plus five 44px
	   actions does not fit at 768–900 without shrinking tap targets. The
	   full desktop nav returns at 1024 where there is room. */
	@media (min-width: 768px) {
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
			right: max(24px, var(--sar));
			bottom: 24px;
			left: auto;
			max-width: 440px;
		}
	}

	@media (min-width: 1024px) {
		.desktop-nav,
		.desktop-only {
			display: inline-flex;
		}

		.desktop-nav {
			display: flex;
		}

		.menu-control,
		.mobile-menu {
			display: none;
		}
	}

	/* Phones keep the fixed bottom bar; bound the menu above it so its last
	   row is never hidden behind the bar. */
	@media (max-width: 767.98px) {
		.mobile-menu {
			max-height: calc(
				100vh - 58px - var(--sat, env(safe-area-inset-top, 0px)) - 62px -
					var(--sab, env(safe-area-inset-bottom, 0px))
			);
			max-height: calc(
				100dvh - 58px - var(--sat, env(safe-area-inset-top, 0px)) - 62px -
					var(--sab, env(safe-area-inset-bottom, 0px))
			);
		}
	}

	/* The documented tablet rung is 640; 576 is a one-off breakpoint and the
	   design system forbids adding one. */
	@media (max-width: 639.98px) {
		.pwa-install-hint {
			align-items: flex-start;
			flex-direction: column;
		}
	}

	/* Documented exception to the no-one-off-breakpoints rule: 320px-class
	   phones, which are below any documented rung. Widening this to the
	   `small phone` (<480) boundary would drop the wordmark on a 390px
	   screen, which is the common case, not the narrow one. */
	@media (max-width: 359.98px) {
		.brand-link span {
			display: none;
		}

		/* Five tabs at 320px: keep every label on one line. 0.72rem is the
		   documented `.text-micro` step; this was 0.68rem (10.9px), which
		   reads below the floor for a label on an interactive control. */
		.bottom-nav a {
			font-size: 0.72rem;
		}
	}
</style>
