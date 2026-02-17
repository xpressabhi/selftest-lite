'use client';

import { memo } from 'react';
import { Card, Form, InputGroup, Button, Alert } from 'react-bootstrap';

const TestIdEntryCard = memo(function TestIdEntryCard({
	t,
	testId,
	error,
	onTestIdChange,
	onSubmit,
}) {
	return (
		<Card className='w-100 border-0 glass-card mb-3' style={{ maxWidth: '720px' }}>
			<Card.Body className='p-3 p-md-4'>
				<Form onSubmit={onSubmit}>
					<Form.Group>
						<div className='small text-muted fw-semibold mb-2'>
							{t('haveTestIdTitle')}
						</div>
						<InputGroup className='mb-1'>
							<Form.Control
								type='text'
								placeholder={t('enterTestId')}
								value={testId}
								onChange={onTestIdChange}
								className='glass-input border-end-0'
								style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
							/>
							<Button
								variant='outline-primary'
								type='submit'
								className='border-start-0 px-4'
								style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
							>
								{t('go')}
							</Button>
						</InputGroup>
						<Form.Text className='text-muted small'>{t('haveTestId')}</Form.Text>
					</Form.Group>
					{error && (
						<Alert variant='danger' className='border-0 shadow-sm mt-3 mb-0'>
							{error}
						</Alert>
					)}
				</Form>
			</Card.Body>
		</Card>
	);
});

export default TestIdEntryCard;
