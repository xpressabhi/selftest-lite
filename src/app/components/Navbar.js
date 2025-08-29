'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FaGraduationCap, FaHistory } from 'react-icons/fa';
import TestHistory from './TestHistory';

const CustomNavbar = () => {
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

	const handleClose = () => setShowOffcanvas(false);
	const handleShow = () => setShowOffcanvas(true);

	return (
		<>
			<nav
				className={`navbar navbar-expand-xl fixed-top transition-all ${
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
						<div className='d-block' style={{ width: '300px' }}>
							<Link href='/' className='navbar-brand d-flex align-items-center px-3'>
								<FaGraduationCap className='me-2' />
								<span>selftest.in</span>
							</Link>
						</div>
						{/* Main navbar content */}
						<div className='px-3 ms-auto'>
							<button
								className='btn btn-link d-xl-none'
								onClick={handleShow}
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
				className='d-none d-xl-block position-fixed bg-white border-end'
				style={{
					width: '380px',
					left: '0px',
					top: '56px',
					bottom: '0',
					overflowY: 'auto',
					zIndex: 1030,
				}}
			>
				<TestHistory onTestClick={null} />
			</div>

			{/* Mobile Offcanvas */}
			<div
				className={`offcanvas offcanvas-start ${showOffcanvas ? 'show' : ''}`}
				tabIndex='-1'
				style={{ visibility: showOffcanvas ? 'visible' : 'hidden' }}
			>
				<div className='offcanvas-header'>
					<h5 className='offcanvas-title'>Test History</h5>
					<button
						type='button'
						className='btn-close'
						onClick={handleClose}
						aria-label='Close'
					></button>
				</div>
				<div className='offcanvas-body'>
					<TestHistory onTestClick={handleClose} />
				</div>
			</div>
		</>
	);
};

export default CustomNavbar;
