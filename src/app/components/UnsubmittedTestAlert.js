'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import { Alert, Button } from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';
import Icon from './Icon';

export default function UnsubmittedTestAlert() {
	const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);
	const router = useRouter();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	const unsubmittedTest = testHistory.find((test) => !test.userAnswers);

	if (!mounted || !unsubmittedTest) return null;

	return (
		<Alert
			variant='warning'
			className='my-5 p-3 mb-4 rounded-3 shadow-sm w-100'
			style={{ maxWidth: '800px' }}
		>
			<div className='d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3'>
				<div className='d-flex align-items-start align-items-sm-center'>
					<Icon name='exclamation' className='text-warning me-3 fs-4 mt-1 mt-sm-0' />
					<div>
						<h6 className='mb-1 fw-bold'>Unsubmitted Test</h6>
						<small className='text-muted d-block' style={{ lineHeight: '1.4' }}>
							A test on &quot;{unsubmittedTest.topic}&quot; is waiting to be
							completed.
						</small>
					</div>
				</div>
				<Button
					variant='warning'
					size='sm'
					className='d-flex align-items-center justify-content-center gap-2 fw-bold text-nowrap ms-auto ms-sm-0 w-100 w-sm-auto'
					onClick={() => router.push('/test?id=' + unsubmittedTest.id)}
				>
					<Icon name='play' /> Continue Test
				</Button>
			</div>
		</Alert>
	);
}
