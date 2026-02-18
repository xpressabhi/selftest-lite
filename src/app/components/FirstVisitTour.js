'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, ProgressBar } from 'react-bootstrap';
import Icon from './Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import { APP_EVENTS, STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';

export default function FirstVisitTour() {
	const { t } = useLanguage();
	const [
		tourCompleted,
		setTourCompleted,
		__,
		___,
		isTourStorageHydrated,
	] = useLocalStorage(STORAGE_KEYS.HOME_TOUR_COMPLETED, false);
	const [showTour, setShowTour] = useState(false);
	const [activeStepIndex, setActiveStepIndex] = useState(0);

	const steps = useMemo(
		() => [
			{
				icon: 'bookOpen',
				title: t('tourStepWelcomeTitle'),
				description: t('tourStepWelcomeBody'),
			},
			{
				icon: 'clipboard',
				title: t('tourStepModeTitle'),
				description: t('tourStepModeBody'),
			},
			{
				icon: 'bookmark',
				title: t('tourStepBookmarksTitle'),
				description: t('tourStepBookmarksBody'),
			},
			{
				icon: 'checkCircle',
				title: t('tourStepResultsTitle'),
				description: t('tourStepResultsBody'),
			},
		],
		[t],
	);
	const isLastStep = activeStepIndex === steps.length - 1;
	const progress = ((activeStepIndex + 1) / steps.length) * 100;
	const currentStep = steps[activeStepIndex];

	useEffect(() => {
		if (!isTourStorageHydrated) return;
		if (!tourCompleted) {
			setShowTour(true);
		}
	}, [isTourStorageHydrated, tourCompleted]);

	useEffect(() => {
		if (!isTourStorageHydrated) return;
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (url.searchParams.get('tour') !== '1') return;
		setShowTour(true);
		setActiveStepIndex(0);
		url.searchParams.delete('tour');
		const cleanedPath = `${url.pathname}${url.search}${url.hash}`;
		window.history.replaceState({}, '', cleanedPath);
	}, [isTourStorageHydrated]);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;
		const handleOpenTour = () => {
			setShowTour(true);
			setActiveStepIndex(0);
		};
		window.addEventListener(APP_EVENTS.OPEN_TOUR, handleOpenTour);
		return () => window.removeEventListener(APP_EVENTS.OPEN_TOUR, handleOpenTour);
	}, []);

	useEffect(() => {
		if (!showTour) {
			setActiveStepIndex(0);
		}
	}, [showTour]);

	const handleSkipOrFinish = () => {
		setTourCompleted(true);
		setShowTour(false);
	};

	const handleNext = () => {
		if (isLastStep) {
			handleSkipOrFinish();
			return;
		}
		setActiveStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
	};

	const handlePrevious = () => {
		setActiveStepIndex((prev) => Math.max(prev - 1, 0));
	};

	if (!isTourStorageHydrated) {
		return null;
	}

	return (
		<Modal
			show={showTour}
			onHide={handleSkipOrFinish}
			centered
			backdrop='static'
			keyboard={false}
		>
			<Modal.Header closeButton>
				<Modal.Title className='d-flex align-items-center gap-2'>
					<Icon name='sparkles' size={18} />
					<span>{t('tourTitle')}</span>
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<div className='d-flex align-items-start gap-3 mb-3'>
					<div
						className='d-inline-flex align-items-center justify-content-center rounded-circle'
						style={{
							width: '40px',
							height: '40px',
							background: 'rgba(59, 130, 246, 0.14)',
							color: 'var(--accent-primary)',
							flexShrink: 0,
						}}
					>
						<Icon name={currentStep.icon} size={18} />
					</div>
					<div>
						<h3 className='h6 mb-2 fw-bold'>{currentStep.title}</h3>
						<p className='mb-0 text-muted'>{currentStep.description}</p>
					</div>
				</div>

				<ProgressBar now={progress} style={{ height: '6px' }} />
				<div className='small text-muted mt-2 text-end'>
					{t('tourStepLabel')} {activeStepIndex + 1} / {steps.length}
				</div>
			</Modal.Body>
			<Modal.Footer className='justify-content-between'>
				<Button variant='outline-secondary' onClick={handleSkipOrFinish}>
					{t('tourSkip')}
				</Button>
				<div className='d-flex align-items-center gap-2'>
					<Button
						variant='outline-primary'
						onClick={handlePrevious}
						disabled={activeStepIndex === 0}
					>
						{t('tourPrevious')}
					</Button>
					<Button variant='primary' onClick={handleNext}>
						{isLastStep ? t('tourFinish') : t('tourNext')}
					</Button>
				</div>
			</Modal.Footer>
		</Modal>
	);
}
