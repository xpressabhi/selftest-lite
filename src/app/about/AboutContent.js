'use client';

import Link from 'next/link';
import Icon from '../components/Icon';
import { useLanguage } from '../context/LanguageContext';

export default function AboutContent() {
	const { t } = useLanguage();

	return (
		<main className='container py-5'>
			<section className='text-center mb-5'>
				<div className='d-inline-flex align-items-center justify-content-center p-3 bg-primary-subtle text-primary rounded-circle mb-4'>
					<Icon name='sparkles' size={32} />
				</div>
				<h1 className='display-4 fw-bold mb-3'>{t('aboutHeroTitle')}</h1>
				<p className='lead text-muted mx-auto' style={{ maxWidth: '700px' }}>
					{t('aboutHeroBody')}
				</p>
			</section>

			<section className='row align-items-center mb-5'>
				<div className='col-lg-6 mb-4 mb-lg-0'>
					<h2 className='h2 fw-bold mb-3'>{t('aboutMissionTitle')}</h2>
					<p className='fs-5 text-secondary mb-4'>
						{t('aboutMissionBody')}
					</p>
					<div className='d-flex gap-3'>
						<div className='d-flex align-items-center text-primary'>
							<Icon name='checkCircle' className='me-2' />
							<span className='fw-medium'>{t('aboutBadgeFree')}</span>
						</div>
						<div className='d-flex align-items-center text-primary'>
							<Icon name='checkCircle' className='me-2' />
							<span className='fw-medium'>{t('aboutBadgePrivacy')}</span>
						</div>
					</div>
				</div>
				<div className='col-lg-6'>
					<div className='p-5 bg-light rounded-4 border position-relative overflow-hidden'>
						<div className='position-absolute top-0 end-0 p-3 opacity-10'>
							<Icon name='trophy' size={120} />
						</div>
						<h3 className='h4 fw-bold mb-4 position-relative'>{t('aboutWhyWorksTitle')}</h3>
						<ul className='list-unstyled mb-0 position-relative'>
							<li className='mb-3 d-flex align-items-start'>
								<div className='mt-1 me-3 text-primary'>
									<Icon name='repeat1' size={20} />
								</div>
								<span>
									<strong>{t('aboutWhyWorksPoint1Title')}</strong> {t('aboutWhyWorksPoint1Body')}
								</span>
							</li>
							<li className='mb-3 d-flex align-items-start'>
								<div className='mt-1 me-3 text-primary'>
									<Icon name='checkCircle' size={20} />
								</div>
								<span>
									<strong>{t('aboutWhyWorksPoint2Title')}</strong> {t('aboutWhyWorksPoint2Body')}
								</span>
							</li>
							<li className='d-flex align-items-start'>
								<div className='mt-1 me-3 text-primary'>
									<Icon name='lightbulb' size={20} />
								</div>
								<span>
									<strong>{t('aboutWhyWorksPoint3Title')}</strong> {t('aboutWhyWorksPoint3Body')}
								</span>
							</li>
						</ul>
					</div>
				</div>
			</section>

			<section className='mb-5'>
				<h2 className='text-center h2 fw-bold mb-5'>{t('aboutHowItWorksTitle')}</h2>
				<div className='row g-4 text-center'>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm bg-white position-relative overflow-hidden group-hover-effect'>
							<div className='mb-4 text-primary'>
								<Icon name='bookOpen' size={48} />
							</div>
							<h3 className='h4 fw-bold'>{t('aboutStep1Title')}</h3>
							<p className='text-muted'>{t('aboutStep1Body')}</p>
						</div>
					</div>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm bg-white position-relative overflow-hidden'>
							<div className='mb-4 text-primary'>
								<Icon name='sparkles' size={48} />
							</div>
							<h3 className='h4 fw-bold'>{t('aboutStep2Title')}</h3>
							<p className='text-muted'>{t('aboutStep2Body')}</p>
						</div>
					</div>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm bg-white position-relative overflow-hidden'>
							<div className='mb-4 text-primary'>
								<Icon name='trophy' size={48} />
							</div>
							<h3 className='h4 fw-bold'>{t('aboutStep3Title')}</h3>
							<p className='text-muted'>{t('aboutStep3Body')}</p>
						</div>
					</div>
				</div>
			</section>

			<section className='mb-5 py-5 border-top border-bottom'>
				<div className='row align-items-center'>
					<div className='col-lg-5 mb-4 mb-lg-0'>
						<h2 className='h2 fw-bold mb-3'>{t('aboutBuiltTitle')}</h2>
						<p className='text-muted'>{t('aboutBuiltBody')}</p>
					</div>
					<div className='col-lg-7'>
						<div className='row g-4'>
							<div className='col-sm-6'>
								<h4 className='h6 fw-bold d-flex align-items-center mb-2'>
									<Icon name='lock' className='me-2 text-primary' size={18} />
									{t('aboutValuePrivacyTitle')}
								</h4>
								<p className='small text-muted'>{t('aboutValuePrivacyBody')}</p>
							</div>
							<div className='col-sm-6'>
								<h4 className='h6 fw-bold d-flex align-items-center mb-2'>
									<Icon name='zap' className='me-2 text-primary' size={18} />
									{t('aboutValueSpeedTitle')}
								</h4>
								<p className='small text-muted'>{t('aboutValueSpeedBody')}</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className='text-center py-5 bg-light rounded-4 position-relative overflow-hidden'>
				<div className='position-relative z-1'>
					<h2 className='h3 fw-bold mb-3'>{t('aboutCtaTitle')}</h2>
					<p className='mb-4 text-muted'>{t('aboutCtaBody')}</p>
					<Link href='/' className='btn btn-primary btn-lg px-5 rounded-pill shadow-sm'>
						{t('aboutCtaButton')}
					</Link>
				</div>
			</section>
		</main>
	);
}
