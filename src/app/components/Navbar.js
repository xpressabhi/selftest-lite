// src/app/components/Navbar.js

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FaGraduationCap, FaHome, FaBars } from 'react-icons/fa';

/**
 * Renders a minimal navigation bar with a link to the home page.
 * Uses Bootstrap 5 for styling with scroll-based transparency.
 */
const Navbar = () => {
	const [isScrolling, setIsScrolling] = useState(false);
	const [isTop, setIsTop] = useState(true);
	const scrollTimer = useRef(null);

	useEffect(() => {
		const handleScroll = () => {
			// Set transparent while actively scrolling
			setIsScrolling(true);
			setIsTop(window.scrollY <= 10);

			// Clear the previous timer
			if (scrollTimer.current) {
				clearTimeout(scrollTimer.current);
			}

			// Set a new timer to remove transparency after scrolling stops
			scrollTimer.current = setTimeout(() => {
				setIsScrolling(false);
			}, 150); // Adjust timing to match Twitter's behavior
		};

		window.addEventListener('scroll', handleScroll);
		return () => {
			window.removeEventListener('scroll', handleScroll);
			if (scrollTimer.current) {
				clearTimeout(scrollTimer.current);
			}
		};
	}, []);

	return (
		<nav
			className={`navbar navbar-expand-lg navbar-light fixed-top transition-all ${
				isTop
					? 'bg-light'
					: isScrolling
					? 'bg-light/60 backdrop-blur'
					: 'bg-light'
			}`}
			style={{
				transition: 'all 0.2s ease-in-out',
				boxShadow: isTop ? 'none' : '0 0 10px rgba(0,0,0,0.1)',
			}}
		>
			<div className='container'>
				<Link
					href='/'
					className='navbar-brand d-flex align-items-center gap-2 text-primary'
				>
					<FaGraduationCap size={24} />
					<span className='fw-bold'>Selftest.in</span>
				</Link>
				<button
					className='navbar-toggler border-0'
					type='button'
					data-bs-toggle='collapse'
					data-bs-target='#navbarNav'
					aria-controls='navbarNav'
					aria-expanded='false'
					aria-label='Toggle navigation'
				>
					<FaBars className='text-primary' size={20} />
				</button>
				<div className='collapse navbar-collapse' id='navbarNav'>
					<ul className='navbar-nav ms-auto'>
						<li className='nav-item'>
							<Link
								href='/'
								className='nav-link active d-flex align-items-center gap-2'
								aria-current='page'
							>
								<FaHome /> Home
							</Link>
						</li>
					</ul>
				</div>
			</div>
		</nav>
	);
};

export default Navbar;
