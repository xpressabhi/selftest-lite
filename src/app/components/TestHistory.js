'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';

export default function TestHistory() {
	const [testHistory, setTestHistory] = useState([]);
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
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
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

	if (testHistory.length === 0) {
		return null;
	}

	return (
		<div className='mt-5 w-100'>
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
						onClick={() => router.push(`/results?id=${test.id}`)}
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
		</div>
	);
}
