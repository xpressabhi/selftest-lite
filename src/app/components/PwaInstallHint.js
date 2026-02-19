'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';

const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const getDeviceInfo = () => {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return { isMobile: false, isIos: false };
	}
	const userAgent = (navigator.userAgent || '').toLowerCase();
	const isIos = /iphone|ipad|ipod/.test(userAgent);
	const isMobileUserAgent = /android|iphone|ipad|ipod|mobile/.test(userAgent);
	const isSmallViewport = window.matchMedia('(max-width: 1023px)').matches;

	return {
		isMobile: isMobileUserAgent || isSmallViewport,
		isIos,
	};
};

export default function PwaInstallHint({ isStandalone = false }) {
	const { t } = useLanguage();
	const [isMobile, setIsMobile] = useState(false);
	const [isIos, setIsIos] = useState(false);
	const [dismissedAt, setDismissedAt] = useState(0);
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [isInstalling, setIsInstalling] = useState(false);
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const savedDismissedAt = Number(
			window.localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT) || 0,
		);
		setDismissedAt(Number.isFinite(savedDismissedAt) ? savedDismissedAt : 0);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;

		const updateDeviceInfo = () => {
			const info = getDeviceInfo();
			setIsMobile(info.isMobile);
			setIsIos(info.isIos);
		};

		updateDeviceInfo();
		window.addEventListener('resize', updateDeviceInfo);
		window.addEventListener('orientationchange', updateDeviceInfo);

		return () => {
			window.removeEventListener('resize', updateDeviceInfo);
			window.removeEventListener('orientationchange', updateDeviceInfo);
		};
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;

		const onBeforeInstallPrompt = (event) => {
			event.preventDefault();
			setDeferredPrompt(event);
		};

		const onAppInstalled = () => {
			setDeferredPrompt(null);
			setIsInstalling(false);
			setDismissedAt(0);
			window.localStorage.removeItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT);
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onAppInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onAppInstalled);
		};
	}, []);

	const isDismissedRecently = useMemo(
		() => dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_WINDOW_MS,
		[dismissedAt],
	);

	const canShowInstallHint = useMemo(
		() =>
			isMounted &&
			isMobile &&
			!isStandalone &&
			!isDismissedRecently &&
			(Boolean(deferredPrompt) || isIos),
		[deferredPrompt, isDismissedRecently, isIos, isMobile, isMounted, isStandalone],
	);

	const handleDismiss = useCallback(() => {
		if (typeof window === 'undefined') return;
		const now = Date.now();
		setDismissedAt(now);
		window.localStorage.setItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED_AT, String(now));
	}, []);

	const handleInstall = useCallback(async () => {
		if (!deferredPrompt) return;
		setIsInstalling(true);
		try {
			await deferredPrompt.prompt();
			const result = await deferredPrompt.userChoice;
			if (result?.outcome !== 'accepted') {
				handleDismiss();
			}
		} catch (_error) {
			handleDismiss();
		} finally {
			setDeferredPrompt(null);
			setIsInstalling(false);
		}
	}, [deferredPrompt, handleDismiss]);

	if (!canShowInstallHint) return null;

	return (
		<div className='pwa-install-hint' role='status' aria-live='polite'>
			<div className='hint-icon' aria-hidden='true'>
				<Icon name='zap' size={14} />
			</div>
			<div className='hint-content'>
				<p className='hint-title'>{t('installAppPromptTitle')}</p>
				<p className='hint-description'>
					{isIos ? t('installAppPromptIosBody') : t('installAppPromptBody')}
				</p>
				<div className='hint-actions'>
					{!isIos && deferredPrompt && (
						<button
							type='button'
							className='hint-install-btn'
							onClick={handleInstall}
							disabled={isInstalling}
						>
							{isInstalling ? t('preparing') : t('installNow')}
						</button>
					)}
					<button type='button' className='hint-dismiss-btn' onClick={handleDismiss}>
						{t('later')}
					</button>
				</div>
			</div>
			<style jsx>{`
				.pwa-install-hint {
					display: flex;
					align-items: flex-start;
					gap: 10px;
					padding: 10px 12px;
					margin-bottom: 12px;
					background: var(--bg-primary);
					border: 1px solid var(--border-color);
					border-radius: var(--radius-md);
				}

				.hint-icon {
					width: 22px;
					height: 22px;
					display: inline-flex;
					align-items: center;
					justify-content: center;
					border-radius: 999px;
					background: rgba(99, 102, 241, 0.12);
					color: var(--accent-primary);
					flex-shrink: 0;
					margin-top: 1px;
				}

				.hint-content {
					flex: 1;
					min-width: 0;
				}

				.hint-title {
					margin: 0 0 2px;
					font-size: 0.84rem;
					font-weight: 700;
					color: var(--text-primary);
					line-height: 1.2;
				}

				.hint-description {
					margin: 0;
					font-size: 0.78rem;
					color: var(--text-secondary);
					line-height: 1.35;
				}

				.hint-actions {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-top: 8px;
				}

				.hint-install-btn,
				.hint-dismiss-btn {
					min-height: 32px;
					padding: 6px 10px;
					border-radius: var(--radius-sm);
					font-size: 0.78rem;
					font-weight: 600;
					cursor: pointer;
					border: 1px solid transparent;
				}

				.hint-install-btn {
					background: var(--accent-primary);
					color: white;
					border-color: var(--accent-primary);
				}

				.hint-install-btn:disabled {
					opacity: 0.7;
					cursor: default;
				}

				.hint-dismiss-btn {
					background: transparent;
					color: var(--text-secondary);
					border-color: var(--border-color);
				}

				@media (min-width: 1024px) {
					.pwa-install-hint {
						display: none;
					}
				}
			`}</style>
		</div>
	);
}
