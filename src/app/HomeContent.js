'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import GenerateTestForm from './components/GenerateTestForm';
import UnsubmittedTestAlert from './components/UnsubmittedTestAlert';
import StreakBanner from './components/StreakBanner';
import RevisionQuickStart from './components/RevisionQuickStart';
import Loading from './components/Loading';
import FirstVisitTour from './components/FirstVisitTour';

// Lazy load heavy components below the fold.
const StatsDashboard = dynamic(() => import('./components/StatsDashboard'), {
	loading: () => (
		<div className='py-5 text-center'>
			<Loading />
		</div>
	),
	ssr: false,
});

export default function HomeContent() {
	return (
		<div className='typeform-bg container d-flex flex-column align-items-center'>
			<FirstVisitTour />
			<Suspense fallback={<div className='w-100' style={{ maxWidth: '720px' }} />}>
				<GenerateTestForm />
			</Suspense>
			<UnsubmittedTestAlert />
			<RevisionQuickStart />
			<StreakBanner />
			<StatsDashboard />
		</div>
	);
}
