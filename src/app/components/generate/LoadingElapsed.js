'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

const LoadingElapsed = memo(function LoadingElapsed({ isLoading }) {
	const { t } = useLanguage();
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const startRef = useRef(null);

	useEffect(() => {
		if (!isLoading) {
			startRef.current = null;
			setElapsedSeconds(0);
			return undefined;
		}

		startRef.current = Date.now();
		setElapsedSeconds(0);

		const intervalId = window.setInterval(() => {
			if (!startRef.current) return;
			setElapsedSeconds(Math.floor((Date.now() - startRef.current) / 1000));
		}, 1000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [isLoading]);

	const mins = Math.floor(elapsedSeconds / 60);
	const secs = elapsedSeconds % 60;
	const formatted = mins > 0
		? `${mins}${t('minuteShort')} ${secs.toString().padStart(2, '0')}${t('secondShort')}`
		: `${secs}${t('secondShort')}`;

	return (
		<span className='ms-2 opacity-75 fs-6'>
			{formatted}
		</span>
	);
});

export default LoadingElapsed;
