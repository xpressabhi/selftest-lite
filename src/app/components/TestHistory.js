'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';

export default function TestHistory() {
	const [testHistory, setTestHistory] = useState([]);
	const [unsubmittedTest, setUnsubmittedTest] = useState(null);
	const router = useRouter();

	const loadTestHistory = () => {
		try {
			const history =
				JSON.parse(localStorage.getItem(STORAGE_KEYS.TEST_HISTORY)) || [];
			setTestHistory(history);
		} catch (error) {
			console.error('Error loading test history:', error);
			setTestHistory([]);
		}
	};

	// Load history initially and set up storage event listener
	useEffect(() => {
		loadTestHistory();

		// Update when localStorage changes
		const handleStorageChange = (e) => {
			if (e.key === STORAGE_KEYS.TEST_HISTORY) {
				loadTestHistory();
			} else if (e.key === STORAGE_KEYS.UNSUBMITTED_TEST) {
				setUnsubmittedTest(e.newValue ? JSON.parse(e.newValue) : null);
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
	}, []);

	useEffect(() => {
		const storedUnsubmitted = localStorage.getItem(
			STORAGE_KEYS.UNSUBMITTED_TEST,
		);
		if (storedUnsubmitted) {
			setUnsubmittedTest(JSON.parse(storedUnsubmitted));
		}
	}, []);

	const clearHistory = () => {
		if (window.confirm('Are you sure you want to clear all test history?')) {
			localStorage.removeItem(STORAGE_KEYS.TEST_HISTORY);
			setTestHistory([]);
		}
	};

	const formatDateTime = (timestamp) => {
		const date = new Date(timestamp);
		return (
			date.toLocaleDateString() +
			' ' +
			date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		);
	};

	if (testHistory.length === 0 && !unsubmittedTest) {
		return null;
	}

	return (
		<div className='mt-5 w-100'>
			{unsubmittedTest && (
				<div className='card mb-3 bg-warning-subtle border-warning'>
					<div className='card-body d-flex justify-content-between align-items-center'>
						<div>
							<h5 className='card-title mb-1'>Unsubmitted Test</h5>
							<p className='card-text text-muted small'>
								A test on &quot;{unsubmittedTest.topic}&quot; is waiting to be
								completed.
							</p>
						</div>
						<button
							className='btn btn-warning btn-sm'
							onClick={() => router.push('/test')}
						>
							Continue Test
						</button>
					</div>
				</div>
			)}

			{testHistory.length > 0 && (
				<>
					<div className='d-flex justify-content-between align-items-center mb-3'>
						<h2 className='h4 mb-0'>Previous Tests</h2>
						<button
							className='btn btn-outline-danger btn-sm'
							onClick={clearHistory}
						>
							Clear History
						</button>
					</div>
					<div className='list-group'>
						{testHistory.map((test, index) => (
							<div
								key={test.id || index}
								className='list-group-item list-group-item-action d-flex justify-content-between align-items-center'
								role='button'
								onClick={() => {
								// When navigating to a historical test, we should NOT clear the question paper and user answers
								// as the results page needs this data to calculate the score
								// Instead, we'll just navigate to the results page with the test ID
								router.push(`/results?id=${test.id}`);
							}}
							>
								<div>
									<h6 className='mb-1'>{test.topic || 'Untitled Test'}</h6>
									<small className='text-muted'>
										Taken on: {formatDateTime(test.timestamp)}
									</small>
								</div>
								<span
									className={`badge ${
										test.score / test.totalQuestions >= 0.7
											? 'bg-success'
											: test.score / test.totalQuestions >= 0.4
											? 'bg-warning'
											: 'bg-danger'
									} rounded-pill`}
								>
									Score: {test.score}/{test.totalQuestions}
								</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
