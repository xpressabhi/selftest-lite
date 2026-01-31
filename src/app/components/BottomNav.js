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
					className={`bottom-nav-item ${isActive(item.href) ? 'active' : ''} ${item.isCenter ? 'center-btn' : ''}`}
					aria-label={item.label}
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					{item.isCenter ? (
						<span className="center-icon">
							<Icon name={item.icon} size={24} />
						</span>
					) : (
						<>
							<Icon name={item.icon} size={24} />
							<span className="nav-label">{item.label}</span>
						</>
					)}
				</Link>
			))}
			<style jsx>{`
				.bottom-nav {
					position: fixed;
					bottom: 0;
					left: 0;
					right: 0;
					height: 64px;
					padding-bottom: env(safe-area-inset-bottom, 0px);
					background: var(--bg-primary);
					border-top: 1px solid var(--border-color);
					display: flex;
					justify-content: space-around;
					align-items: center;
					z-index: 1000;
				}

				.bottom-nav-item {
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					gap: 4px;
					padding: 8px 12px;
					color: var(--text-muted);
					text-decoration: none;
					font-size: 11px;
					min-width: 56px;
					transition: color 0.15s ease;
					position: relative;
				}

				.bottom-nav-item:active {
					opacity: 0.7;
				}

				.bottom-nav-item.active {
					color: var(--accent-primary);
				}

				.nav-label {
					font-size: 10px;
					font-weight: 500;
					white-space: nowrap;
				}

				.center-btn {
					position: relative;
				}

				.center-icon {
					position: absolute;
					top: -24px;
					left: 50%;
					transform: translateX(-50%);
					width: 56px;
					height: 56px;
					background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
					border-radius: 50%;
					display: flex;
					align-items: center;
					justify-content: center;
					box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
					color: white;
					border: 4px solid var(--bg-primary);
				}

				.center-btn .nav-label {
					margin-top: 32px;
				}

				/* Data saver mode */
				:global(.data-saver) .center-icon {
					background: var(--accent-primary);
					box-shadow: none;
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
