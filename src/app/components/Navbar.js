'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FaGraduationCap, FaHistory } from 'react-icons/fa';
import TestHistory from './TestHistory';

const Navbar = () => {
	const [isScrolling, setIsScrolling] = useState(false);
	const [isTop, setIsTop] = useState(true);
	const [showOffcanvas, setShowOffcanvas] = useState(false);
	const scrollTimer = useRef(null);

	useEffect(() => {
		const handleScroll = () => {
			setIsScrolling(true);
			setIsTop(window.scrollY <= 10);

			if (scrollTimer.current) {
				clearTimeout(scrollTimer.current);
			}

			scrollTimer.current = setTimeout(() => {
				setIsScrolling(false);
			}, 150);
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
		<>
			<nav
				className={`navbar navbar-expand-lg navbar-light fixed-top transition-all ${
					isTop
						? 'bg-light'
						: isScrolling
						? 'bg-light/60 backdrop-blur'
						: 'bg-light'
				}`}
			>
				<div className='container-fluid px-0'>
					<div className='d-flex w-100'>
						{/* Left sidebar for desktop */}
						<div className='d-none d-lg-block' style={{ width: '300px' }}>
							<Link
								href='/'
								className='navbar-brand d-flex align-items-center px-3'
							>
								<FaGraduationCap className='me-2' />
								<span>selftest.in</span>
							</Link>
						</div>
						{/* Main navbar content */}
						<div className='flex-grow-1 px-3 d-flex justify-content-between align-items-center'>
							<Link
								href='/'
								className='navbar-brand d-flex d-lg-none align-items-center'
							>
								<FaGraduationCap className='me-2' />
								<span>selftest.in</span>
							</Link>
							<button
								className='navbar-toggler d-lg-none'
								type='button'
								onClick={() => setShowOffcanvas(!showOffcanvas)}
								aria-label='Toggle history'
							>
								<FaHistory />
							</button>
						</div>
					</div>
				</div>
			</nav>

			{/* Desktop Test History Panel */}
			<div
				className='d-none d-lg-block position-fixed'
				style={{
					width: '380px',
					left: '20px',
					top: '56px',
					bottom: '0',
					overflowY: 'auto',
					backgroundColor: '#fff',
					borderRight: '1px solid #dee2e6',
					zIndex: 1030,
				}}
			>
				<TestHistory onTestClick={null} />
			</div>

			{/* Mobile Offcanvas */}
			<div
				className={`offcanvas offcanvas-start d-lg-none ${
					showOffcanvas ? 'show' : ''
				}`}
				tabIndex='-1'
				id='offcanvasHistory'
				aria-labelledby='offcanvasHistoryLabel'
				style={{ visibility: showOffcanvas ? 'visible' : 'hidden' }}
			>
				<div className='offcanvas-header'>
					<h5 className='offcanvas-title' id='offcanvasHistoryLabel'>
						Test History
					</h5>
					<button
						type='button'
						className='btn-close'
						onClick={() => setShowOffcanvas(false)}
						aria-label='Close'
					></button>
				</div>
				<div className='offcanvas-body'>
					<TestHistory onTestClick={() => setShowOffcanvas(false)} />
				</div>
			</div>

			{/* Mobile Backdrop */}
			{showOffcanvas && (
				<div
					className='offcanvas-backdrop fade show d-lg-none'
					onClick={() => setShowOffcanvas(false)}
				></div>
			)}
		</>
	);
};

export default Navbar;
