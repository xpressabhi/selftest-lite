'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import {
	FaHistory,
	FaTrashAlt,
	FaClock,
	FaTrophy,
	FaChevronRight,
} from 'react-icons/fa';
import { Button, ListGroup, Badge } from 'react-bootstrap';

export default function TestHistory({ onTestClick }) {
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
		<div className='mt-5 w-100' style={{ maxWidth: '800px' }}>
			{testHistory.length > 0 && (
				<>
					<div className='d-flex justify-content-between align-items-center mb-3 mx-3'>
						<h2 className='h4 mb-0 d-flex align-items-center gap-2 text-dark'>
							<FaHistory className='text-primary' /> Previous Tests
						</h2>
						<Button
							variant='outline-danger'
							size='sm'
							className='d-flex align-items-center gap-2 fw-bold'
							onClick={clearHistory}
						>
							<FaTrashAlt /> Clear History
						</Button>
					</div>
					<ListGroup className='shadow-sm rounded-3 overflow-hidden'>
						{testHistory.map((test, index) => (
							<ListGroup.Item
								key={test.id || index}
								action
								onClick={() => {
									if (onTestClick) onTestClick();
									router.push(`/results?id=${test.id}`);
								}}
								className='d-flex justify-content-between align-items-center py-3 border-0'
							>
								<div>
									<h6 className='mb-1 text-primary'>
										{test.topic || 'Untitled Test'}
									</h6>
									<small className='text-muted d-flex align-items-center gap-1'>
										<FaClock /> {formatDateTime(test.timestamp)}
									</small>
								</div>
								<div className='d-flex align-items-center gap-2'>
									<Badge
										pill
										bg={
											test.score / test.totalQuestions >= 0.7
												? 'success'
												: test.score / test.totalQuestions >= 0.4
												? 'warning'
												: 'danger'
										}
										className='fs-6 px-3 py-2 d-flex align-items-center gap-1'
									>
										<FaTrophy /> {test.score}/{test.totalQuestions}
									</Badge>
									<FaChevronRight className='text-muted' />
								</div>
							</ListGroup.Item>
						))}
					</ListGroup>
				</>
			)}
		</div>
	);
}
