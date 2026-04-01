'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';
import { APP_EVENTS } from '../constants';

/**
 * Bottom Navigation Component
 * Mobile-optimized navigation bar with icon-only tabs
 * - Fixed position at bottom
 * - 5 main navigation items
 * - Active state highlighting
 * - Safe area support for notched devices
 */
export default function BottomNav() {
	const pathname = usePathname();
	const router = useRouter();
	const navRef = useRef(null);
	const pressTimeoutRef = useRef(null);
	const [pressedKey, setPressedKey] = useState(null);
	const { t } = useLanguage();

	const openSearch = () => {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new Event(APP_EVENTS.OPEN_SEARCH));
	};

	const openCreate = () => {
		if (typeof window === 'undefined') return;
		if (pathname === '/') {
			window.dispatchEvent(new Event(APP_EVENTS.OPEN_CREATE_TEST));
			return;
		}
		router.push('/?start=create');
	};

	const navItems = [
		{ key: 'home', type: 'link', href: '/', label: t('homeTab'), icon: 'home' },
		{
			key: 'bookmarks',
			type: 'link',
			href: '/bookmarks',
			label: t('bookmarksTab'),
			icon: 'bookmark',
		},
		{
			key: 'create',
			type: 'action',
			label: t('createTab'),
			icon: 'plusCircle',
			onClick: openCreate,
			isCenter: true,
		},
		{
			key: 'history',
			type: 'link',
			href: '/history',
			label: t('historyTab'),
			icon: 'history',
		},
		{
			key: 'search',
			type: 'action',
			label: t('searchTab'),
			icon: 'search',
			onClick: openSearch,
		},
	];

	const isActive = (item) => {
		if (item.type !== 'link') return false;
		if (item.href === '/') return pathname === '/';
		return pathname === item.href;
	};

	const triggerHaptic = () => {
		if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
			return;
		}
		navigator.vibrate(8);
	};

	const triggerPressFeedback = (key) => {
		setPressedKey(key);
		if (pressTimeoutRef.current) {
			window.clearTimeout(pressTimeoutRef.current);
		}
		pressTimeoutRef.current = window.setTimeout(() => {
			setPressedKey(null);
			pressTimeoutRef.current = null;
		}, 220);
	};

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;
		const root = document.documentElement;
		const desktopQuery = window.matchMedia('(min-width: 1024px)');

		const updateNavHeight = () => {
			if (!navRef.current) return;
			if (desktopQuery.matches) {
				root.style.setProperty('--bottom-nav-height', '0px');
				return;
			}
			const measuredHeight = Math.round(
				navRef.current.getBoundingClientRect().height,
			);
			if (measuredHeight > 0) {
				root.style.setProperty('--bottom-nav-height', `${measuredHeight}px`);
			}
		};

		updateNavHeight();
		window.addEventListener('resize', updateNavHeight);
		window.addEventListener('orientationchange', updateNavHeight);
		if (desktopQuery.addEventListener) {
			desktopQuery.addEventListener('change', updateNavHeight);
		} else {
			desktopQuery.addListener(updateNavHeight);
		}
		if (document.fonts?.ready) {
			document.fonts.ready
				.then(() => requestAnimationFrame(updateNavHeight))
				.catch(() => {});
		}

		let resizeObserver;
		if (typeof ResizeObserver !== 'undefined' && navRef.current) {
			resizeObserver = new ResizeObserver(updateNavHeight);
			resizeObserver.observe(navRef.current);
		}

		return () => {
			window.removeEventListener('resize', updateNavHeight);
			window.removeEventListener('orientationchange', updateNavHeight);
			if (desktopQuery.removeEventListener) {
				desktopQuery.removeEventListener('change', updateNavHeight);
			} else {
				desktopQuery.removeListener(updateNavHeight);
			}
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			root.style.removeProperty('--bottom-nav-height');
		};
	}, []);

	useEffect(() => () => {
		if (pressTimeoutRef.current) {
			window.clearTimeout(pressTimeoutRef.current);
		}
	}, []);

	return (
		<nav ref={navRef} className="bottom-nav d-xl-none" aria-label={t('mainNavigation')}>
			{navItems.map((item) =>
				item.type === 'action' ? (
					<button
						key={item.key}
						type="button"
						className={`bottom-nav-item bottom-nav-action-btn ${item.isCenter ? 'bottom-nav-create-btn' : ''} ${
							pressedKey === item.key ? 'pressed' : ''
						}`}
						aria-label={item.label}
						onClick={() => {
							triggerPressFeedback(item.key);
							triggerHaptic();
							item.onClick?.();
						}}
					>
						<Icon name={item.icon} size={24} />
						<span className="nav-label">{item.label}</span>
					</button>
				) : (
					<Link
						key={item.key}
						href={item.href}
						className={`bottom-nav-item ${isActive(item) ? 'active' : ''} ${
							pressedKey === item.key ? 'pressed' : ''
						}`}
						aria-label={item.label}
						aria-current={isActive(item) ? 'page' : undefined}
						onClick={() => {
							triggerPressFeedback(item.key);
							triggerHaptic();
						}}
					>
						<Icon name={item.icon} size={24} />
						<span className="nav-label">{item.label}</span>
					</Link>
				),
			)}
			<style jsx>{`
				.bottom-nav {
					position: fixed;
					bottom: var(--bottom-nav-keyboard-offset);
					left: 0;
					right: 0;
					min-height: var(--bottom-nav-base-height);
					padding-top: 8px;
					padding-right: max(8px, var(--safe-right));
					padding-bottom: calc(8px + var(--bottom-nav-safe-padding));
					padding-left: max(8px, var(--safe-left));
					background: var(--bg-primary);
					border-top: 1px solid var(--border-color);
					display: grid;
					grid-template-columns: repeat(5, minmax(0, 1fr));
					column-gap: 6px;
					align-items: stretch;
					box-sizing: border-box;
					z-index: 1000;
					box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.05);
					-webkit-transform: translateZ(0);
				}

				.bottom-nav-item {
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					gap: 4px;
					padding: 4px 2px;
					color: var(--text-muted);
					text-decoration: none;
					font-size: 11px;
					min-width: 0;
					min-height: 44px;
					transition: transform 0.18s ease, color 0.18s ease, background-color 0.18s ease,
						box-shadow 0.18s ease;
					position: relative;
					width: 100%;
					border-radius: 12px;
					overflow: hidden;
				}

				.bottom-nav-item::after {
					content: '';
					position: absolute;
					left: 50%;
					bottom: 2px;
					width: 20px;
					height: 3px;
					border-radius: 999px;
					background: currentColor;
					opacity: 0;
					transform: translateX(-50%) scaleX(0.4);
					transition: opacity 0.18s ease, transform 0.18s ease;
				}

				.bottom-nav-item::before {
					content: '';
					position: absolute;
					inset: 8px;
					border-radius: inherit;
					background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0) 70%);
					opacity: 0;
					transform: scale(0.7);
					pointer-events: none;
				}

				.bottom-nav-action-btn {
					border: none;
					background: transparent;
					font: inherit;
				}

				.bottom-nav-create-btn {
					background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
					color: #fff;
					box-shadow: 0 4px 14px rgba(99, 102, 241, 0.2);
				}

				.bottom-nav-create-btn .nav-label {
					font-weight: 700;
					color: #fff;
				}

				.bottom-nav-create-btn :global(svg) {
					width: 22px;
					height: 22px;
				}

				.bottom-nav-item:active {
					opacity: 0.75;
					transform: translateY(1px) scale(0.97);
				}

				.bottom-nav-item.active {
					color: var(--accent-primary);
					background: rgba(99, 102, 241, 0.08);
				}

				.bottom-nav-item.active .nav-label {
					font-weight: 700;
				}

				.bottom-nav-item.active::after {
					opacity: 1;
					transform: translateX(-50%) scaleX(1);
				}

				.bottom-nav-item.active :global(svg) {
					transform: translateY(-1px);
				}

				.bottom-nav-item.pressed {
					animation: nav-press 220ms ease-out;
				}

				.bottom-nav-item.pressed::before {
					animation: nav-ripple 220ms ease-out;
				}

				.bottom-nav-item.pressed :global(svg) {
					animation: nav-icon-pop 220ms ease-out;
				}

				.bottom-nav-item.pressed .nav-label {
					animation: nav-label-pop 220ms ease-out;
				}

				.nav-label {
					font-size: 11px;
					font-weight: 500;
					line-height: 1.1;
					letter-spacing: 0.2px;
					white-space: nowrap;
				}

				@media (hover: hover) and (pointer: fine) {
					.bottom-nav-item:hover {
						background: var(--bg-secondary);
						transform: translateY(-1px);
					}

					.bottom-nav-create-btn:hover {
						box-shadow: 0 10px 18px rgba(99, 102, 241, 0.24);
					}
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.bottom-nav-item {
						transition: none;
						animation: none;
					}

					.bottom-nav-item::after {
						transition: none;
					}

					.bottom-nav-item::before,
					.bottom-nav-item.pressed::before,
					.bottom-nav-item.pressed :global(svg),
					.bottom-nav-item.pressed .nav-label {
						animation: none;
					}
				}

				@keyframes nav-press {
					0% {
						transform: translateY(0) scale(1);
					}
					45% {
						transform: translateY(1px) scale(0.96);
					}
					100% {
						transform: translateY(0) scale(1);
					}
				}

				@keyframes nav-ripple {
					0% {
						opacity: 0;
						transform: scale(0.7);
					}
					35% {
						opacity: 1;
					}
					100% {
						opacity: 0;
						transform: scale(1.2);
					}
				}

				@keyframes nav-icon-pop {
					0% {
						transform: scale(1);
					}
					45% {
						transform: scale(1.14);
					}
					100% {
						transform: scale(1);
					}
				}

				@keyframes nav-label-pop {
					0% {
						transform: translateY(0);
					}
					45% {
						transform: translateY(-1px);
					}
					100% {
						transform: translateY(0);
					}
				}
			`}</style>
		</nav>
	);
}
