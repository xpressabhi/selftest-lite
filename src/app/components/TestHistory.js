'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import {
	FaHistory,
	FaExclamationTriangle,
	FaPlayCircle,
	FaTrashAlt,
	FaClock,
	FaTrophy,
	FaChevronRight,
} from 'react-icons/fa';

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
		<div className='mt-5 w-100' style={{ maxWidth: '800px' }}>
			{unsubmittedTest && (
				<div className='alert alert-warning d-flex align-items-center justify-content-between p-3 mb-4 rounded-3 shadow-sm' role='alert'>
					<div className='d-flex align-items-center'>
						<FaExclamationTriangle className='text-warning me-3 fs-4' />
						<div>
							<h6 className='mb-0 fw-bold'>Unsubmitted Test</h6>
							<small className='text-muted'>
								A test on &quot;{unsubmittedTest.topic}&quot; is waiting to be completed.
							</small>
						</div>
					</div>
					<button
						className='btn btn-warning btn-sm d-flex align-items-center gap-2 fw-bold'
						onClick={() => router.push('/test')}
					>
						<FaPlayCircle /> Continue Test
					</button>
				</div>
			)}

			{testHistory.length > 0 && (
				<>
					<div className='d-flex justify-content-between align-items-center mb-3'>
						<h2 className='h4 mb-0 d-flex align-items-center gap-2 text-dark'>
							<FaHistory className='text-primary' /> Previous Tests
						</h2>
						<button
							className='btn btn-outline-danger btn-sm d-flex align-items-center gap-2 fw-bold'
							onClick={clearHistory}
						>
							<FaTrashAlt /> Clear History
						</button>
					</div>
					<div className='list-group shadow-sm rounded-3 overflow-hidden'>
						{testHistory.map((test, index) => (
							<div
								key={test.id || index}
								className='list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3'
								role='button'
								onClick={() => {
									router.push(`/results?id=${test.id}`);
								}}
							>
								<div>
									<h6 className='mb-1 fw-bold text-primary'>{test.topic || 'Untitled Test'}</h6>
									<small className='text-muted d-flex align-items-center gap-1'>
										<FaClock /> Taken on: {formatDateTime(test.timestamp)}
									</small>
								</div>
								<div className='d-flex align-items-center gap-2'>
									<span
										className={`badge fs-6 px-3 py-2 ${
											test.score / test.totalQuestions >= 0.7
												? 'bg-success'
												: test.score / test.totalQuestions >= 0.4
												? 'bg-warning'
												: 'bg-danger'
										} rounded-pill d-flex align-items-center gap-1`}
									>
										<FaTrophy /> {test.score}/{test.totalQuestions}
									</span>
									<FaChevronRight className='text-muted' />
								</div>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
