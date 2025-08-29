'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FaGraduationCap, FaHistory } from 'react-icons/fa';
import TestHistory from './TestHistory';
import { Navbar, Container, Offcanvas, Button } from 'react-bootstrap';

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
			<Navbar
				fixed='top'
				expand='lg'
				className={`transition-all ${
					isTop
						? 'bg-light'
						: isScrolling
						? 'bg-light/60 backdrop-blur'
						: 'bg-light'
				}`}
			>
				<Container fluid className='px-0'>
					<div className='d-flex w-100'>
						{/* Left sidebar for desktop */}
						<div className='d-none d-lg-block' style={{ width: '300px' }}>
							<Navbar.Brand
								as={Link}
								href='/'
								className='d-flex align-items-center px-3'
							>
								<FaGraduationCap className='me-2' />
								<span>selftest.in</span>
							</Navbar.Brand>
						</div>
						{/* Main navbar content */}
						<div className='flex-grow-1 px-3 d-flex justify-content-between align-items-center'>
							<Navbar.Brand
								as={Link}
								href='/'
								className='d-flex d-lg-none align-items-center'
							>
								<FaGraduationCap className='me-2' />
								<span>selftest.in</span>
							</Navbar.Brand>
							<Button
								variant='link'
								className='d-lg-none'
								onClick={handleShow}
								aria-label='Toggle history'
							>
								<FaHistory />
							</Button>
						</div>
					</div>
				</Container>
			</Navbar>

			{/* Desktop Test History Panel */}
			<div
				className='d-none d-lg-block position-fixed bg-white border-end'
				style={{
					width: '380px',
					left: '20px',
					top: '56px',
					bottom: '0',
					overflowY: 'auto',
					zIndex: 1030,
				}}
			>
				<TestHistory onTestClick={null} />
			</div>

			{/* Mobile Offcanvas */}
			<Offcanvas show={showOffcanvas} onHide={handleClose} placement='start'>
				<Offcanvas.Header closeButton>
					<Offcanvas.Title>Test History</Offcanvas.Title>
				</Offcanvas.Header>
				<Offcanvas.Body>
					<TestHistory onTestClick={handleClose} />
				</Offcanvas.Body>
			</Offcanvas>
		</>
	);
};

export default CustomNavbar;
