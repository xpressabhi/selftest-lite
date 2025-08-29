'use client';

import { useRouter } from 'next/navigation';
import GenerateTestForm from './components/GenerateTestForm';
import UnsubmittedTestAlert from './components/UnsubmittedTestAlert';

export default function Home() {
	const router = useRouter();

	return (
		<div className='typeform-bg container d-flex flex-column align-items-center py-5 text-dark'>
			<GenerateTestForm />
			<UnsubmittedTestAlert />
		</div>
	);
}
