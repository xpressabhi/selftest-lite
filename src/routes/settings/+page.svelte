<script>
	import { onMount } from 'svelte';
	import { activeLanguage, t } from '$lib/client/i18n';
	import { linkGoogleCredential, unlinkGoogle, user } from '$lib/client/auth';
	import GoogleSignInButton from '$lib/client/GoogleSignInButton.svelte';
	import {
		addPasskeyToAccount,
		fetchPasskeys,
		isPasskeySupported,
		passkeyErrorKey,
		removePasskey
	} from '$lib/client/passkeys';
	import { track } from '$lib/client/telemetry';

	// Sign-in methods live here rather than in the profile: they are account
	// security, not learner details. Nothing on this page deletes the account —
	// disconnecting Google clears the identity, and removing a passkey archives
	// the credential — and the last remaining way in cannot be removed at all.

	let loaded = $state(false);
	let lastUserId = $state(null);
	let passkeys = $state([]);
	let passkeysLoading = $state(false);
	let googleLinked = $state(false);
	let googleEmail = $state('');
	let passkeySupported = $state(false);
	let busy = $state('');
	let pendingRemoveId = $state(null);
	let confirmUnlink = $state(false);
	let errorKey = $state('');
	let noticeKey = $state('');

	/** Ways into the account: every passkey plus a connected Google identity. */
	const loginMethodCount = $derived(passkeys.length + (googleLinked ? 1 : 0));
	const removalBlocked = $derived(loginMethodCount <= 1);

	$effect(() => {
		const userId = $user?.id || null;
		if (userId === lastUserId) {
			return;
		}
		lastUserId = userId;
		if (!userId) {
			loaded = false;
			passkeys = [];
			googleLinked = false;
			googleEmail = '';
			return;
		}
		loaded = true;
		void loadSignInMethods();
	});

	onMount(() => {
		passkeySupported = isPasskeySupported();
	});

	async function loadSignInMethods() {
		passkeysLoading = true;
		errorKey = '';
		try {
			const result = await fetchPasskeys();
			passkeys = result.passkeys;
			googleLinked = result.googleLinked;
			googleEmail = result.googleEmail || '';
		} catch (error) {
			const key = passkeyErrorKey(error);
			if (key) {
				errorKey = key;
			}
		} finally {
			passkeysLoading = false;
		}
	}

	function formatDate(value) {
		if (!value) {
			return '';
		}
		return new Date(value).toLocaleDateString($activeLanguage === 'hindi' ? 'hi-IN' : 'en-IN', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function handleAddPasskey() {
		busy = 'add';
		errorKey = '';
		noticeKey = '';
		try {
			await addPasskeyToAccount({ language: $activeLanguage });
			await loadSignInMethods();
			noticeKey = 'settingsPasskeyAdded';
		} catch (error) {
			const key = passkeyErrorKey(error);
			if (key) {
				errorKey = key;
			}
		} finally {
			busy = '';
		}
	}

	/** Two-step confirm: the first tap arms the second, so no native dialog. */
	async function handleRemovePasskey(passkeyId) {
		if (pendingRemoveId !== passkeyId) {
			pendingRemoveId = passkeyId;
			errorKey = '';
			return;
		}

		pendingRemoveId = null;
		busy = 'remove';
		errorKey = '';
		noticeKey = '';
		try {
			await removePasskey(passkeyId);
			await loadSignInMethods();
			noticeKey = 'settingsPasskeyRemoved';
		} catch (error) {
			const key = passkeyErrorKey(error);
			if (key) {
				errorKey = key;
			}
		} finally {
			busy = '';
		}
	}

	async function handleUnlinkGoogle() {
		if (!confirmUnlink) {
			confirmUnlink = true;
			errorKey = '';
			return;
		}

		confirmUnlink = false;
		busy = 'unlink';
		errorKey = '';
		noticeKey = '';
		try {
			await unlinkGoogle();
			track('auth:google-unlink');
			await loadSignInMethods();
			noticeKey = 'settingsGoogleDisconnected';
		} catch (error) {
			errorKey = passkeyErrorKey(error);
		} finally {
			busy = '';
		}
	}

	async function handleLinkGoogle(credential) {
		busy = 'link';
		errorKey = '';
		noticeKey = '';
		try {
			await linkGoogleCredential(credential);
			track('auth:passkey-link-google');
			await loadSignInMethods();
			noticeKey = 'settingsGoogleConnected';
		} catch (error) {
			errorKey = passkeyErrorKey(error);
		} finally {
			busy = '';
		}
	}
</script>

<svelte:head>
	<title>{$t('settingsTitle')} | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="app-container py-4 py-md-5">
	<div class="settings-wrap">
		<h1 class="text-page mb-3">{$t('settingsTitle')}</h1>

		{#if !$user}
			<div class="panel text-center">
				<p class="text-muted mb-3">{$t('settingsSignInHint')}</p>
				<div class="d-flex justify-content-center">
					<GoogleSignInButton onCredential={handleLinkGoogle} disabled={busy === 'link'} />
				</div>
				<p class="text-muted small mt-3 mb-0">{$t('signInAnonymousNote')}</p>
			</div>
		{:else if loaded}
			<section class="panel" aria-labelledby="sign-in-methods-heading">
				<h2 class="h6 fw-bold mb-1" id="sign-in-methods-heading">
					{$t('settingsSignInTitle')}
				</h2>
				<p class="text-muted small mb-3">{$t('settingsSignInBody')}</p>

				{#if errorKey}
					<div class="alert alert-danger small" role="alert">{$t(errorKey)}</div>
				{/if}
				{#if noticeKey}
					<div class="alert alert-success small" role="status">{$t(noticeKey)}</div>
				{/if}

				<div class="sign-in-method">
					<div>
						<div class="fw-semibold small">{$t('settingsGoogleLabel')}</div>
						<div class="text-muted small">
							{#if googleLinked}
								{$t('settingsGoogleConnected', { email: googleEmail || $user.email || '' })}
							{:else}
								{$t('settingsGoogleNotConnected')}
							{/if}
						</div>
					</div>
					{#if googleLinked}
						<button
							type="button"
							class="btn btn-sm btn-outline-danger"
							disabled={busy !== '' || removalBlocked}
							onclick={handleUnlinkGoogle}
						>
							{confirmUnlink
								? $t('settingsGoogleDisconnectConfirm')
								: $t('settingsGoogleDisconnect')}
						</button>
					{/if}
				</div>

				{#if googleLinked && confirmUnlink}
					<p class="text-muted small mt-2 mb-0" role="note">
						{$t('settingsGoogleDisconnectWarning')}
					</p>
				{/if}

				{#if !googleLinked}
					<p class="text-muted small mt-3 mb-2">{$t('passkeyLinkGoogleHint')}</p>
					<div class="d-flex justify-content-center">
						<GoogleSignInButton onCredential={handleLinkGoogle} disabled={busy === 'link'} />
					</div>
				{/if}

				<hr class="my-4" />

				<h3 class="h6 fw-bold mb-2">{$t('passkeysTitle')}</h3>
				<p class="text-muted small mb-3">{$t('passkeysBody')}</p>

				{#if passkeysLoading}
					<p class="text-muted small mb-0">{$t('loading')}</p>
				{:else if passkeys.length === 0}
					<p class="text-muted small mb-0">{$t('passkeysEmpty')}</p>
				{:else}
					<ul class="list-unstyled mb-0">
						{#each passkeys as passkey (passkey.id)}
							<li class="sign-in-method passkey-row">
								<div>
									<div class="fw-semibold small">
										{passkey.label || $t('passkeyUnknownDevice')}
									</div>
									<div class="text-muted small">
										{$t('passkeyAddedOn')}
										{formatDate(passkey.createdAt)}
										{#if passkey.lastUsedAt}
											· {$t('passkeyLastUsed')}
											{formatDate(passkey.lastUsedAt)}
										{:else}
											· {$t('passkeyNeverUsed')}
										{/if}
									</div>
								</div>
								<button
									type="button"
									class="btn btn-sm btn-outline-danger"
									disabled={busy !== '' || removalBlocked}
									onclick={() => handleRemovePasskey(passkey.id)}
								>
									{pendingRemoveId === passkey.id
										? $t('passkeyRemoveConfirm')
										: $t('passkeyRemove')}
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if passkeySupported}
					<button
						type="button"
						class="btn btn-outline-primary btn-sm mt-3"
						disabled={busy !== ''}
						onclick={handleAddPasskey}
					>
						{busy === 'add'
							? $t('passkeyWorking')
							: passkeys.length > 0
								? $t('passkeyAddAnother')
								: $t('passkeyAdd')}
					</button>
					{#if passkeys.length > 0}
						<p class="text-muted small mt-2 mb-0">{$t('passkeyAddAnotherHint')}</p>
					{/if}
				{/if}

				{#if removalBlocked}
					<p class="text-muted small mt-3 mb-0" role="note">{$t('signInLastMethod')}</p>
				{/if}
				<p class="text-muted small mt-2 mb-0">{$t('settingsNeverDeleted')}</p>
			</section>
		{/if}
	</div>
</section>

<style>
	.settings-wrap {
		max-width: 640px;
		margin: 0 auto;
	}

	.sign-in-method {
		display: flex;
		min-height: 44px;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border-bottom: 1px solid var(--line);
		padding: 10px 0;
	}

	.sign-in-method:last-child {
		border-bottom: 0;
	}
</style>
