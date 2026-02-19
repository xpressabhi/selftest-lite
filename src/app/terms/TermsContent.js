'use client';

import { useLanguage } from '../context/LanguageContext';

export default function TermsContent() {
	const { t } = useLanguage();

	return (
		<main className='container py-5'>
			<h1 className='display-5 fw-bold mb-3'>{t('termsHeroTitle')}</h1>
			<p className='lead text-muted mb-5'>{t('termsHeroBody')}</p>

			<section className='mb-4'>
				<h2 className='h4 fw-bold mb-2'>{t('termsSectionUseTitle')}</h2>
				<p className='text-muted'>{t('termsSectionUseBody')}</p>
			</section>

			<section className='mb-0'>
				<h2 className='h4 fw-bold mb-2'>{t('termsSectionLiabilityTitle')}</h2>
				<p className='text-muted'>{t('termsSectionLiabilityBody')}</p>
			</section>
		</main>
	);
}
