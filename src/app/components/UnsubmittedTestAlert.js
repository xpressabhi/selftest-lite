'use client';

import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import { Alert, Button } from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';

// small inline icons
const Exclamation = () => (
	<span style={{ display: 'inline-flex', width: 20, height: 20 }} aria-hidden>
		<svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'>
			<path d='M1 21h22L12 2 1 21zm13-3h-4v-2h4v2zm0-4h-4v-4h4v4z' />
		</svg>
	</span>
);

const Play = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }} aria-hidden>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M8 5v14l11-7z' />
		</svg>
	</span>
);

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
				<Exclamation className='text-warning me-3 fs-4' />
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
				<Play /> Continue Test
			</Button>
		</Alert>
	);
}
