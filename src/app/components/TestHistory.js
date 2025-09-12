'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
// Inline minimal icons to avoid bundling react-icons for the history panel
const HistoryIcon = () => (
	<span style={{ display: 'inline-flex', width: 18, height: 18 }}>
		<svg
			viewBox='0 0 24 24'
			width='18'
			height='18'
			fill='currentColor'
			aria-hidden
		>
			<path d='M13 3a9 9 0 100 18 9 9 0 000-18zm1 10h-4V7h2v4h2v2z' />
		</svg>
	</span>
);

const TrashIcon = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg
			viewBox='0 0 24 24'
			width='16'
			height='16'
			fill='currentColor'
			aria-hidden
		>
			<path d='M6 7h12v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7zm3-4h6l1 1H8l1-1z' />
		</svg>
	</span>
);

const ClockIcon = () => (
	<span style={{ display: 'inline-flex', width: 14, height: 14 }}>
		<svg
			viewBox='0 0 24 24'
			width='14'
			height='14'
			fill='currentColor'
			aria-hidden
		>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-4V7h2v4h2v2z' />
		</svg>
	</span>
);

const TrophyIcon = () => (
	<span style={{ display: 'inline-flex', width: 14, height: 14 }}>
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width='16'
			height='16'
			fill='currentColor'
			class='bi bi-trophy-fill'
			viewBox='0 0 16 16'
		>
			<path d='M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5q0 .807-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33 33 0 0 1 2.5.5m.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935m10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935' />
		</svg>
	</span>
);

const ChevronRight = () => (
	<span style={{ display: 'inline-flex', width: 14, height: 14 }}>
		<svg
			viewBox='0 0 24 24'
			width='14'
			height='14'
			fill='currentColor'
			aria-hidden
		>
			<path d='M9 6l6 6-6 6' />
		</svg>
	</span>
);
import { Button, ListGroup, Badge } from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';

export default function TestHistory({ onTestClick }) {
	const [testHistory, setTestHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const router = useRouter();

	const clearHistory = () => {
		if (window.confirm('Are you sure you want to clear all test history?')) {
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
							<HistoryIcon className='text-primary' /> Previous Tests
						</h2>
						<Button
							variant='outline-danger'
							size='sm'
							className='d-flex align-items-center gap-2 fw-bold'
							onClick={clearHistory}
						>
							<TrashIcon /> Clear History
						</Button>
					</div>
					<ListGroup className='rounded-3 overflow-hidden'>
						{testHistory.map((test, index) => (
							<ListGroup.Item
								key={test.id || index}
								action
								onClick={() => {
									if (onTestClick) onTestClick();
									router.push(`/results?id=${test.id}`);
								}}
								className='d-flex justify-content-between align-items-center py-3 mb-2 border-0 shadow-sm'
							>
								<div>
									<h6 className='mb-1 text-primary'>
										{test.topic || 'Untitled Test'}
									</h6>
									<small className='text-muted d-flex align-items-center gap-1'>
										<ClockIcon /> {formatDateTime(test.timestamp)}
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
										<TrophyIcon /> {test.score}/{test.totalQuestions}
									</Badge>
									<ChevronRight className='text-muted' />
								</div>
							</ListGroup.Item>
						))}
					</ListGroup>
				</>
			)}
		</div>
	);
}
