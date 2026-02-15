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

	return (
		<nav className="bottom-nav d-xl-none" aria-label="Main navigation">
			{navItems.map((item) => (
				<Link
					key={item.label}
					href={item.href}
					className={`bottom-nav-item ${isActive(item.href) ? 'active' : ''}`}
					aria-label={item.label}
					aria-current={isActive(item.href) ? 'page' : undefined}
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
					min-height: 72px; /* Minimum height for touch */
					padding-top: 12px;
					padding-bottom: max(16px, env(safe-area-inset-bottom, 0px)); /* Safe area + breathing room */
					background: var(--bg-primary);
					border-top: 1px solid var(--border-color);
					display: flex;
					justify-content: space-around;
					align-items: flex-start; /* Align items to top to avoid variable stretching */
					z-index: 1000;
					box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.05);
				}

				.bottom-nav-item {
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					gap: 6px;
					padding: 6px 4px;
					color: var(--text-muted);
					text-decoration: none;
					font-size: 11px;
					min-width: 60px;
					transition: all 0.2s ease;
					position: relative;
					flex: 1; /* Distribute space evenly */
				}

				.bottom-nav-item:active {
					opacity: 0.7;
					transform: scale(0.95);
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
					white-space: nowrap;
					letter-spacing: 0.2px;
				}

				:global(.data-saver) .bottom-nav {
					height: 64px;
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
