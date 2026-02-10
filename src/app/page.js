'use client';

import { useRouter } from 'next/navigation';
import GenerateTestForm from './components/GenerateTestForm';
import UnsubmittedTestAlert from './components/UnsubmittedTestAlert';
import StatsDashboard from './components/StatsDashboard';
import StreakBanner from './components/StreakBanner';
import AchievementShowcase from './components/AchievementShowcase';
import PerformanceChart from './components/PerformanceChart';

export default function Home() {
	const router = useRouter();

	return (
		<div className='typeform-bg container d-flex flex-column align-items-center pb-5 text-dark'>
			<GenerateTestForm />
			<UnsubmittedTestAlert />
			<StreakBanner />
			<StatsDashboard />
			<PerformanceChart />
			<AchievementShowcase />
		</div>
	);
}
