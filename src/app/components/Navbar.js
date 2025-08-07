// src/app/components/Navbar.js

import React from 'react';
import Link from 'next/link';
import { FaGraduationCap, FaHome, FaBars } from 'react-icons/fa';

/**
 * Renders a minimal navigation bar with a link to the home page.
 * Uses Bootstrap 5 for styling.
 */
const Navbar = () => {
	return (
		<nav className='navbar navbar-expand-lg navbar-light bg-light shadow-sm sticky-top'>
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
