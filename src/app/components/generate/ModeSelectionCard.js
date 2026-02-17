'use client';

import { memo } from 'react';
import { Card, Row, Col, Button } from 'react-bootstrap';
import Icon from '../Icon';

const ModeSelectionCard = memo(function ModeSelectionCard({
	t,
	onSelectMode,
	fullExamValue,
	quizPracticeValue,
}) {
	return (
		<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-4 p-md-5'>
				<div className='d-flex flex-column gap-3'>
					<div className='fw-semibold'>{t('chooseTestMode')}</div>
					<Row className='g-2'>
						<Col xs={12} md={6}>
							<Button
								type='button'
								variant='outline-primary'
								className='w-100 py-3 d-flex align-items-center justify-content-center gap-2'
								onClick={() => onSelectMode(fullExamValue)}
							>
								<Icon name='bookOpen' />
								<span>{t('fullExamPaper')}</span>
							</Button>
						</Col>
						<Col xs={12} md={6}>
							<Button
								type='button'
								variant='outline-primary'
								className='w-100 py-3 d-flex align-items-center justify-content-center gap-2'
								onClick={() => onSelectMode(quizPracticeValue)}
							>
								<Icon name='sparkles' />
								<span>{t('quizPractice')}</span>
							</Button>
						</Col>
					</Row>
				</div>
			</Card.Body>
		</Card>
	);
});

export default ModeSelectionCard;
