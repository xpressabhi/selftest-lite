'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Badge } from 'react-bootstrap';
import Icon from './Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';

const MAX_RECOMMENDATIONS = 3;

function getAccuracyPercentage(entry) {
	const score = Number(entry?.score);
	const totalQuestions = Number(entry?.totalQuestions);
	if (!Number.isFinite(score) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
		return null;
	}
	return Math.round((score / totalQuestions) * 100);
}

function buildRevisionRecommendations(history) {
	if (!Array.isArray(history)) {
		return [];
	}

	return history
		.filter((entry) => entry?.userAnswers && entry?.topic)
		.map((entry) => {
			const accuracy = getAccuracyPercentage(entry);
			if (accuracy === null || accuracy >= 70) {
				return null;
			}

			return {
				id: String(entry.id || `${entry.topic}-${entry.timestamp || 0}`),
				topic: entry.topic,
				accuracy,
				difficulty: entry?.requestParams?.difficulty || 'intermediate',
				testType: entry?.requestParams?.testType || 'multiple-choice',
				numQuestions:
					Math.min(
						20,
						Math.max(5, Number(entry?.requestParams?.numQuestions) || 10),
					),
			};
		})
		.filter(Boolean)
		.sort((left, right) => {
			if (left.accuracy !== right.accuracy) {
				return left.accuracy - right.accuracy;
			}
			return left.topic.localeCompare(right.topic);
		})
		.filter((entry, index, items) => {
			return items.findIndex((item) => item.topic === entry.topic) === index;
		})
		.slice(0, MAX_RECOMMENDATIONS);
}

export default function RevisionQuickStart() {
	const router = useRouter();
	const { t } = useLanguage();
	const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);

	const recommendations = useMemo(
		() => buildRevisionRecommendations(testHistory),
		[testHistory],
	);

	if (recommendations.length === 0) {
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
		});
		router.push(`/?${params.toString()}`);
	};

	return (
		<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-4'>
				<div className='d-flex align-items-start justify-content-between gap-3 mb-3'>
					<div>
						<div className='d-flex align-items-center gap-2 mb-2'>
							<Icon name='activity' className='text-warning' />
							<h2 className='h5 fw-bold mb-0'>{t('revisionQuickStartTitle')}</h2>
						</div>
						<p className='text-muted mb-0'>{t('revisionQuickStartBody')}</p>
					</div>
					<Badge bg='warning' text='dark' className='rounded-pill px-3 py-2'>
						{recommendations.length}
					</Badge>
				</div>

				<div className='d-flex flex-column gap-3'>
					{recommendations.map((recommendation) => (
						<div
							key={recommendation.id}
							className='d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 rounded-4 border p-3 bg-white bg-opacity-50'
						>
							<div className='min-w-0'>
								<div className='fw-semibold text-dark'>{recommendation.topic}</div>
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
			</Card.Body>
		</Card>
	);
}
