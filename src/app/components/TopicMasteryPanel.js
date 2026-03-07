'use client';

import { useMemo } from 'react';
import { Card, Badge } from 'react-bootstrap';
import Icon from './Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';
import { buildTopicMasteryItems } from '../utils/revisionInsights';

function getTrendPresentation(trend, t) {
	if (trend === 'up') {
		return { symbol: '↑', label: t('improving'), tone: 'success' };
	}
	if (trend === 'down') {
		return { symbol: '↓', label: t('declining'), tone: 'danger' };
	}
	return { symbol: '→', label: t('steady'), tone: 'secondary' };
}

function getStatusLabel(status, t) {
	switch (status) {
		case 'strong':
			return t('masteryStrong');
		case 'improving':
			return t('improving');
		case 'steady':
			return t('steady');
		default:
			return t('masteryNeedsWork');
	}
}

export default function TopicMasteryPanel() {
	const { t } = useLanguage();
	const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);
	const masteryItems = useMemo(
		() => buildTopicMasteryItems(testHistory),
		[testHistory],
	);

	if (masteryItems.length === 0) {
		return null;
	}

	return (
		<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-4'>
				<div className='d-flex align-items-center gap-2 mb-2'>
					<Icon name='chart' className='text-primary' />
					<h2 className='h5 fw-bold mb-0'>{t('topicMasteryTitle')}</h2>
				</div>
				<p className='text-muted mb-4'>{t('topicMasteryBody')}</p>

				<div className='d-flex flex-column gap-3'>
					{masteryItems.map((item) => {
						const trend = getTrendPresentation(item.trend, t);
						return (
							<div
								key={item.id}
								className='rounded-4 border p-3 bg-white bg-opacity-50'
							>
								<div className='d-flex align-items-start justify-content-between gap-3 mb-3'>
									<div>
										<div className='fw-semibold text-dark'>{item.topic}</div>
										<div className='small text-muted'>
											{item.attempts} {t('attemptsLabel')}
										</div>
									</div>
									<Badge bg={trend.tone} className='rounded-pill px-3 py-2'>
										{trend.symbol} {trend.label}
									</Badge>
								</div>

								<div className='d-flex flex-wrap gap-2'>
									<Badge bg='light' text='dark' className='rounded-pill px-3 py-2 border'>
										{t('avg')} {item.averageAccuracy}%
									</Badge>
									<Badge bg='light' text='dark' className='rounded-pill px-3 py-2 border'>
										{t('latestScoreLabel')} {item.latestAccuracy}%
									</Badge>
									<Badge bg='light' text='dark' className='rounded-pill px-3 py-2 border'>
										{getStatusLabel(item.status, t)}
									</Badge>
								</div>
							</div>
						);
					})}
				</div>
			</Card.Body>
		</Card>
	);
}
