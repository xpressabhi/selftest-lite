'use client';

import dynamic from 'next/dynamic';
import GenerateTestForm from './components/GenerateTestForm';
import UnsubmittedTestAlert from './components/UnsubmittedTestAlert';
import StreakBanner from './components/StreakBanner';
import Loading from './components/Loading';

// Lazy load heavy components below the fold
const StatsDashboard = dynamic(() => import('./components/StatsDashboard'), {
	loading: () => <div className="py-5 text-center"><Loading /></div>,
	ssr: false // Client-side stats don't need SSR
});

const PerformanceChart = dynamic(() => import('./components/PerformanceChart'), {
	loading: () => <div style={{ height: '200px' }} className="d-flex align-items-center justify-content-center text-muted">...</div>,
	ssr: false
});

const AchievementShowcase = dynamic(() => import('./components/AchievementShowcase'), {
	loading: () => <div style={{ height: '150px' }} className="d-flex align-items-center justify-content-center text-muted">...</div>,
	ssr: false
});

export default function Home() {
	return (
		<div className='typeform-bg container d-flex flex-column align-items-center'>
			<GenerateTestForm />
			<UnsubmittedTestAlert />
			<StreakBanner />
			<StatsDashboard />
			<PerformanceChart />
			<AchievementShowcase />
		</div>
	);
}
