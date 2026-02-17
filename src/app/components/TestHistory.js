'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import Icon from './Icon';
import { Button, ListGroup, Badge } from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';
import { useLanguage } from '../context/LanguageContext';

export default function TestHistory({ onTestClick, showHeader = true }) {
	const [testHistory, setTestHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const router = useRouter();
	const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
	const { t, language } = useLanguage();

	const toggleFavorite = (e, testId) => {
		e.stopPropagation();
		const updatedHistory = testHistory.map((t) =>
			t.id === testId ? { ...t, isFavorite: !t.isFavorite } : t,
		);
		setTestHistory(updatedHistory);
	};

	const clearHistory = () => {
		if (window.confirm(t('clearHistoryConfirm'))) {
			setTestHistory([]);
		}
	};

	const formatDateTime = (timestamp) => {
		const date = new Date(timestamp);
		const locale = language === 'hindi' ? 'hi-IN' : 'en-IN';
		return (
			date.toLocaleDateString(locale) +
			' ' +
			date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
		);
	};

	if (testHistory.length === 0) {
		return (
			<div className='w-100' style={{ maxWidth: '800px' }}>
				{showHeader && (
					<div className='d-flex justify-content-between align-items-center mb-3 mx-3 py-3'>
						<h2 className='h4 mb-0 d-flex align-items-center gap-2 text-dark'>
							<Icon name='history' className='text-primary' /> {t('previousTests')}
						</h2>
					</div>
				)}
				<div className='p-4 text-center text-muted'>
					<Icon name='inbox' size={48} className='mb-3' />
					<p className='mb-0'>{t('noPreviousTestsFound')}</p>
				</div>
			</div>
		);
	}

	return (
		<div className='w-100' style={{ maxWidth: '800px' }}>
			<div className={`d-flex justify-content-between align-items-center mb-3 ${showHeader ? 'mx-3 py-3' : 'py-1'} gap-2 flex-wrap`}>
				{showHeader && (
					<h2 className='h4 mb-0 d-flex align-items-center gap-2 text-dark'>
						<Icon name='history' className='text-primary' /> {t('previousTests')}
					</h2>
				)}
				<div className='d-flex gap-2 ms-auto'>
					<Button
						variant={showFavoritesOnly ? 'warning' : 'outline-warning'}
						size='sm'
						className='d-flex align-items-center gap-2 fw-bold text-nowrap'
						onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
					>
						<Icon name={showFavoritesOnly ? 'starFill' : 'star'} />{' '}
						{t('favorites')}
					</Button>
					<Button
						variant='outline-danger'
						size='sm'
						className='d-flex align-items-center gap-2 fw-bold text-nowrap'
						onClick={clearHistory}
					>
						<Icon name='trash' /> {t('clear')}
					</Button>
				</div>
			</div>
			{showFavoritesOnly &&
				testHistory.filter((t) => t.isFavorite).length === 0 && (
					<div className='p-4 text-center text-muted'>
						<Icon name='star' size={48} className='mb-3 opacity-25' />
						<p className='mb-0'>{t('noFavoriteTestsYet')}</p>
					</div>
				)}
			<ListGroup className='rounded-3 overflow-hidden'>
				{testHistory
					.filter((t) => !showFavoritesOnly || t.isFavorite)
					.sort((a, b) => b.timestamp - a.timestamp)
					.map((test, index) => (
						<ListGroup.Item
							key={test.id || index}
							action
							onClick={() => {
								if (onTestClick) onTestClick();
								router.push(
									test.timestamp
										? `/results?id=${test.id}`
										: `/test?id=${test.id}`,
								);
							}}
							className='d-flex justify-content-between align-items-center py-3 mb-2 border-0 shadow-sm'
						>
							<div className='d-flex align-items-center gap-3 flex-grow-1 overflow-hidden'>
								<div
									className='d-flex align-items-center justify-content-center'
									style={{ width: '44px', height: '44px', cursor: 'pointer', marginLeft: '-12px' }}
									onClick={(e) => toggleFavorite(e, test.id)}
								>
									<Icon
										name={test.isFavorite ? 'starFill' : 'star'}
										size={20}
										className={test.isFavorite ? 'text-warning' : 'text-muted opacity-25'}
									/>
								</div>
								<div className='text-truncate'>
									<h6 className='mb-1 text-primary text-truncate'>
										{test.topic || t('untitledTest')}
									</h6>
									{test.timestamp && (
										<small className='text-muted d-flex align-items-center gap-1'>
											<Icon name='clock' /> {formatDateTime(test.timestamp)}
										</small>
									)}
								</div>
							</div>
							{test.userAnswers ? (
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
							) : (
								<Badge pill className='fs-6'>
									{t('newBadge')}
								</Badge>
							)}
						</ListGroup.Item>
					))}
			</ListGroup>
		</div>
	);
}
