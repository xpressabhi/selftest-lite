'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import DataSaverToggle from './DataSaverToggle';

/**
 * Top Navigation Component
 * Mobile-optimized top navigation with:
 * - Logo/brand
 * - Action buttons
 * - Scroll-based styling
 * - Touch-optimized interactions
 */
export default function TopNav() {
	const [isScrolled, setIsScrolled] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const menuRef = useRef(null);
	const pathname = usePathname();

	// Handle scroll
	useEffect(() => {
		const handleScroll = () => {
			setIsScrolled(window.scrollY > 10);
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		handleScroll();

		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	// Close menu on outside click
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (menuRef.current && !menuRef.current.contains(e.target)) {
				setIsMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// Close menu on route change
	useEffect(() => {
		setIsMenuOpen(false);
	}, [pathname]);

	const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

	const navLinks = [
		{ href: '/about', label: 'About', icon: 'info' },
		{ href: '/blog', label: 'Blog', icon: 'book' },
		{ href: '/faq', label: 'FAQ', icon: 'question' },
		{ href: '/contact', label: 'Contact', icon: 'envelope' },
	];

	return (
		<header
			className={`top-nav ${isScrolled ? 'scrolled' : ''}`}
			role="banner"
		>
			{/* Logo */}
			<Link href="/" className="nav-brand d-flex align-items-center gap-2" aria-label="Selftest Home">
				<Icon name="bookOpen" size={24} />
				<span className="brand-text lead text-decoration-none">selftest.in</span>
			</Link>

			{/* Desktop Navigation */}
			<nav className="desktop-nav" aria-label="Main navigation">
				{navLinks.map((link) => (
					<Link
						key={link.href}
						href={link.href}
						className={`nav-link ${pathname === link.href ? 'active' : ''}`}
					>
						{link.label}
					</Link>
				))}
			</nav>

			{/* Right Actions */}
			<div className="nav-actions">
				{/* Data Saver Toggle (mobile) */}
				<div className="data-saver-desktop">
					<DataSaverToggle showLabel={false} />
				</div>

				<Link href="/history" className="nav-btn" aria-label="History">
					<Icon name="history" size={24} />
				</Link>

				{/* Menu Button (mobile) */}
				<button
					className="nav-btn d-md-none"
					onClick={toggleMenu}
					aria-expanded={isMenuOpen}
					aria-label="Toggle menu"
					type="button"
				>
					<Icon name={isMenuOpen ? 'x' : 'list'} size={24} />
				</button>
			</div>

			{/* Mobile Menu Dropdown */}
			{isMenuOpen && (
				<div className="mobile-menu" ref={menuRef} role="dialog" aria-label="Navigation menu">
					<div className="menu-header">
						<span className="menu-title">Menu</span>
						<button
							className="menu-close"
							onClick={() => setIsMenuOpen(false)}
							aria-label="Close menu"
							type="button"
						>
							<Icon name="x" size={24} />
						</button>
					</div>

					<nav className="mobile-nav" aria-label="Mobile navigation">
						{navLinks.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className={`mobile-nav-link ${pathname === link.href ? 'active' : ''}`}
							>
								<Icon name={link.icon} size={20} />
								<span>{link.label}</span>
							</Link>
						))}
					</nav>

					<div className="menu-footer mb-5 pb-5">
						<DataSaverToggle variant="switch" />
					</div>
				</div>
			)}

			{/* Backdrop */}
			{isMenuOpen && (
				<div
					className="menu-backdrop"
					onClick={() => setIsMenuOpen(false)}
					aria-hidden="true"
				/>
			)}

			<style jsx>{`
				.top-nav {
					position: fixed;
					top: 0;
					left: 0;
					right: 0;
					height: 56px;
					background: var(--bg-primary);
					border-bottom: 1px solid var(--border-color);
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 0 16px;
					z-index: 1000;
					transition: box-shadow 0.2s ease;
				}

				.top-nav.scrolled {
					box-shadow: var(--shadow-md);
				}

				/* Brand */
				.nav-brand {
					display: flex;
					align-items: center;
					gap: 8px;
					color: var(--text-primary);
					text-decoration: none;
					font-weight: 700;
					font-size: 1.25rem;
				}

				.brand-text {
					background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
					-webkit-background-clip: text;
					-webkit-text-fill-color: transparent;
					background-clip: text;
				}

				/* Desktop Navigation */
				.desktop-nav {
					display: none;
					align-items: center;
					gap: 4px;
				}

				@media (min-width: 768px) {
					.desktop-nav {
						display: flex;
					}
				}

				.nav-link {
					padding: 8px 16px;
					color: var(--text-secondary);
					text-decoration: none;
					font-size: 0.875rem;
					font-weight: 500;
					border-radius: var(--radius-md);
					transition: color 0.15s ease, background 0.15s ease;
				}

				.nav-link:hover,
				.nav-link.active {
					color: var(--accent-primary);
					background: rgba(99, 102, 241, 0.1);
				}

				/* Actions */
				.nav-actions {
					display: flex;
					align-items: center;
					gap: 4px; /* Tighter gap for better grouping */
				}

				.data-saver-desktop {
					display: none;
				}

				@media (min-width: 768px) {
					.data-saver-desktop {
						display: block;
						margin-right: 8px;
					}
				}

				/* Shared Nav Button Styles (History, Menu, etc) */
				.nav-btn {
					width: 40px;
					height: 40px;
					display: flex;
					align-items: center;
					justify-content: center;
					color: var(--text-primary);
					text-decoration: none;
					background: transparent;
					border: none;
					cursor: pointer;
					border-radius: var(--radius-md);
					transition: background 0.15s ease, color 0.15s ease;
					margin: 0;
					padding: 0;
					line-height: 1;
				}

				.nav-btn:active,
				.nav-btn:hover {
					background: var(--bg-tertiary);
					color: var(--text-primary);
				}

				/* Mobile Menu */
				.mobile-menu {
					position: fixed;
					top: 0;
					right: 0;
					bottom: 0;
					width: 85%; /* Responsive width */
					max-width: 320px;
					background: var(--bg-primary);
					box-shadow: var(--shadow-lg);
					z-index: 1100;
					display: flex;
					flex-direction: column;
					animation: slideIn 0.3s ease;
				}

				@keyframes slideIn {
					from {
						transform: translateX(100%);
					}
					to {
						transform: translateX(0);
					}
				}

				.menu-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 20px 24px;
					border-bottom: 1px solid var(--border-color);
				}

				.menu-title {
					font-size: 1.25rem;
					font-weight: 700;
					color: var(--text-primary);
				}

				.menu-close {
					width: 40px;
					height: 40px;
					display: flex;
					align-items: center;
					justify-content: center;
					background: var(--bg-secondary);
					border: none;
					color: var(--text-secondary);
					cursor: pointer;
					border-radius: 50%;
					transition: all 0.2s ease;
				}

				.menu-close:active {
					transform: scale(0.95);
					background: var(--bg-tertiary);
				}

				.mobile-nav {
					flex: 1;
					padding: 24px;
					display: flex;
					flex-direction: column;
					gap: 8px;
					overflow-y: auto;
				}

				.mobile-nav-link {
					display: flex;
					align-items: center;
					gap: 16px;
					padding: 16px;
					color: var(--text-primary);
					text-decoration: none;
					font-size: 1.1rem;
					font-weight: 500;
					border-radius: var(--radius-lg);
					transition: all 0.2s ease;
					border: 1px solid transparent;
				}

				.mobile-nav-link:active {
					background: var(--bg-tertiary);
					transform: scale(0.98);
				}

				.mobile-nav-link.active {
					color: var(--accent-primary);
					background: rgba(99, 102, 241, 0.08); /* Subtle highlight */
					border-color: rgba(99, 102, 241, 0.1);
					font-weight: 600;
				}

				.menu-footer {
					padding: 24px;
					padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
					border-top: 1px solid var(--border-color);
					background: var(--bg-secondary);
				}

				/* Backdrop */
				.menu-backdrop {
					position: fixed;
					inset: 0;
					background: rgba(0, 0, 0, 0.4);
					backdrop-filter: blur(4px);
					z-index: 1099;
					animation: fadeIn 0.3s ease;
				}

				@keyframes fadeIn {
					from {
						opacity: 0;
					}
					to {
						opacity: 1;
					}
				}

				/* Reduced motion */
				@media (prefers-reduced-motion: reduce) {
					.mobile-menu,
					.menu-backdrop {
						animation: none;
					}
				}

				/* Data saver mode */
				:global(.data-saver) .mobile-menu,
				:global(.data-saver) .menu-backdrop {
					animation: none;
					backdrop-filter: none;
				}
			`}</style>
		</header>
	);
}
