'use client';

import { useRouter } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';
import TestHistory from './components/TestHistory';

export default function Home() {
	const router = useRouter();

	return (
		<div className='container d-flex flex-column align-items-center py-5 bg-light text-dark'>
			<h1 className='display-4 mb-4'>Welcome to Selftest.in</h1>
			<p className='lead mb-5'>
				Your personal tool for creating and taking tests.
			</p>
			<div className='d-grid gap-2 col-6 mx-auto'>
				<button
					className='btn btn-primary btn-lg'
					onClick={() => router.push('/generate')}
				>
					Generate a New Test
				</button>
				<button
					className='btn btn-secondary btn-lg'
					onClick={() => router.push('/test')}
				>
					Take a Test
				</button>
			</div>
			<TestHistory />
		</div>
	);
}
