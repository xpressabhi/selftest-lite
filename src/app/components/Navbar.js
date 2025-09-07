'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
	FaGraduationCap,
	FaHistory,
	FaInfoCircle,
	FaBook,
	FaQuestionCircle,
	FaEnvelope,
	FaFileAlt,
} from 'react-icons/fa';
import dynamic from 'next/dynamic';
import { Navbar, Container, Offcanvas, Button } from 'react-bootstrap';

const TestHistory = dynamic(() => import('./TestHistory'), {
	ssr: false,
});

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
				expand='xl'
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
						<div className='d-block' style={{ width: '300px' }}>
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
						<div className='px-3 ms-auto d-flex align-items-center'>
							<nav className='d-none d-xl-flex align-items-center gap-3'>
								<Link
									href='/about'
									className='nav-link d-flex align-items-center'
								>
									<FaInfoCircle className='me-1' /> About
								</Link>
								<Link
									href='/blog'
									className='nav-link d-flex align-items-center'
								>
									<FaBook className='me-1' /> Blog
								</Link>
								<Link
									href='/faq'
									className='nav-link d-flex align-items-center'
								>
									<FaQuestionCircle className='me-1' /> FAQ
								</Link>
								<Link
									href='/privacy'
									className='nav-link d-flex align-items-center'
								>
									<FaFileAlt className='me-1' /> Privacy
								</Link>
								<Link
									href='/contact'
									className='nav-link d-flex align-items-center'
								>
									<FaEnvelope className='me-1' /> Contact
								</Link>
							</nav>

							{/* Small screen: history toggle + quick menu button */}
							<div className='d-flex align-items-center'>
								<Button
									variant='link'
									className='d-xl-none'
									onClick={handleShow}
									aria-label='Toggle history'
								>
									<FaHistory />
								</Button>
							</div>
						</div>
					</div>
				</Container>
			</Navbar>

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
