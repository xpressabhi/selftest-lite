<script>
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { t } from '$lib/client/i18n';
	import { language } from '$lib/client/preferences';
	import { isNativeApp } from '$lib/client/auth';
	import { resolveGoogleClientId } from '$lib/shared/googleAuth';

	const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
	const googleClientId = resolveGoogleClientId(env.PUBLIC_GOOGLE_CLIENT_ID);

	let { onCredential, oncredential, disabled = false } = $props();
	const credentialCallback = $derived(onCredential || oncredential || null);
	let buttonRef = $state(null);
	let status = $state('idle');
	let googleScriptPromise = null;

	function loadGoogleScript() {
		if (typeof window === 'undefined') {
			return Promise.reject(new Error('window is unavailable'));
		}
		if (window.google?.accounts?.id) {
			return Promise.resolve();
		}
		if (googleScriptPromise) {
			return googleScriptPromise;
		}

		googleScriptPromise = new Promise((resolve, reject) => {
			const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
			if (existingScript) {
				if (window.google?.accounts?.id || existingScript.dataset.loaded === 'true') {
					resolve();
					return;
				}
				existingScript.addEventListener('load', () => resolve(), { once: true });
				existingScript.addEventListener(
					'error',
					() => reject(new Error('Failed to load Google Sign-In script')),
					{ once: true }
				);
				return;
			}

			const script = document.createElement('script');
			script.src = GOOGLE_SCRIPT_SRC;
			script.async = true;
			script.defer = true;
			script.onload = () => {
				script.dataset.loaded = 'true';
				resolve();
			};
			script.onerror = () => reject(new Error('Failed to load Google Sign-In script'));
			document.head.appendChild(script);
		});

		return googleScriptPromise;
	}

	function handleCredential(response) {
		if (!response?.credential) {
			return;
		}
		if (typeof credentialCallback !== 'function') {
			console.error(
				'GoogleSignInButton: missing onCredential prop — sign-in callback will not run.'
			);
			return;
		}
		Promise.resolve(credentialCallback(response.credential)).catch((error) => {
			console.error('Google credential handler failed:', error);
		});
	}

	onMount(() => {
		if (!googleClientId) {
			status = 'error';
			return;
		}

		status = 'loading';
		loadGoogleScript()
			.then(() => {
				status = 'ready';
			})
			.catch((error) => {
				console.error(error);
				status = 'error';
			});
	});

	$effect(() => {
		if (
			disabled ||
			status !== 'ready' ||
			!googleClientId ||
			!buttonRef ||
			typeof window === 'undefined' ||
			!window.google?.accounts?.id
		) {
			return;
		}

		const locale = $language === 'hindi' ? 'hi' : 'en';
		const container = buttonRef;
		container.innerHTML = '';

		// The Capacitor Android app loads this site in a WebView where popup
		// sign-in is unreliable; full-page redirect works there. In redirect
		// mode GSI uses `login_uri` (defaults to the current page URL when
		// omitted), so we pin it to a dedicated server endpoint that must be
		// registered as an authorized redirect URI in Google Cloud Console.
		// The URI must be absolute — Google rejects relative login_uris.
		const useRedirectMode = isNativeApp;

		window.google.accounts.id.initialize({
			client_id: googleClientId,
			callback: handleCredential,
			auto_select: false,
			cancel_on_tap_outside: true,
			...(useRedirectMode
				? {
						ux_mode: 'redirect',
						login_uri: window.location.origin + '/auth/redirect',
					}
				: {}),
		});

		window.google.accounts.id.renderButton(container, {
			type: 'standard',
			theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
			size: 'large',
			shape: 'pill',
			text: 'signin_with',
			logo_alignment: 'left',
			locale,
			width: 280,
		});
	});
</script>

{#if status === 'error'}
	<div class="auth-google-error">
		{googleClientId ? $t('googleLoginUnavailable') : $t('googleClientMissing')}
	</div>
{:else}
	<div
		bind:this={buttonRef}
		class="google-sign-in-button"
		role="button"
		aria-label={$t('signInWithGoogle')}
		aria-disabled={disabled || status !== 'ready'}
	></div>
{/if}

<style>
	.google-sign-in-button {
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.auth-google-error {
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
	}
</style>
