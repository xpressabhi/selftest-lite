'use client';

import { memo } from 'react';
import { Card, Button } from 'react-bootstrap';
import Icon from '../Icon';

const NewTestEntryCard = memo(function NewTestEntryCard({
	t,
	onStartNewTest,
}) {
	return (
		<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-4 p-md-5'>
				<div className='d-flex flex-column gap-3'>
					<div>
						<div className='fw-semibold fs-5 mb-1'>{t('newTestEntryTitle')}</div>
						<p className='text-muted mb-0'>{t('newTestEntryDescription')}</p>
					</div>
					<Button
						type='button'
						variant='primary'
						className='w-100 py-3 fw-semibold d-flex align-items-center justify-content-center gap-2'
						onClick={onStartNewTest}
					>
						<Icon name='plusCircle' />
						<span>{t('startNewTest')}</span>
					</Button>
				</div>
			</Card.Body>
		</Card>
	);
});

export default NewTestEntryCard;
