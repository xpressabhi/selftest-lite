'use client';

import { memo } from 'react';
import { Card, Badge, Button } from 'react-bootstrap';
import Icon from '../Icon';

const ActiveModeCard = memo(function ActiveModeCard({
	t,
	currentModeLabel,
	onBackToModeSelection,
}) {
	return (
		<Card className='w-100 border-0 glass-card mb-2' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-3'>
				<div className='d-flex justify-content-between align-items-center gap-2'>
					<div className='d-flex align-items-center gap-2 flex-wrap'>
						<Badge bg='primary'>{currentModeLabel}</Badge>
					</div>
					<div className='d-flex align-items-center gap-1'>
						<Button
							type='button'
							variant='outline-secondary'
							size='sm'
							className='d-none d-md-inline-flex rounded-pill align-items-center gap-2'
							onClick={onBackToModeSelection}
						>
							<Icon name='repeat1' size={14} />
							{t('changeMode')}
						</Button>
						<Button
							type='button'
							variant='outline-secondary'
							size='sm'
							className='d-md-none rounded-circle d-inline-flex align-items-center justify-content-center p-0'
							style={{ width: '34px', height: '34px' }}
							onClick={onBackToModeSelection}
							aria-label={t('changeMode')}
							title={t('changeMode')}
						>
							<Icon name='repeat1' size={14} />
						</Button>
					</div>
				</div>
			</Card.Body>
		</Card>
	);
});

export default ActiveModeCard;
