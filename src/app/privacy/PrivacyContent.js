'use client';

import Link from 'next/link';
import Icon from '../components/Icon';
import { useLanguage } from '../context/LanguageContext';

export default function PrivacyContent() {
	const { t } = useLanguage();

	return (
		<main className='container py-5'>
			<div className='row justify-content-center'>
				<div className='col-lg-10'>
					<div className='text-center mb-5'>
						<h1 className='display-4 fw-bold mb-3'>{t('privacyHeroTitle')}</h1>
						<p className='lead text-muted'>{t('privacyHeroBody')}</p>
					</div>

					<div className='row'>
						<div className='col-lg-3 d-none d-lg-block'>
							<div
								className='sticky-top'
								style={{ top: 'calc(var(--navbar-height) + 16px)' }}
							>
								<nav id='privacy-nav' className='nav flex-column' aria-label={t('privacySideNavigation')}>
									<a className='nav-link text-muted active fw-bold' href='#collection'>
										{t('privacyNavCollection')}
									</a>
									<a className='nav-link text-muted' href='#usage'>
										{t('privacyNavUsage')}
									</a>
									<a className='nav-link text-muted' href='#cookies'>
										{t('privacyNavCookies')}
									</a>
									<a className='nav-link text-muted' href='#rights'>
										{t('privacyNavRights')}
									</a>
									<a className='nav-link text-muted' href='#contact'>
										{t('privacyNavContact')}
									</a>
								</nav>
							</div>
						</div>

						<div className='col-lg-9'>
							<div className='card border-0 shadow-sm rounded-4 p-4 p-md-5'>
								<div className='mb-5' id='collection'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='file' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>{t('privacySection1Title')}</h2>
									</div>
									<p className='text-muted mb-4'>{t('privacySection1Body')}</p>
									<div className='bg-light rounded-4 p-4'>
										<ul className='list-unstyled mb-0'>
											<li className='mb-3 d-flex align-items-start'>
												<Icon name='checkCircle' className='text-success me-2 mt-1' size={18} />
												<div>
													<strong>{t('privacyItemHistoryTitle')}</strong> {t('privacyItemHistoryBody')}
												</div>
											</li>
											<li className='mb-3 d-flex align-items-start'>
												<Icon name='checkCircle' className='text-success me-2 mt-1' size={18} />
												<div>
													<strong>{t('privacyItemContactTitle')}</strong> {t('privacyItemContactBody')}
												</div>
											</li>
											<li className='d-flex align-items-start'>
												<Icon name='checkCircle' className='text-success me-2 mt-1' size={18} />
												<div>
													<strong>{t('privacyItemAnalyticsTitle')}</strong> {t('privacyItemAnalyticsBody')}
												</div>
											</li>
										</ul>
									</div>
								</div>

								<div className='mb-5' id='usage'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='lightbulb' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>{t('privacySection2Title')}</h2>
									</div>
									<p className='text-muted'>{t('privacySection2Body')}</p>
								</div>

								<div className='mb-5' id='cookies'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='info' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>{t('privacySection3Title')}</h2>
									</div>
									<p className='text-muted'>{t('privacySection3Body')}</p>
								</div>

								<div className='mb-5' id='rights'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='lock' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>{t('privacySection4Title')}</h2>
									</div>
									<p className='text-muted'>{t('privacySection4Body')}</p>
								</div>

								<div className='mb-0' id='contact'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='envelope' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>{t('privacySection5Title')}</h2>
									</div>
									<p className='text-muted mb-3'>{t('privacySection5Body')}</p>
									<Link href='/contact' className='btn btn-outline-primary rounded-pill px-4'>
										{t('privacyContactButton')}
									</Link>
								</div>

								<div className='text-muted small border-top pt-4 mt-5'>
									{t('privacyLastUpdated')}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
