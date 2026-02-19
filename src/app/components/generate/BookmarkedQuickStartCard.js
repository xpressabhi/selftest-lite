'use client';

import { memo } from 'react';
import { Card, Badge, Row, Col, Button } from 'react-bootstrap';
import Icon from '../Icon';

const BookmarkedQuickStartCard = memo(function BookmarkedQuickStartCard({
	t,
	loading,
	bookmarkedExams,
	bookmarkedQuizPresets,
	onQuickStartExam,
	onQuickStartPreset,
}) {
	const hasBookmarkedExams = bookmarkedExams.length > 0;
	const hasBookmarkedQuizPresets = bookmarkedQuizPresets.length > 0;
	const hasAnyBookmarks = hasBookmarkedExams || hasBookmarkedQuizPresets;

	if (!hasAnyBookmarks) {
		return null;
	}

	const columnSize = hasBookmarkedExams && hasBookmarkedQuizPresets ? 6 : 12;

	return (
		<Card className='w-100 border-0 glass-card mb-3' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-3 p-md-4'>
				<div className='d-flex justify-content-between align-items-center gap-2 mb-2'>
					<div className='fw-semibold'>{t('bookmarkedQuickStart')}</div>
					<Badge bg='light' text='dark' className='border'>
						{t('directCreate')}
					</Badge>
				</div>
				<Row className='g-3'>
					{hasBookmarkedExams && (
						<Col xs={12} md={columnSize}>
							<div className='small text-muted mb-1 d-flex align-items-center gap-1'>
								<Icon name='starFill' size={12} className='text-warning' />
								{t('bookmarkedExams')}
							</div>
							<div className='d-flex flex-wrap gap-2'>
								{bookmarkedExams.map((exam) => (
									<Button
										key={exam.id}
										type='button'
										size='sm'
										variant='outline-primary'
										className='rounded-pill'
										disabled={loading}
										onClick={() => onQuickStartExam(exam.id)}
									>
										{t('start')} {exam.name}
									</Button>
								))}
							</div>
						</Col>
					)}
					{hasBookmarkedQuizPresets && (
						<Col xs={12} md={columnSize}>
							<div className='small text-muted mb-1 d-flex align-items-center gap-1'>
								<Icon name='starFill' size={12} className='text-warning' />
								{t('bookmarkedQuizPresets')}
							</div>
							<div className='d-flex flex-wrap gap-2'>
								{bookmarkedQuizPresets.map((preset) => (
									<Button
										key={preset.id}
										type='button'
										size='sm'
										variant='outline-secondary'
										className='rounded-pill'
										disabled={loading}
										onClick={() => onQuickStartPreset(preset)}
									>
										{t('start')} {preset.label}
									</Button>
								))}
							</div>
						</Col>
					)}
				</Row>
			</Card.Body>
		</Card>
	);
});

export default BookmarkedQuickStartCard;
