'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Navbar, Container, Offcanvas, Button } from 'react-bootstrap';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

const TestHistory = dynamic(() => import('./TestHistory'), {
	ssr: false,
});

const CustomNavbar = () => {
	const [isScrolling, setIsScrolling] = useState(false);
	const [isTop, setIsTop] = useState(true);
	const [showOffcanvas, setShowOffcanvas] = useState(false);
	const scrollTimer = useRef(null);
	const { language, toggleLanguage } = useLanguage();
	const { theme, toggleTheme } = useTheme();

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
						<div className='px-2 px-md-3 ms-auto d-flex align-items-center'>
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
								<Link
									href='/bookmarks'
									className='nav-link d-flex align-items-center'
								>
									<Icon name='bookmark' className='me-1' /> Bookmarks
								</Link>
								<Button
									variant='link'
									className='nav-link p-0 border-0'
									onClick={toggleTheme}
									aria-label='Toggle theme'
								>
									<Icon name={theme === 'light' ? 'moon' : 'sun'} />
								</Button>
							</nav>

							{/* Mobile navigation with icons only */}
							<nav className='d-flex d-xl-none align-items-center gap-1'>
								<Link
									href='/bookmarks'
									className='nav-link p-2'
									aria-label='Bookmarks'
								>
									<Icon name='bookmark' size={20} />
								</Link>
								<Button
									variant='link'
									className='p-2 text-dark'
									onClick={handleShow}
									aria-label='History'
								>
									<Icon name='history' size={20} />
								</Button>
								<Button
									variant='link'
									className='p-2 text-dark'
									onClick={handleShow}
									aria-label='Menu'
								>
									<Icon name='list' size={24} />
								</Button>
								<Button
									variant='link'
									className='p-2 text-dark'
									onClick={toggleTheme}
									aria-label='Toggle theme'
								>
									<Icon name={theme === 'light' ? 'moon' : 'sun'} size={20} />
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
					<Offcanvas.Title>Menu</Offcanvas.Title>
				</Offcanvas.Header>
				<Offcanvas.Body className='d-flex flex-column'>
					{/* Navigation Links in Offcanvas */}
					<div className='d-flex flex-column gap-2 mb-4 border-bottom pb-4'>
						<Button
							variant='outline-primary'
							className='w-100 fw-bold mb-2'
							onClick={toggleLanguage}
						>
							Change Language ({language === 'english' ? 'English' : 'हिंदी'})
						</Button>
						<Link
							href='/about'
							className='nav-link py-2 d-flex align-items-center'
							onClick={handleClose}
						>
							<Icon name='info' className='me-3 text-primary' /> About
						</Link>
						<Link
							href='/blog'
							className='nav-link py-2 d-flex align-items-center'
							onClick={handleClose}
						>
							<Icon name='book' className='me-3 text-primary' /> Blog
						</Link>
						<Link
							href='/faq'
							className='nav-link py-2 d-flex align-items-center'
							onClick={handleClose}
						>
							<Icon name='question' className='me-3 text-primary' /> FAQ
						</Link>
						<Link
							href='/privacy'
							className='nav-link py-2 d-flex align-items-center'
							onClick={handleClose}
						>
							<Icon name='file' className='me-3 text-primary' /> Privacy
						</Link>
						<Link
							href='/contact'
							className='nav-link py-2 d-flex align-items-center'
							onClick={handleClose}
						>
							<Icon name='envelope' className='me-3 text-primary' /> Contact
						</Link>
					</div>

					{/* Test History */}
					<div className='flex-grow-1 overflow-auto'>
						<TestHistory onTestClick={handleClose} />
					</div>
				</Offcanvas.Body>
			</Offcanvas>
		</>
	);
};

export default CustomNavbar;
