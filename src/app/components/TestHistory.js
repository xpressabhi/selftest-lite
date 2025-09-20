'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import Icon from './Icon';
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
		return (
			<div className='mt-5 w-100' style={{ maxWidth: '800px' }}>
				<div className='d-flex justify-content-between align-items-center mb-3 mx-3'>
					<h2 className='h4 mb-0 d-flex align-items-center gap-2 text-dark'>
						<Icon name='history' className='text-primary' /> Previous Tests
					</h2>
				</div>
				<div className='p-4 text-center text-muted'>
					<Icon name='inbox' size={48} className='mb-3' />
					<p className='mb-0'>No previous tests found.</p>
				</div>
			</div>
		);
	}

	return (
		<div className='mt-5 w-100' style={{ maxWidth: '800px' }}>
			<div className='d-flex justify-content-between align-items-center mb-3 mx-3'>
				<h2 className='h4 mb-0 d-flex align-items-center gap-2 text-dark'>
					<Icon name='history' className='text-primary' /> Previous Tests
				</h2>
				<Button
					variant='outline-danger'
					size='sm'
					className='d-flex align-items-center gap-2 fw-bold'
					onClick={clearHistory}
				>
					<Icon name='trash' /> Clear History
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
								<Icon name='clock' /> {formatDateTime(test.timestamp)}
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
								<Icon name='trophy' /> {test.score}/{test.totalQuestions}
							</Badge>
							<Icon name='chevronRight' className='text-muted' />
						</div>
					</ListGroup.Item>
				))}
			</ListGroup>
		</div>
	);
}
