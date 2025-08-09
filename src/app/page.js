'use client';

import { useRouter } from 'next/navigation';
import 'bootstrap/dist/css/bootstrap.min.css';
import TestHistory from './components/TestHistory';
import GenerateTestForm from './components/GenerateTestForm';

export default function Home() {
	const router = useRouter();

	return (
		<div className='typeform-bg container d-flex flex-column align-items-center py-5 text-dark'>
			<GenerateTestForm />

			<TestHistory />
		</div>
	);
}
