'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';

/**
 * Bottom Navigation Component
 * Mobile-optimized navigation bar with icon-only tabs
 * - Fixed position at bottom
 * - 5 main navigation items
 * - Active state highlighting
 * - Safe area support for notched devices
 */
const navItems = [
	{ href: '/', label: 'Home', icon: 'home' },
	{ href: '/bookmarks', label: 'Bookmarks', icon: 'bookmark' },
	{ href: '/', label: 'Create', icon: 'plusCircle', isCenter: true },
	{ href: '/history', label: 'History', icon: 'history' },
	{ href: '/about', label: 'About', icon: 'info' },
];

export default function BottomNav() {
	const pathname = usePathname();

	const isActive = (href) => pathname === href;
	const triggerHaptic = () => {
		if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
			return;
		}
		navigator.vibrate(8);
	};

	return (
		<nav className="bottom-nav d-xl-none" aria-label="Main navigation">
			{navItems.map((item) => (
				<Link
					key={item.label}
					href={item.href}
					className={`bottom-nav-item ${isActive(item.href) ? 'active' : ''}`}
					aria-label={item.label}
					aria-current={isActive(item.href) ? 'page' : undefined}
					onClick={triggerHaptic}
				>
					<Icon name={item.icon} size={24} />
					<span className="nav-label">{item.label}</span>
				</Link>
			))}
			<style jsx>{`
				.bottom-nav {
					position: fixed;
					bottom: 0;
					left: 0;
					right: 0;
					height: var(--bottom-nav-height);
					padding: 8px 8px max(8px, env(safe-area-inset-bottom, 0px));
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
					min-width: 60px;
					min-height: 44px;
					transition: all 0.2s ease;
					position: relative;
					flex: 1;
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
