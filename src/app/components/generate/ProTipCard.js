'use client';

import { memo } from 'react';
import { Card } from 'react-bootstrap';
import Icon from '../Icon';

const ProTipCard = memo(function ProTipCard({
	t,
	activeMode,
	fullExamValue,
}) {
	return (
		<Card className='border-0 bg-transparent'>
			<Card.Body className='text-center p-3'>
				<div className='d-flex flex-column align-items-center opacity-75'>
					<div className='d-flex align-items-center gap-2 mb-2'>
						<Icon name='lightbulb' className='text-warning' />
						<span className='fw-semibold'>{t('proTip')}</span>
					</div>
					<p className='text-muted small mb-0' style={{ maxWidth: '460px' }}>
						{activeMode === fullExamValue
							? t('fullExamProTip')
							: t('proTipContent')}
					</p>
				</div>
			</Card.Body>
		</Card>
	);
});

export default ProTipCard;
