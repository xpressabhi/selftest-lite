'use client';

import { memo, useEffect, useRef, useState } from 'react';

const LoadingElapsed = memo(function LoadingElapsed({ isLoading }) {
	const [elapsedMs, setElapsedMs] = useState(0);
	const startRef = useRef(null);

	useEffect(() => {
		if (!isLoading) {
			startRef.current = null;
			setElapsedMs(0);
			return undefined;
		}

		startRef.current = Date.now();
		setElapsedMs(0);

		const intervalId = window.setInterval(() => {
			if (!startRef.current) return;
			setElapsedMs(Date.now() - startRef.current);
		}, 100);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [isLoading]);

	return (
		<span className='ms-2 opacity-75 fs-6'>
			{Math.max(0, (elapsedMs / 1000).toFixed(1))}s
		</span>
	);
});

export default LoadingElapsed;
