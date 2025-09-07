'use client';

import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import { FaExclamationTriangle, FaPlayCircle } from 'react-icons/fa';
import { Alert, Button } from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';

export default function UnsubmittedTestAlert() {
	const [unsubmittedTest] = useLocalStorage(
		STORAGE_KEYS.UNSUBMITTED_TEST,
		null,
	);
	const router = useRouter();

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
