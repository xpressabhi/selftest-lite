'use client';

import { useRouter } from 'next/navigation';
import GenerateTestForm from './components/GenerateTestForm';
import UnsubmittedTestAlert from './components/UnsubmittedTestAlert';
import StatsDashboard from './components/StatsDashboard';

export default function Home() {
	const router = useRouter();

	return (
		<div className='typeform-bg container d-flex flex-column align-items-center pb-5 text-dark'>
			<GenerateTestForm />
			<UnsubmittedTestAlert />
			<StatsDashboard />
		</div>
	);
}
