'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
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
		const existingScript = document.querySelector(
			`script[src="${GOOGLE_SCRIPT_SRC}"]`,
		);
		if (existingScript) {
			if (window.google?.accounts?.id || existingScript.dataset.loaded === 'true') {
				resolve();
				return;
			}
			existingScript.addEventListener('load', () => resolve(), {
				once: true,
			});
			existingScript.addEventListener(
				'error',
				() => reject(new Error('Failed to load Google Sign-In script')),
				{ once: true },
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
		script.onerror = () =>
			reject(new Error('Failed to load Google Sign-In script'));
		document.head.appendChild(script);
	});

	return googleScriptPromise;
}

export default function GoogleSignInButton({
	onCredential,
	disabled = false,
	className = '',
}) {
	const { t, language } = useLanguage();
	const { theme } = useTheme();
	const buttonRef = useRef(null);
	const [status, setStatus] = useState('idle');
	const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

	const handleCredential = useCallback(
		(response) => {
			if (!response?.credential) {
				return;
			}
			Promise.resolve(onCredential(response.credential)).catch((error) => {
				console.error('Google credential handler failed:', error);
			});
		},
		[onCredential],
	);

	useEffect(() => {
		if (!googleClientId) {
			setStatus('error');
			return;
		}

		let mounted = true;
		setStatus('loading');
		loadGoogleScript()
			.then(() => {
				if (!mounted) {
					return;
				}
				setStatus('ready');
			})
			.catch((error) => {
				console.error(error);
				if (mounted) {
					setStatus('error');
				}
			});

		return () => {
			mounted = false;
		};
	}, [googleClientId]);

	useEffect(() => {
		if (
			disabled ||
			status !== 'ready' ||
			!googleClientId ||
			!buttonRef.current ||
			typeof window === 'undefined' ||
			!window.google?.accounts?.id
		) {
			return;
		}

		const locale = language === 'hindi' ? 'hi' : 'en';
		buttonRef.current.innerHTML = '';

		window.google.accounts.id.initialize({
			client_id: googleClientId,
			callback: handleCredential,
			auto_select: false,
			cancel_on_tap_outside: true,
		});

		window.google.accounts.id.renderButton(buttonRef.current, {
			type: 'standard',
			theme: theme === 'dark' ? 'filled_black' : 'outline',
			size: 'large',
			shape: 'pill',
			text: 'signin_with',
			logo_alignment: 'left',
			locale,
			width: 280,
		});
	}, [disabled, googleClientId, handleCredential, language, status, theme]);

	if (status === 'error') {
		return (
			<div className='small text-muted'>
				{googleClientId ? t('googleLoginUnavailable') : t('googleClientMissing')}
			</div>
		);
	}

	return (
		<div
			ref={buttonRef}
			className={className}
			aria-label={t('signInWithGoogle')}
			aria-disabled={disabled}
		/>
	);
}
