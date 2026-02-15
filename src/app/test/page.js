'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { STORAGE_KEYS } from '../constants';
import Icon from '../components/Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import Loading from '../components/Loading';
import FloatingButtonWithCopy from '../components/FloatingButtonWithCopy';
import { useLanguage } from '../context/LanguageContext';
import useBookmarks from '../hooks/useBookmarks';
import useSoundEffects from '../hooks/useSoundEffects';
import SoundToggle from '../components/SoundToggle';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

import Share from '../components/Share';
import Print from '../components/Print';
import { Container, Button, Spinner, Alert, Card, ProgressBar, Modal } from 'react-bootstrap';

function TestContent() {
	const searchParams = useSearchParams();
	const testId = searchParams.get('id');
	const [testHistory, _, updateHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const [answers, setAnswers, __, cleanUpAnswers] = useLocalStorage(
		`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers_${testId}`,
		{},
	);
	const [questionPaper, setQuestionPaper] = useState(null);
	const [loading, setLoading] = useState(true);

	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [fadeState, setFadeState] = useState('fade-in'); // 'fade-in' or 'fade-out'
	const router = useRouter();
	const timeoutRef = useRef(null);
	const questionFormRef = useRef(null);
	const touchStartXRef = useRef(null);
	const [error, setError] = useState(null);
	const [showSubmitModal, setShowSubmitModal] = useState(false);
	const [elapsedTime, setElapsedTime] = useState(0); // in seconds
	const timerRef = useRef(null);
	const { t } = useLanguage();
	const { isBookmarked, toggleBookmark } = useBookmarks();

	// UX Enhancement: Sound effects
	const { playSelect, playTick } = useSoundEffects();

	const [timeLeft, setTimeLeft] = useState(null); // For speed challenge
	const [isSubmitted, setIsSubmitted] = useState(false);

	const scrollToQuestionTop = () => {
		if (!questionFormRef.current || typeof window === 'undefined') return;
		const stickyHeaderOffset = 84;
		const targetTop =
			questionFormRef.current.getBoundingClientRect().top +
			window.scrollY -
			stickyHeaderOffset;
		window.scrollTo({
			top: Math.max(0, targetTop),
			behavior: 'smooth',
		});
	};

	useEffect(() => {
		if (testId) {
			const existingTest = testHistory.find((t) => t.id == testId); // use loose equality to handle string vs number
			if (existingTest) {
				if (existingTest.userAnswers) {
					router.push('/results?id=' + existingTest.id);
				} else {
					setQuestionPaper(existingTest);
					setLoading(false);
				}
			} else {
				fetch(`/api/test?id=${testId}`)
					.then((res) => res.json())
					.then((data) => {
						if (data.error) {
							setError(data.error);
							setLoading(false);
							return;
						}
						const paper = { ...data.test, id: data.id };
						updateHistory(paper);
						setQuestionPaper(paper);
						setLoading(false);
					})
					.catch((err) => {
						setLoading(false);
						setError('Failed to load test. Please try again. ' + err.message);
					});
			}
		}
	}, [router, testHistory, testId, updateHistory]);

	// Initialize Speed Challenge timer
	useEffect(() => {
		if (questionPaper && questionPaper.requestParams?.testType === 'speed-challenge' && timeLeft === null) {
			// 20 seconds per question for speed challenge
			const totalTime = questionPaper.questions.length * 20;
			setTimeLeft(totalTime);
		}
	}, [questionPaper, timeLeft]);

	// Set document title based on current questionPaper topic
	useEffect(() => {
		if (typeof document === 'undefined') return;
		const prev = document.title;
		if (questionPaper?.topic) {
			document.title = `${questionPaper.topic} - selftest.in`;
		}
		return () => {
			document.title = prev;
		};
	}, [questionPaper?.topic]);

	// Timer logic (Elapsed time & Speed Challenge Countdown)
	useEffect(() => {
		if (loading || !questionPaper || isSubmitted) return;

		timerRef.current = setInterval(() => {
			setElapsedTime((prev) => prev + 1);

			// Speed Challenge Countdown
			if (timeLeft !== null) {
				setTimeLeft((prev) => {
					if (prev <= 1) {
						// Time's up!
						clearInterval(timerRef.current);
						// Need to use a ref or function to access latest state if needed, 
						// but confirmSubmit uses questionPaper and answers which are stable or refs might be needed.
						// However, we can just trigger submit here.
						// We need to call confirmSubmit, but it depends on state.
						// Let's use a flag to trigger it in another effect or just call it if deps are fine.
						// Since confirmSubmit is closed over render scope, we might have stale state issues inside setInterval.
						// Better to set a flag 'timeExpired'.
						return 0;
					}
					return prev - 1;
				});
			}
		}, 1000);

		return () => clearInterval(timerRef.current);
	}, [loading, questionPaper, isSubmitted, timeLeft]);

	// Auto-submit when time runs out
	useEffect(() => {
		if (timeLeft === 0 && !isSubmitted) {
			confirmSubmit();
		}
	}, [timeLeft, isSubmitted]);

	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	const handleAnswerChange = (questionIndex, answer) => {
		// Play selection sound for tactile feedback
		playSelect();

		const updatedAnswers = {
			...answers,
			[questionIndex]: answer,
		};
		setAnswers(updatedAnswers);

		// Only advance if not last question
		if (
			questionPaper &&
			currentQuestionIndex < questionPaper.questions.length - 1
		) {
			setFadeState('fade-out');
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => {
				setCurrentQuestionIndex((prev) => prev + 1);
				setFadeState('fade-in');
				scrollToQuestionTop();
			}, 300);
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		setShowSubmitModal(true);
	};

	const confirmSubmit = () => {
		if (isSubmitted) return;
		setIsSubmitted(true);

		const calculatedScore =
			questionPaper.questions.filter((q, index) => answers[index] === q.answer)
				.length || 0;
		const updatedPaper = {
			...questionPaper,
			userAnswers: answers,
			timestamp: Date.now(),
			totalQuestions: questionPaper.questions.length,
			score: calculatedScore,
			timeTaken: elapsedTime, // Store total time taken in seconds
			isSpeedChallenge: questionPaper.requestParams?.testType === 'speed-challenge',
		};
		updateHistory(updatedPaper);
		cleanUpAnswers();

		router.push('/results?id=' + questionPaper.id);
	};

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	// Ensure fade-in when question index changes (in case of manual jump)
	useEffect(() => {
		setFadeState('fade-in');
	}, [currentQuestionIndex]);

	const handlePrevClick = useCallback(() => {
		if (currentQuestionIndex > 0) {
			setFadeState('fade-out');
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => {
				setCurrentQuestionIndex((prev) => prev - 1);
				setFadeState('fade-in');
			}, 300);
		}
	}, [currentQuestionIndex]);

	const handleNextClick = useCallback(() => {
		if (
			questionPaper &&
			currentQuestionIndex < questionPaper.questions.length - 1
		) {
			setFadeState('fade-out');
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => {
				setCurrentQuestionIndex((prev) => prev + 1);
				setFadeState('fade-in');
			}, 300);
		}
	}, [currentQuestionIndex, questionPaper]);

	const onTouchStart = (e) => {
		touchStartXRef.current = e.touches[0].clientX;
	};

	const onTouchEnd = (e) => {
		if (touchStartXRef.current === null) return;
		const touchEndX = e.changedTouches[0].clientX;
		const diffX = touchEndX - touchStartXRef.current;
		const threshold = 50; // minimum px to consider swipe

		if (diffX > threshold) {
			// Swipe right: go to previous question
			handlePrevClick();
		} else if (diffX < -threshold) {
			// Swipe left: go to next question
			handleNextClick();
		}
		touchStartXRef.current = null;
	};

	if (loading) {
		return <Loading />;
	}

	if (!questionPaper) {
		return (
			<Container className='text-center mt-5'>
				<h1>
					<Icon name='exclamationCircle' className='text-warning mb-3' /> {t('noTestFound')}
				</h1>
				<p>{t('pleaseGenerate')}</p>
				{error && <Alert variant='danger'>{error}</Alert>}
				<Button
					variant='primary'
					className='d-flex align-items-center gap-2 mx-auto'
					onClick={() => router.push('/')}
				>
					<Icon name='home' />
					{t('home')}
				</Button>
			</Container>
		);
	}
	if (!questionPaper.questions) return null;

	const q = questionPaper.questions?.[currentQuestionIndex];
	const index = currentQuestionIndex;
	const progress = ((index + 1) / questionPaper.questions.length) * 100;

	const answeredCount = Object.keys(answers).length;
	const totalCount = questionPaper.questions.length;
	const remainingCount = totalCount - answeredCount;

	return (
		<div className='d-flex flex-column min-vh-100 pb-5'>
			{/* Sticky Header with Progress Bar */}
			<div className='sticky-top bg-white bg-opacity-90 backdrop-blur border-bottom shadow-sm py-2 px-3 mb-4' style={{ zIndex: 1020 }}>
				<Container style={{ maxWidth: 720 }}>
					<div className='d-flex justify-content-between align-items-center mb-1'>
						<small className='text-muted fw-semibold'>
							{t('question')} {index + 1} {t('of')} {questionPaper.questions.length}
						</small>
						<small className='text-muted fw-semibold'>
							{Math.round(progress)}%
						</small>
					</div>
					<div className='d-flex justify-content-center align-items-center mb-2 gap-3'>
						{timeLeft !== null ? (
							<div
								className={`rounded-pill px-3 py-1 d-flex align-items-center gap-2 border shadow-sm ${timeLeft <= 10 ? 'bg-danger text-white' : 'bg-light text-dark'}`}
								style={{
									transition: 'all 0.3s ease',
									animation: timeLeft <= 10 ? 'pulse 1s infinite' : 'none'
								}}
							>
								<Icon name='clock' size={14} className={timeLeft <= 10 ? 'text-white' : 'text-danger'} />
								<span className='fw-bold font-monospace small'>
									{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
								</span>
								<span className='small opacity-75'>left</span>
							</div>
						) : (
							<div className='bg-light rounded-pill px-3 py-1 d-flex align-items-center gap-2 border shadow-sm'>
								<Icon name='clock' size={14} className='text-primary' />
								<span className='fw-bold text-dark font-monospace small'>
									{formatTime(elapsedTime)}
								</span>
							</div>
						)}

						{/* Sound Toggle */}
						<div className='d-flex align-items-center'>
							<SoundToggle variant="light" size="sm" className="rounded-circle border-0 text-muted" />
						</div>
					</div>
					<ProgressBar
						now={progress}
						variant={timeLeft !== null && timeLeft <= 10 ? 'danger' : 'primary'}
						style={{ height: '6px', borderRadius: '10px', transition: 'all 0.3s ease' }}
						className='bg-secondary bg-opacity-10'
					/>
				</Container>
			</div>

			<Container
				className='d-flex flex-column flex-grow-1 justify-content-center align-items-center px-2'
				style={{
					paddingBottom:
						'calc(var(--bottom-nav-height) + 120px + env(safe-area-inset-bottom, 0px))',
				}}
			>
				<div className='w-100 mb-4' style={{ maxWidth: 720 }}>
					<h3 className='d-flex align-items-center gap-2 mt-2 mb-4 text-center justify-content-center'>
						<Icon name='bookOpen' className='text-primary' />
						<span className='fw-bold text-dark fs-4'>
							<MarkdownRenderer>{questionPaper.topic}</MarkdownRenderer>
						</span>
					</h3>
				</div>

				<form
					onSubmit={handleSubmit}
					className='w-100 position-relative'
					style={{ maxWidth: 720 }}
					ref={questionFormRef}
				>
					{/* Desktop Navigation Buttons */}
					<div
						className='d-none d-md-flex justify-content-between position-absolute w-100'
						style={{
							top: '50%',
							transform: 'translateY(-50%)',
							left: 0,
							zIndex: 1,
							pointerEvents: 'none',
						}}
					>
						<Button
							variant='light'
							className='rounded-circle shadow-sm d-flex align-items-center justify-content-center border-0'
							style={{
								width: '56px',
								height: '56px',
								marginLeft: '-80px',
								pointerEvents: 'auto',
								background: 'rgba(255, 255, 255, 0.8)',
								backdropFilter: 'blur(10px)'
							}}
							onClick={handlePrevClick}
							disabled={currentQuestionIndex === 0 || fadeState === 'fade-out'}
						>
							<Icon name='chevronRight' style={{ transform: 'rotate(180deg)' }} />
						</Button>
						<Button
							variant='light'
							className='rounded-circle shadow-sm d-flex align-items-center justify-content-center border-0'
							style={{
								width: '56px',
								height: '56px',
								marginRight: '-80px',
								pointerEvents: 'auto',
								background: 'rgba(255, 255, 255, 0.8)',
								backdropFilter: 'blur(10px)'
							}}
							onClick={handleNextClick}
							disabled={
								currentQuestionIndex === questionPaper.questions.length - 1 ||
								fadeState === 'fade-out'
							}
						>
							<Icon name='chevronRight' />
						</Button>
					</div>

					<div
						key={index}
						className={`fade-slide ${fadeState} w-100`}
						onTouchStart={onTouchStart}
						onTouchEnd={onTouchEnd}
						style={{
							marginBottom: '2rem',
							minHeight: '350px',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						{/* Question Card */}
						<Card className='w-100 border-0 glass-card mb-4 shadow-sm position-relative'>
							<Card.Body className='p-4 p-md-5 text-center'>
								<Button
									variant='link'
									className={`position-absolute top-0 end-0 m-3 p-0 ${isBookmarked(q) ? 'text-primary' : 'text-muted opacity-25'
										}`}
									onClick={() => toggleBookmark(q)}
									style={{ zIndex: 10 }}
								>
									<Icon name={isBookmarked(q) ? 'bookmarkFill' : 'bookmark'} size={28} />
								</Button>
								<div className='fs-4 fw-medium text-dark pt-3'>
									<MarkdownRenderer>{q.question}</MarkdownRenderer>
								</div>
							</Card.Body>
						</Card>

						{/* Options */}
						<div className='w-100 d-flex flex-column gap-3'>
							{q.options.map((option, i) => (
								<div
									key={i}
									className={`
										d-flex align-items-center p-3 rounded-3 cursor-pointer transition-all
										${answers[index] === option
											? 'bg-primary bg-opacity-10 border border-primary'
											: 'bg-white border border-light shadow-sm hover-shadow'
										}
									`}
									style={{
										transition: 'all 0.2s ease',
										cursor: fadeState === 'fade-out' ? 'not-allowed' : 'pointer',
										opacity: fadeState === 'fade-out' ? 0.7 : 1,
									}}
									onClick={() =>
										fadeState !== 'fade-out' &&
										handleAnswerChange(index, option)
									}
								>
									<div className='me-3 d-flex align-items-center text-primary'>
										{answers[index] === option ? (
											<Icon name='checkCircle' size={24} />
										) : (
											<Icon name='circle' size={24} className='text-muted opacity-50' />
										)}
									</div>
									<div className='flex-grow-1 fs-5 text-dark'>
										<MarkdownRenderer>{option}</MarkdownRenderer>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Remaining unanswered questions */}
					<div className='mb-4 text-center'>
						<small className='text-muted fw-medium'>
							{remainingCount > 0
								? `${remainingCount} question${remainingCount !== 1 ? 's' : ''
								} remaining`
								: 'All questions answered!'}
						</small>
					</div>

					<Button
						type='submit'
						variant='success'
						size='lg'
						className='w-100 d-none d-md-flex align-items-center justify-content-center gap-2 rounded-pill shadow-sm py-3 fw-bold'
						style={{
							background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
							border: 'none'
						}}
					>
						<Icon name='checkCircle' />
						{t('submitTest')}
					</Button>
				</form>

				<div className='d-flex gap-3 mt-5'>
					<FloatingButtonWithCopy data={testId} label='Test Id' />
					<Share paper={questionPaper} />
					<Print questionPaper={questionPaper} />
				</div>

				{/* Mobile Sticky Footer Navigation */}
				<div
					className='d-md-none fixed-bottom bg-white border-top shadow-lg p-3 d-flex gap-2 align-items-center justify-content-between'
					style={{
						zIndex: 1030,
						bottom:
							'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 8px)',
					}}
				>
					<Button
						variant='light'
						className='rounded-circle d-flex align-items-center justify-content-center border'
						style={{ width: '48px', height: '48px' }}
						onClick={handlePrevClick}
						disabled={currentQuestionIndex === 0 || fadeState === 'fade-out'}
					>
						<Icon name='chevronRight' style={{ transform: 'rotate(180deg)' }} />
					</Button>

					<Button
						variant='success'
						className='flex-grow-1 rounded-pill fw-bold d-flex align-items-center justify-content-center gap-2'
						style={{
							background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
							border: 'none',
							height: '48px'
						}}
						onClick={handleSubmit}
					>
						<Icon name='checkCircle' size={18} />
						{t('submitTest')}
					</Button>

					<Button
						variant='light'
						className='rounded-circle d-flex align-items-center justify-content-center border'
						style={{ width: '48px', height: '48px' }}
						onClick={handleNextClick}
						disabled={
							currentQuestionIndex === questionPaper.questions.length - 1 ||
							fadeState === 'fade-out'
						}
					>
						<Icon name='chevronRight' />
					</Button>
				</div>

				<Modal
					show={showSubmitModal}
					onHide={() => setShowSubmitModal(false)}
					centered
					className='glass-modal'
				>
					<Modal.Header border='0' closeButton>
						<Modal.Title className='fw-bold text-dark'>{t('submitTestConfirm')}</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<div className='text-center mb-4'>
							<div className='mb-3'>
								<Icon name='checkCircle' className='text-success' size={48} />
							</div>
							<p className='fs-5 mb-2'>{t('submitTestBody')}</p>
							<p className='text-muted'>
								{t('answeredCount')} <span className='fw-bold text-dark'>{answeredCount}</span> {t('outOf')} <span className='fw-bold text-dark'>{totalCount}</span> {t('questions')}.
							</p>
							{remainingCount > 0 && (
								<Alert variant='warning' className='d-inline-flex align-items-center gap-2 mt-2'>
									<Icon name='exclamationCircle' />
									{t('unansweredWarning')} {remainingCount} {t('unansweredQuestions')}.
								</Alert>
							)}
						</div>
					</Modal.Body>
					<Modal.Footer border='0' className='justify-content-center gap-3 pb-4'>
						<Button
							variant='light'
							onClick={() => setShowSubmitModal(false)}
							className='px-4 rounded-pill'
						>
							{t('backToTest')}
						</Button>
						<Button
							variant='success'
							onClick={confirmSubmit}
							className='px-4 rounded-pill d-flex align-items-center gap-2'
							style={{
								background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
								border: 'none'
							}}
						>
							<Icon name='checkCircle' />
							{t('submitNow')}
						</Button>
					</Modal.Footer>
				</Modal>
			</Container>
		</div>
	);
}

// Main component that wraps ResultsContent in Suspense
export default function Test() {
	return (
		<Suspense
			fallback={
				<Container className='text-center mt-5'>Loading test...</Container>
			}
		>
			<TestContent />
		</Suspense>
	);
}
