'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Badge } from 'react-bootstrap';
import Icon from './Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';
import { buildReviewQueue } from '../utils/revisionInsights';

function getDueLabel(item, t) {
	if (item.isOverdue) {
		return t('overdueLabel');
	}
	if (item.isDueToday) {
		return t('reviewToday');
	}

	const dueDate = new Date(item.dueAt);
	const tomorrow = new Date();
	tomorrow.setHours(0, 0, 0, 0);
	tomorrow.setDate(tomorrow.getDate() + 1);
	if (dueDate >= tomorrow && dueDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
		return t('tomorrowLabel');
	}

	return t('upNext');
}

function ReviewQueueSection({ title, items, t, onReview }) {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className='d-flex flex-column gap-3'>
			<div className='small text-uppercase fw-bold text-muted'>{title}</div>
			{items.map((item) => (
				<div
					key={item.id}
					className='d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 rounded-4 border p-3 bg-white bg-opacity-50'
				>
					<div className='min-w-0'>
						<div className='fw-semibold text-dark'>{item.topic}</div>
						<div className='small text-muted'>
							{t('latestScoreLabel')} <strong>{item.accuracy}%</strong>
						</div>
					</div>
					<div className='d-flex align-items-center gap-2 flex-wrap justify-content-md-end'>
						<Badge
							bg={item.isOverdue ? 'danger' : item.isDueToday ? 'warning' : 'secondary'}
							text={item.isDueToday ? 'dark' : undefined}
							className='rounded-pill px-3 py-2'
						>
							{getDueLabel(item, t)}
						</Badge>
						<Button
							variant='outline-primary'
							className='rounded-pill px-4 text-nowrap'
							onClick={() => onReview(item)}
						>
							{t('startReview')}
						</Button>
					</div>
				</div>
			))}
		</div>
	);
}

export default function ReviewQueue() {
	const router = useRouter();
	const { t } = useLanguage();
	const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);
	const reviewQueue = useMemo(() => buildReviewQueue(testHistory), [testHistory]);

	if (reviewQueue.today.length === 0 && reviewQueue.upcoming.length === 0) {
		return null;
	}

	const handleReview = (item) => {
		const params = new URLSearchParams({
			start: 'create',
			mode: 'quiz-practice',
			topic: item.topic,
			difficulty: item.difficulty,
			testType: item.testType,
			numQuestions: String(item.numQuestions),
			paperLanguage: item.paperLanguage,
		});
		router.push(`/?${params.toString()}`);
	};

	return (
		<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-4'>
				<div className='d-flex align-items-center gap-2 mb-2'>
					<Icon name='clock' className='text-info' />
					<h2 className='h5 fw-bold mb-0'>{t('reviewQueueTitle')}</h2>
				</div>
				<p className='text-muted mb-4'>{t('reviewQueueBody')}</p>

				<div className='d-flex flex-column gap-4'>
					<ReviewQueueSection
						title={t('reviewToday')}
						items={reviewQueue.today}
						t={t}
						onReview={handleReview}
					/>
					<ReviewQueueSection
						title={t('upNext')}
						items={reviewQueue.upcoming}
						t={t}
						onReview={handleReview}
					/>
				</div>
			</Card.Body>
		</Card>
	);
}
