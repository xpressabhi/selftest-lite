'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { STORAGE_KEYS } from '../constants';
import Icon from '../components/Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import Loading from '../components/Loading';
import FloatingButtonWithCopy from '../components/FloatingButtonWithCopy';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

import Share from '../components/Share';
import Print from '../components/Print';
import { Container, Button, Spinner, Alert, Card, ProgressBar } from 'react-bootstrap';

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
	const touchStartXRef = useRef(null);
	const [error, setError] = useState(null);

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

	const handleAnswerChange = (questionIndex, answer) => {
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
			}, 300);
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		const calculatedScore =
			questionPaper.questions.filter((q, index) => answers[index] === q.answer)
				.length || 0;
		const updatedPaper = {
			...questionPaper,
			userAnswers: answers,
			timestamp: Date.now(),
			totalQuestions: questionPaper.questions.length,
			score: calculatedScore,
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
					<Icon name='exclamationCircle' className='text-warning mb-3' /> No
					test found!
				</h1>
				<p>Please generate a new test.</p>
				{error && <Alert variant='danger'>{error}</Alert>}
				<Button
					variant='primary'
					className='d-flex align-items-center gap-2 mx-auto'
					onClick={() => router.push('/')}
				>
					<Icon name='home' />
					Go to Home
				</Button>
			</Container>
		);
	}
	if (!questionPaper.questions) return null;

	const q = questionPaper.questions?.[currentQuestionIndex];
	const index = currentQuestionIndex;
	const progress = ((index + 1) / questionPaper.questions.length) * 100;

	return (
		<div className='d-flex flex-column min-vh-100 pb-5'>
			<Container className='d-flex flex-column flex-grow-1 justify-content-center align-items-center px-2'>
				<div className='w-100 mb-4' style={{ maxWidth: 720 }}>
					<div className='d-flex justify-content-between align-items-center mb-2'>
						<small className='text-muted fw-semibold'>
							Question {index + 1} of {questionPaper.questions.length}
						</small>
						<small className='text-muted fw-semibold'>
							{Math.round(progress)}%
						</small>
					</div>
					<ProgressBar
						now={progress}
						variant='primary'
						style={{ height: '6px', borderRadius: '10px' }}
						className='bg-secondary bg-opacity-10'
					/>
				</div>

				<h3 className='d-flex align-items-center gap-2 mt-2 mb-4 text-center'>
					<Icon name='bookOpen' className='text-primary' />
					<span className='fw-bold text-dark fs-4'>
						<MarkdownRenderer>{questionPaper.topic}</MarkdownRenderer>
					</span>
				</h3>

				<form
					onSubmit={handleSubmit}
					className='w-100 position-relative'
					style={{ maxWidth: 720 }}
				>
					{/* Navigation buttons for non-mobile screens */}
					<div
						className='d-none d-md-flex justify-content-between position-absolute w-100'
						style={{
							top: '50%',
							transform: 'translateY(-50%)',
							left: 0,
							zIndex: 1,
							pointerEvents: 'none', // Allow clicking through the container
						}}
					>
						<Button
							variant='light'
							className='rounded-circle shadow-sm d-flex align-items-center justify-content-center border-0'
							style={{
								width: '56px',
								height: '56px',
								marginLeft: '-80px',
								pointerEvents: 'auto', // Re-enable clicks
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
								pointerEvents: 'auto', // Re-enable clicks
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
						<Card className='w-100 border-0 glass-card mb-4 shadow-sm'>
							<Card.Body className='p-4 p-md-5 text-center'>
								<div className='fs-4 fw-medium text-dark'>
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
					{(() => {
						const remainingCount =
							questionPaper.questions.length - Object.keys(answers).length;
						return (
							<div className='mb-4 text-center'>
								<small className='text-muted fw-medium'>
									{remainingCount > 0
										? `${remainingCount} question${remainingCount !== 1 ? 's' : ''
										} remaining`
										: 'All questions answered!'}
								</small>
							</div>
						);
					})()}

					<Button
						type='submit'
						variant='success'
						size='lg'
						className='w-100 d-flex align-items-center justify-content-center gap-2 rounded-pill shadow-sm py-3 fw-bold'
						style={{
							background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
							border: 'none'
						}}
					>
						<Icon name='checkCircle' />
						Submit Test
					</Button>
				</form>

				<div className='d-flex gap-3 mt-5 opacity-75'>
					<FloatingButtonWithCopy data={testId} label='Test Id' />
					<Share paper={questionPaper} />
					<Print questionPaper={questionPaper} />
				</div>
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
