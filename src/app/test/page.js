'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { STORAGE_KEYS } from '../constants';
import Icon from '../components/Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import Loading from '../components/Loading';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

import Share from '../components/Share';
import Print from '../components/Print';
import { Container, Button, Spinner, Alert } from 'react-bootstrap';

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

	return (
		<>
			<div className='typeform-bg d-flex flex-column'>
				<Container className='d-flex flex-column flex-grow-1 justify-content-center align-items-center px-2'>
					<h3 className='mb-4 d-flex align-items-center gap-2 mt-2'>
						<Icon name='bookOpen' className='text-primary' />
						<MarkdownRenderer>{questionPaper.topic}</MarkdownRenderer>
					</h3>
					<form
						onSubmit={handleSubmit}
						className='w-100 position-relative'
						style={{ maxWidth: 600 }}
					>
						{/* Navigation buttons for non-mobile screens */}
						<div
							className='d-none d-md-flex justify-content-between position-absolute w-100'
							style={{
								top: '50%',
								transform: 'translateY(-50%)',
								left: 0,
								zIndex: 1,
							}}
						>
							<Button
								variant='light'
								className='rounded-circle shadow-sm d-flex align-items-center justify-content-center'
								style={{ width: '48px', height: '48px', marginLeft: '-60px' }}
								onClick={handlePrevClick}
								disabled={
									currentQuestionIndex === 0 || fadeState === 'fade-out'
								}
							>
								<svg
									width='24'
									height='24'
									fill='none'
									viewBox='0 0 24 24'
									stroke='currentColor'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										strokeWidth={2}
										d='M15 19l-7-7 7-7'
									/>
								</svg>
							</Button>
							<Button
								variant='light'
								className='rounded-circle shadow-sm d-flex align-items-center justify-content-center'
								style={{ width: '48px', height: '48px', marginRight: '-60px' }}
								onClick={handleNextClick}
								disabled={
									currentQuestionIndex === questionPaper.questions.length - 1 ||
									fadeState === 'fade-out'
								}
							>
								<svg
									width='24'
									height='24'
									fill='none'
									viewBox='0 0 24 24'
									stroke='currentColor'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										strokeWidth={2}
										d='M9 5l7 7-7 7'
									/>
								</svg>
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
							{/* Subtle question number above */}
							<div className='w-100 text-center mb-2'>
								<small
									className='text-muted'
									style={{ letterSpacing: '0.05em', fontWeight: 500 }}
								>
									Question {index + 1} of {questionPaper.questions.length}
								</small>
							</div>
							{/* Large, bold, centered question */}
							<div className='w-100 text-center mb-4 card card-body shadow-sm border-0'>
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
							</div>
							{/* Typeform-style options */}
							<div className='w-100'>
								{q.options.map((option, i) => (
									<Button
										key={i}
										variant='outline-primary'
										className={
											`w-100 mb-3 shadow-sm typeform-btn d-flex align-items-center gap-2` +
											(answers[index] === option ? ' active' : '')
										}
										style={{
											transition:
												'background-color 0.12s, color 0.12s, box-shadow 0.2s',
											cursor:
												fadeState === 'fade-out' ? 'not-allowed' : 'pointer',
											opacity: fadeState === 'fade-out' ? 0.7 : 1,
										}}
										onClick={() =>
											fadeState !== 'fade-out' &&
											handleAnswerChange(index, option)
										}
										disabled={fadeState === 'fade-out'}
										tabIndex={fadeState === 'fade-out' ? -1 : 0}
									>
										<div className='me-2'>
											{answers[index] === option ? (
												<Icon name='checkCircle' />
											) : (
												<Icon name='circle' />
											)}
										</div>
										<div
											style={{
												textAlign: 'left',
												display: 'inline-block',
												width: '85%',
											}}
										>
											<MarkdownRenderer>{option}</MarkdownRenderer>
										</div>
									</Button>
								))}
							</div>
						</div>
						{/* Remaining unanswered questions */}
						{(() => {
							const remainingCount =
								questionPaper.questions.length - Object.keys(answers).length;
							return (
								<div className='mb-3 text-center'>
									<small className='text-muted'>
										{remainingCount > 0
											? `${remainingCount} question${
													remainingCount !== 1 ? 's' : ''
											  } unanswered`
											: 'All questions answered'}
									</small>
								</div>
							);
						})()}
						<Button
							type='submit'
							variant='success'
							className='w-100 d-flex align-items-center justify-content-center gap-2 rounded-pill shadow mb-5 p-2 fw-bold'
						>
							<Icon name='checkCircle' />
							Submit Answers
						</Button>
					</form>
					<div className='d-flex gap-2 mb-3'>
						<Share paper={questionPaper} />
						<Print questionPaper={questionPaper} />
					</div>
				</Container>
			</div>
		</>
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
