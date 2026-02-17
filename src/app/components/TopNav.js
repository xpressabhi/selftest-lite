'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import DataSaverToggle from './DataSaverToggle';
import { useDataSaver } from '../context/DataSaverContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import useTestSearch from '../hooks/useTestSearch';

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
	const [isThemeMounted, setIsThemeMounted] = useState(false);
	const menuRef = useRef(null);
	const navRef = useRef(null);
	const pathname = usePathname();
	const router = useRouter();
	const { isDataSaverActive } = useDataSaver();
	const { t, language: uiLanguage, toggleLanguage } = useLanguage();
	const { theme, toggleTheme } = useTheme();
	const {
		isSearchOpen,
		searchQuery,
		searchResults,
		searchLoading,
		searchError,
		setSearchQuery,
		openSearch,
		closeSearch,
	} = useTestSearch({ isDataSaverActive });
	const uiLanguageLabel =
		uiLanguage === 'hindi' ? t('hindiLabel') : t('englishLabel');
	const isDarkThemeActive = isThemeMounted && theme === 'dark';
	const themeLabel = isDarkThemeActive ? t('darkMode') : t('lightMode');
	const uiLocale = uiLanguage === 'hindi' ? 'hi-IN' : 'en-IN';

	const triggerHaptic = () => {
		if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
			return;
		}
		navigator.vibrate(8);
	};

	// Handle scroll
	useEffect(() => {
		const handleScroll = () => {
			setIsScrolled(window.scrollY > 10);
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		handleScroll();

		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	useEffect(() => {
		setIsThemeMounted(true);
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

	useEffect(() => {
		if (!isSearchOpen) return;
		const onEscape = (event) => {
			if (event.key === 'Escape') {
				closeSearch();
			}
		};
		document.addEventListener('keydown', onEscape);
		return () => document.removeEventListener('keydown', onEscape);
	}, [isSearchOpen, closeSearch]);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;
		const root = document.documentElement;

		const updateNavHeight = () => {
			if (!navRef.current) return;
			const measuredHeight = Math.round(
				navRef.current.getBoundingClientRect().height,
			);
			if (measuredHeight > 0) {
				root.style.setProperty('--navbar-height', `${measuredHeight}px`);
			}
		};

		updateNavHeight();
		window.addEventListener('resize', updateNavHeight);
		window.addEventListener('orientationchange', updateNavHeight);
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
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			root.style.removeProperty('--navbar-height');
		};
	}, []);

	const openTestFromSearch = (id) => {
		closeSearch();
		setSearchQuery('');
		triggerHaptic();
		router.push(`/test?id=${id}`);
	};

	const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

	const handleThemeToggle = () => {
		triggerHaptic();
		toggleTheme();
	};

	const navLinks = [
		{ href: '/about', label: t('about'), icon: 'info' },
		{ href: '/blog', label: t('blog'), icon: 'book' },
		{ href: '/faq', label: t('faq'), icon: 'question' },
		{ href: '/contact', label: t('contact'), icon: 'envelope' },
	];

	return (
		<header
			ref={navRef}
			className={`top-nav ${isScrolled ? 'scrolled' : ''}`}
			role="banner"
		>
			{/* Logo */}
			<Link
				href="/"
				className="nav-brand d-flex align-items-center gap-2"
				aria-label={t('selftestHome')}
			>
				<Icon name="bookOpen" size={24} />
				<span className="brand-text lead text-decoration-none">selftest.in</span>
			</Link>

			{/* Desktop Navigation */}
			<nav className="desktop-nav" aria-label={t('mainNavigation')}>
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

					<button
						className="nav-btn"
						onClick={() => {
							triggerHaptic();
							openSearch();
						}}
						aria-label={t('searchTests')}
						type="button"
					>
						<Icon name="search" size={20} />
					</button>

					<button
						className="nav-btn"
						onClick={() => {
							triggerHaptic();
							toggleLanguage();
						}}
						aria-label={`${t('switchLanguageAria')} (${uiLanguageLabel})`}
						title={`${t('uiLanguage')}: ${uiLanguageLabel}`}
						type="button"
					>
						<Icon name="globe" size={20} />
					</button>

					<button
						className="nav-btn"
						onClick={handleThemeToggle}
						aria-label={`${t('toggleThemeAria')} (${themeLabel})`}
						title={`${t('theme')}: ${themeLabel}`}
						type="button"
					>
						<Icon name={isDarkThemeActive ? 'sun' : 'moon'} size={20} />
					</button>

					<button
						className="nav-btn"
						onClick={() => {
							triggerHaptic();
							router.push('/history');
						}}
						aria-label={t('history')}
						type="button"
					>
						<Icon name="history" size={20} />
					</button>

					{/* Menu Button (mobile) */}
					<button
						className="nav-btn d-md-none"
						onClick={() => {
							triggerHaptic();
							toggleMenu();
						}}
						aria-expanded={isMenuOpen}
						aria-label={t('toggleMenu')}
						type="button"
				>
					<Icon name={isMenuOpen ? 'x' : 'list'} size={20} />
				</button>
			</div>

			{/* Mobile Menu Dropdown */}
				{isMenuOpen && (
					<div
						className="mobile-menu"
						ref={menuRef}
						role="dialog"
						aria-label={t('navigationMenu')}
					>
						<div className="menu-header">
							<span className="menu-title">{t('menu')}</span>
							<button
								className="menu-close"
								onClick={() => {
									triggerHaptic();
									setIsMenuOpen(false);
								}}
								aria-label={t('closeMenu')}
								type="button"
							>
								<Icon name="x" size={24} />
							</button>
						</div>

						<nav className="mobile-nav" aria-label={t('mobileNavigation')}>
							{navLinks.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className={`mobile-nav-link ${pathname === link.href ? 'active' : ''}`}
									onClick={triggerHaptic}
								>
									<span className="mobile-link-icon" aria-hidden="true">
										<Icon name={link.icon} size={20} />
									</span>
									<span className="mobile-link-label">{link.label}</span>
								</Link>
						))}
					</nav>

						<div className="menu-footer">
							<DataSaverToggle variant="switch" />
						</div>
				</div>
			)}

				{/* Backdrop */}
				{isMenuOpen && (
					<div
						className="menu-backdrop"
						onClick={() => {
							triggerHaptic();
							setIsMenuOpen(false);
						}}
						aria-hidden="true"
					/>
				)}

			{/* Search Modal */}
			{isSearchOpen && (
				<div
					className="search-backdrop"
					onClick={closeSearch}
					aria-hidden="true"
				>
					<div
						className="search-modal"
							role="dialog"
							aria-modal="true"
							aria-label={t('searchPastTests')}
						onClick={(event) => event.stopPropagation()}
					>
						<div className="search-header">
								<h2>{t('searchTests')}</h2>
								<button
									className="menu-close"
									onClick={() => {
										triggerHaptic();
										closeSearch();
									}}
										aria-label={t('closeSearch')}
										type="button"
									>
								<Icon name="x" size={22} />
							</button>
						</div>

						<div className="search-input-wrap">
							<Icon name="search" className="search-input-icon" size={16} />
								<input
									autoFocus
									type="text"
									className="search-input"
									placeholder={t('searchByTopic')}
									value={searchQuery}
									onChange={(event) => setSearchQuery(event.target.value)}
								/>
							</div>

							<div className="search-subtitle">
								{searchQuery.trim() ? t('matchingTests') : t('recentTests')}
							</div>

							<div className="results-list">
								{searchLoading ? (
									<div className="results-state">{t('loading')}</div>
								) : searchError ? (
									<div className="results-state">{searchError}</div>
								) : searchResults.length === 0 ? (
									<div className="results-state">{t('noTestsFound')}</div>
								) : (
								searchResults.map((test) => (
									<button
										key={test.id}
										type="button"
										className="result-item"
										onClick={() => openTestFromSearch(test.id)}
									>
										<div className="result-title">
											{test.topic || `${t('testPrefix')} #${test.id}`}
										</div>
										<div className="result-meta">
											<span>#{test.id}</span>
											<span>
												{new Date(test.created_at).toLocaleDateString(uiLocale)}
											</span>
										</div>
									</button>
								))
							)}
						</div>
					</div>
				</div>
			)}

			<style jsx>{`
					.top-nav {
						position: fixed;
						top: 0;
						left: 0;
						right: 0;
						min-height: calc(var(--navbar-base-height) + var(--safe-top));
						background: var(--bg-primary);
						border-bottom: 1px solid var(--border-color);
						display: flex;
						align-items: center;
						justify-content: space-between;
						padding-top: var(--safe-top);
						padding-right: max(12px, var(--safe-right));
						padding-bottom: 0;
						padding-left: max(12px, var(--safe-left));
						box-sizing: border-box;
						z-index: 1101;
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

				.nav-btn :global(svg) {
					width: 20px;
					height: 20px;
					display: block;
					flex-shrink: 0;
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
						padding: calc(20px + var(--safe-top)) 24px 20px;
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
					gap: 10px;
					overflow-y: auto;
				}

				.mobile-nav-link {
					display: flex;
					align-items: center;
					gap: 14px;
					padding: 14px 16px;
					min-height: 54px;
					color: var(--text-primary);
					text-decoration: none;
					font-size: 1rem;
					font-weight: 500;
					border-radius: var(--radius-lg);
					transition: all 0.2s ease;
					border: 1px solid transparent;
				}

				.mobile-link-icon {
					width: 24px;
					height: 24px;
					display: inline-flex;
					align-items: center;
					justify-content: center;
					flex-shrink: 0;
				}

				.mobile-link-icon :global(svg) {
					width: 20px;
					height: 20px;
					display: block;
				}

				.mobile-link-label {
					line-height: 1.2;
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

						.search-backdrop {
							position: fixed;
							inset: 0;
						z-index: 1200;
						background: rgba(0, 0, 0, 0.4);
						backdrop-filter: blur(3px);
							display: flex;
							align-items: flex-start;
							justify-content: center;
							padding-top: calc(var(--navbar-height) + 12px);
							padding-right: max(12px, var(--safe-right));
							padding-bottom: calc(var(--bottom-nav-offset) + 12px);
							padding-left: max(12px, var(--safe-left));
						}

					.search-modal {
						width: 100%;
						max-width: 560px;
						max-height: min(72vh, 520px);
						max-height: min(72dvh, 520px);
						background: var(--bg-primary);
					border: 1px solid var(--border-color);
					border-radius: var(--radius-lg);
					box-shadow: var(--shadow-lg);
					display: flex;
					flex-direction: column;
					overflow: hidden;
				}

				.search-header {
					padding: 12px 12px 8px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					border-bottom: 1px solid var(--border-color);
				}

				.search-header h2 {
					margin: 0;
					font-size: 1rem;
					font-weight: 700;
					color: var(--text-primary);
				}

				.search-input-wrap {
					margin: 12px;
					position: relative;
				}

				.search-input-icon {
					position: absolute;
					top: 50%;
					left: 12px;
					transform: translateY(-50%);
					color: var(--text-muted);
				}

				.search-input {
					width: 100%;
					border: 1px solid var(--border-color);
					border-radius: var(--radius-md);
					background: var(--bg-secondary);
					color: var(--text-primary);
					padding: 10px 12px 10px 34px;
					font-size: 0.95rem;
					outline: none;
				}

				.search-input:focus {
					border-color: var(--accent-primary);
				}

				.search-subtitle {
					padding: 0 12px 8px;
					color: var(--text-muted);
					font-size: 0.8rem;
					font-weight: 600;
					text-transform: uppercase;
					letter-spacing: 0.04em;
				}

					.results-list {
						padding: 0 8px 8px;
						overflow-y: auto;
						max-height: min(56vh, 420px);
						max-height: min(56dvh, 420px);
						-ms-overflow-style: none;
						scrollbar-width: none;
				}

				.results-list::-webkit-scrollbar {
					display: none;
				}

				.result-item {
					width: 100%;
					text-align: left;
					border: 1px solid transparent;
					background: transparent;
					padding: 10px;
					border-radius: var(--radius-md);
					cursor: pointer;
				}

				.result-item:active,
				.result-item:hover {
					background: var(--bg-secondary);
					border-color: var(--border-color);
				}

				.result-title {
					color: var(--text-primary);
					font-size: 0.92rem;
					font-weight: 600;
					line-height: 1.3;
				}

				.result-meta {
					margin-top: 4px;
					display: flex;
					gap: 10px;
					color: var(--text-muted);
					font-size: 0.78rem;
				}

				.results-state {
					padding: 14px 10px;
					color: var(--text-muted);
					font-size: 0.88rem;
				}

						@media (max-width: 767px) {
							.search-backdrop {
								padding-top: calc(var(--navbar-height) + 8px);
								padding-right: max(8px, var(--safe-right));
								padding-bottom: calc(var(--bottom-nav-offset) + 8px);
								padding-left: max(8px, var(--safe-left));
							}

						.search-modal {
							max-height: min(75vh, 560px);
							max-height: min(75dvh, 560px);
						}
					}
			`}</style>
		</header>
	);
}
