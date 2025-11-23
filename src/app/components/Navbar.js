'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Navbar, Container, Offcanvas, Button } from 'react-bootstrap';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';

const TestHistory = dynamic(() => import('./TestHistory'), {
	ssr: false,
});

const CustomNavbar = () => {
	const [isScrolling, setIsScrolling] = useState(false);
	const [isTop, setIsTop] = useState(true);
	const [showOffcanvas, setShowOffcanvas] = useState(false);
	const scrollTimer = useRef(null);
	const { language, toggleLanguage } = useLanguage();

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
				className={`transition-all ${isTop
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
								<span>selftest.in</span>
							</Navbar.Brand>
						</div>
						{/* Main navbar content */}
						<div className='px-3 ms-auto d-flex align-items-center'>
							{/* Desktop navigation with text */}
							<nav className='d-none d-xl-flex align-items-center gap-3'>
								<Button
									variant='outline-primary'
									size='sm'
									className='rounded-pill px-3 fw-bold'
									onClick={toggleLanguage}
								>
									{language === 'english' ? 'हिंदी' : 'English'}
								</Button>
								<Link
									href='/about'
									className='nav-link d-flex align-items-center'
								>
									<Icon name='info' className='me-1' /> About
								</Link>
								<Link
									href='/blog'
									className='nav-link d-flex align-items-center'
								>
									<Icon name='book' className='me-1' /> Blog
								</Link>
								<Link
									href='/faq'
									className='nav-link d-flex align-items-center'
								>
									<Icon name='question' className='me-1' /> FAQ
								</Link>
								<Link
									href='/privacy'
									className='nav-link d-flex align-items-center'
								>
									<Icon name='file' className='me-1' /> Privacy
								</Link>
								<Link
									href='/contact'
									className='nav-link d-flex align-items-center'
								>
									<Icon name='envelope' className='me-1' /> Contact
								</Link>
							</nav>

							{/* Mobile navigation with icons only */}
							<nav className='d-flex d-xl-none align-items-center gap-2'>
								<Button
									variant='outline-primary'
									size='sm'
									className='rounded-pill px-2 fw-bold'
									onClick={toggleLanguage}
									style={{ fontSize: '0.8rem' }}
								>
									{language === 'english' ? 'हिंदी' : 'EN'}
								</Button>
								<Link href='/about' className='nav-link p-2' aria-label='About'>
									<Icon name='info' />
								</Link>
								<Link href='/blog' className='nav-link p-2' aria-label='Blog'>
									<Icon name='book' />
								</Link>
								<Link href='/faq' className='nav-link p-2' aria-label='FAQ'>
									<Icon name='question' />
								</Link>
								<Link
									href='/contact'
									className='nav-link p-2'
									aria-label='Contact'
								>
									<Icon name='envelope' />
								</Link>
								<Button
									variant='link'
									className='p-2'
									onClick={handleShow}
									aria-label='Toggle history'
								>
									<Icon name='history' />
								</Button>
							</nav>
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
