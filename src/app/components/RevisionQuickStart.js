'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from 'react-bootstrap';
import Icon from './Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';
import {
	buildRevisionRecommendations,
	buildReviewQueue,
	buildTopicMasteryItems,
} from '../utils/revisionInsights';

function formatTopicSummary(topics) {
	if (topics.length <= 2) {
		return topics.join(', ');
	}

	return `${topics.slice(0, 2).join(', ')} +${topics.length - 2}`;
}

export default function RevisionQuickStart() {
	const router = useRouter();
	const { t } = useLanguage();
	const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);

	const recommendations = useMemo(
		() => buildRevisionRecommendations(testHistory, 2),
		[testHistory],
	);
	const reviewQueue = useMemo(() => buildReviewQueue(testHistory), [testHistory]);
	const masteryItems = useMemo(
		() => buildTopicMasteryItems(testHistory, 4),
		[testHistory],
	);
	const reviewTodayItems = reviewQueue.today.slice(0, 2);
	const needsWorkTopics = masteryItems
		.filter((item) => item.status === 'needs-work')
		.map((item) => item.topic);
	const improvingTopics = masteryItems
		.filter((item) => item.status === 'improving')
		.map((item) => item.topic);

	if (
		recommendations.length === 0 &&
		reviewTodayItems.length === 0 &&
		needsWorkTopics.length === 0 &&
		improvingTopics.length === 0
	) {
		return null;
	}

	const handleStartRevision = (recommendation) => {
		const params = new URLSearchParams({
			start: 'create',
			mode: 'quiz-practice',
			topic: recommendation.topic,
			difficulty: recommendation.difficulty,
			testType: recommendation.testType,
			numQuestions: String(recommendation.numQuestions),
			paperLanguage: recommendation.paperLanguage,
		});
		router.push(`/?${params.toString()}`);
	};

	return (
		<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-4'>
				<div className='d-flex align-items-center gap-2 mb-2'>
					<Icon name='repeat1' className='text-warning' />
					<h2 className='h5 fw-bold mb-0'>{t('revisionQuickStartTitle')}</h2>
				</div>
				<p className='text-muted mb-4'>{t('revisionQuickStartBody')}</p>

				<div className='d-flex flex-column gap-4'>
						{recommendations.length > 0 && (
							<div className='d-flex flex-column gap-3'>
								{recommendations.map((recommendation) => (
								<div
									key={recommendation.id}
									className='d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 rounded-4 border p-3 bg-white bg-opacity-50'
								>
									<div className='min-w-0'>
										<div className='fw-semibold text-dark'>
											{recommendation.topic}
										</div>
										<div className='small text-muted'>
											{t('revisionRecommendationReasonPrefix')}{' '}
											<strong>{recommendation.accuracy}%</strong>{' '}
											{t('revisionRecommendationReasonSuffix')}
										</div>
									</div>
									<Button
										variant='outline-primary'
										className='rounded-pill px-4 text-nowrap'
										onClick={() => handleStartRevision(recommendation)}
									>
										{t('reviseAgain')}
									</Button>
									</div>
								))}
							</div>
						)}

						{reviewTodayItems.length > 0 && (
						<div className='d-flex flex-column gap-2 pt-2 border-top'>
							<div className='small text-uppercase fw-bold text-muted'>
								{t('reviewToday')}
							</div>
							{reviewTodayItems.map((item) => (
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
									<Button
										variant='outline-primary'
										className='rounded-pill px-4 text-nowrap'
										onClick={() => handleStartRevision(item)}
									>
										{t('startReview')}
									</Button>
								</div>
							))}
						</div>
					)}

					{(needsWorkTopics.length > 0 || improvingTopics.length > 0) && (
						<div className='d-flex flex-column gap-2 pt-2 border-top'>
							{needsWorkTopics.length > 0 && (
								<div className='small text-muted'>
									<span className='fw-semibold text-dark'>
										{t('masteryNeedsWork')}:
									</span>{' '}
									{formatTopicSummary(needsWorkTopics)}
								</div>
							)}
							{improvingTopics.length > 0 && (
								<div className='small text-muted'>
									<span className='fw-semibold text-dark'>
										{t('improving')}:
									</span>{' '}
									{formatTopicSummary(improvingTopics)}
								</div>
							)}
						</div>
					)}
				</div>
			</Card.Body>
		</Card>
	);
}
