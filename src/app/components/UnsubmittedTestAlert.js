'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import { FaExclamationTriangle, FaPlayCircle } from 'react-icons/fa';
import { Alert, Button } from 'react-bootstrap';

export default function UnsubmittedTestAlert() {
	const [unsubmittedTest, setUnsubmittedTest] = useState(null);
	const router = useRouter();

	useEffect(() => {
		// Load initial unsubmitted test
		const storedUnsubmitted = localStorage.getItem(
			STORAGE_KEYS.UNSUBMITTED_TEST,
		);
		if (storedUnsubmitted) {
			setUnsubmittedTest(JSON.parse(storedUnsubmitted));
		}

		// Update when localStorage changes
		const handleStorageChange = (e) => {
			if (e.key === STORAGE_KEYS.UNSUBMITTED_TEST) {
				setUnsubmittedTest(e.newValue ? JSON.parse(e.newValue) : null);
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
	}, []);

	if (!unsubmittedTest) return null;

	return (
		<Alert
			variant='warning'
			className='my-5 d-flex align-items-center justify-content-between p-3 mb-4 rounded-3 shadow-sm w-100'
			style={{ maxWidth: '800px' }}
		>
			<div className='d-flex align-items-center'>
				<FaExclamationTriangle className='text-warning me-3 fs-4' />
				<div>
					<h6 className='mb-0 fw-bold'>Unsubmitted Test</h6>
					<small className='text-muted'>
						A test on &quot;{unsubmittedTest.topic}&quot; is waiting to be
						completed.
					</small>
				</div>
			</div>
			<Button
				variant='warning'
				size='sm'
				className='d-flex align-items-center gap-2 fw-bold'
				onClick={() => router.push('/test')}
			>
				<FaPlayCircle /> Continue Test
			</Button>
		</Alert>
	);
}
