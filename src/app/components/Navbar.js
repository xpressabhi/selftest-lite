'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Navbar, Container, Offcanvas, Button } from 'react-bootstrap';

// Small inline SVG icons to avoid bundling the whole react-icons package.
const Icon = ({ children, className }) => (
	<span
		className={className}
		style={{ display: 'inline-flex', width: 18, height: 18 }}
	>
		{children}
	</span>
);

const Info = (props) => (
	<Icon {...props}>
		<svg
			viewBox='0 0 24 24'
			width='18'
			height='18'
			fill='currentColor'
			aria-hidden
		>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' />
		</svg>
	</Icon>
);

const Book = (props) => (
	<Icon {...props}>
		<svg
			viewBox='0 0 24 24'
			width='18'
			height='18'
			fill='currentColor'
			aria-hidden
		>
			<path d='M6 4v16a2 2 0 002 2h10V4H8a2 2 0 00-2 0zM20 4v16h2V4h-2z' />
		</svg>
	</Icon>
);

const Question = (props) => (
	<Icon {...props}>
		<svg
			viewBox='0 0 24 24'
			width='18'
			height='18'
			fill='currentColor'
			aria-hidden
		>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm1.07-7.75c-.9.92-1.07 1.36-1.07 3h-2v-.5c0-1 .25-1.5 1.17-2.41.73-.74 1.33-1.24 1.33-2.09 0-1.1-.9-2-2-2s-2 .9-2 2H9c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.2-.5 1.92-1.93 3.25z' />
		</svg>
	</Icon>
);

const Envelope = (props) => (
	<Icon {...props}>
		<svg
			viewBox='0 0 24 24'
			width='18'
			height='18'
			fill='currentColor'
			aria-hidden
		>
			<path d='M2 6v12h20V6l-10 6L2 6z' />
		</svg>
	</Icon>
);

const File = (props) => (
	<Icon {...props}>
		<svg
			viewBox='0 0 24 24'
			width='18'
			height='18'
			fill='currentColor'
			aria-hidden
		>
			<path d='M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z' />
		</svg>
	</Icon>
);

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
								<span>selftest.in</span>
							</Navbar.Brand>
						</div>
						{/* Main navbar content */}
						<div className='px-3 ms-auto d-flex align-items-center'>
							{/* Desktop navigation with text */}
							<nav className='d-none d-xl-flex align-items-center gap-3'>
								<Link
									href='/about'
									className='nav-link d-flex align-items-center'
								>
									<Info className='me-1' /> About
								</Link>
								<Link
									href='/blog'
									className='nav-link d-flex align-items-center'
								>
									<Book className='me-1' /> Blog
								</Link>
								<Link
									href='/faq'
									className='nav-link d-flex align-items-center'
								>
									<Question className='me-1' /> FAQ
								</Link>
								<Link
									href='/privacy'
									className='nav-link d-flex align-items-center'
								>
									<File className='me-1' /> Privacy
								</Link>
								<Link
									href='/contact'
									className='nav-link d-flex align-items-center'
								>
									<Envelope className='me-1' /> Contact
								</Link>
							</nav>

							{/* Mobile navigation with icons only */}
							<nav className='d-flex d-xl-none align-items-center gap-2'>
								<Link href='/about' className='nav-link p-2' aria-label='About'>
									<Info />
								</Link>
								<Link href='/blog' className='nav-link p-2' aria-label='Blog'>
									<Book />
								</Link>
								<Link href='/faq' className='nav-link p-2' aria-label='FAQ'>
									<Question />
								</Link>
								<Link
									href='/contact'
									className='nav-link p-2'
									aria-label='Contact'
								>
									<Envelope />
								</Link>
								<Button
									variant='link'
									className='p-2'
									onClick={handleShow}
									aria-label='Toggle history'
								>
									{/* small history icon */}
									<span
										style={{ display: 'inline-flex', width: 18, height: 18 }}
									>
										<svg
											viewBox='0 0 24 24'
											width='18'
											height='18'
											fill='currentColor'
											aria-hidden
										>
											<path d='M13 3a9 9 0 100 18 9 9 0 000-18zm1 10h-4V7h2v4h2v2z' />
										</svg>
									</span>
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
