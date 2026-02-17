'use client';

import { Container } from 'react-bootstrap';
import Icon from '../components/Icon';
import { useLanguage } from '../context/LanguageContext';
import TestHistory from '../components/TestHistory';

export default function HistoryPage() {
	const { t } = useLanguage();

    return (
        <Container className="py-4 d-flex flex-column align-items-center">
			<div className='w-100 mb-3' style={{ maxWidth: '800px' }}>
				<div className='d-flex align-items-center gap-3 mb-2'>
					<Icon name='history' className='text-primary display-6' />
					<div>
						<h1 className='display-6 fw-bold mb-0'>{t('history')}</h1>
						<p className='text-muted mb-0'>{t('previousTests')}</p>
					</div>
				</div>
			</div>
            <TestHistory showHeader={false} />
        </Container>
    );
}
