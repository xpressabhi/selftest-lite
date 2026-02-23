'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
	const navRef = useRef(null);
	const { t } = useLanguage();
	const openSearch = () => {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new Event(APP_EVENTS.OPEN_SEARCH));
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
			type: 'link',
			href: '/',
			label: t('createTab'),
			icon: 'plusCircle',
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

	const isActive = (href) => pathname === href;
	const triggerHaptic = () => {
		if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
			return;
		}
		navigator.vibrate(8);
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

	return (
		<nav ref={navRef} className="bottom-nav d-xl-none" aria-label={t('mainNavigation')}>
			{navItems.map((item) =>
				item.type === 'action' ? (
					<button
						key={item.key}
						type="button"
						className="bottom-nav-item bottom-nav-action-btn"
						aria-label={item.label}
						onClick={() => {
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
						className={`bottom-nav-item ${isActive(item.href) ? 'active' : ''}`}
						aria-label={item.label}
						aria-current={isActive(item.href) ? 'page' : undefined}
						onClick={triggerHaptic}
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
					display: flex;
					justify-content: space-around;
					align-items: center;
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
					padding: 4px;
					color: var(--text-muted);
					text-decoration: none;
					font-size: 11px;
					min-width: 56px;
					min-height: 44px;
					transition: all 0.2s ease;
					position: relative;
					flex: 1;
				}

				.bottom-nav-action-btn {
					border: none;
					background: transparent;
					font: inherit;
				}

				.bottom-nav-item:active {
					opacity: 0.75;
					transform: scale(0.96);
				}

				.bottom-nav-item.active {
					color: var(--accent-primary);
				}

				.bottom-nav-item.active .nav-label {
					font-weight: 700;
				}

				.nav-label {
					font-size: 11px;
					font-weight: 500;
					line-height: 1.1;
					white-space: nowrap;
					letter-spacing: 0.2px;
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.bottom-nav-item {
						transition: none;
					}
				}
			`}</style>
		</nav>
	);
}
