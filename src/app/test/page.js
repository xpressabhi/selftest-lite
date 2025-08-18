'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import MarkdownRenderer from '../components/MarkdownRenderer';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
	FaSpinner,
	FaExclamationCircle,
	FaHome,
	FaBookOpen,
	FaQuestion,
	FaCheckCircle,
	FaCircle,
	FaDotCircle,
	FaArrowRight,
	FaPrint,
} from 'react-icons/fa';
import Share from '../components/Share';
import Print from '../components/Print';

export default function Test() {
	const [questionPaper, setQuestionPaper] = useState(null);
	const [answers, setAnswers] = useState({});
	const [loading, setLoading] = useState(true);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [fadeState, setFadeState] = useState('fade-in'); // 'fade-in' or 'fade-out'
	const router = useRouter();
	const timeoutRef = useRef(null);
	const touchStartXRef = useRef(null);

	useEffect(() => {
		// Load question paper from localStorage
		const storedPaper = localStorage.getItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		if (storedPaper) {
			setQuestionPaper(JSON.parse(storedPaper));
			// Don't remove the unsubmitted test until it's actually submitted
			// This ensures the test persists across page refreshes
		}

		// Load saved answers if they exist
		const savedAnswers = localStorage.getItem(
			`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers`,
		);
		if (savedAnswers) {
			setAnswers(JSON.parse(savedAnswers));
		}

		setLoading(false);
	}, []);

	const handleAnswerChange = (questionIndex, answer) => {
		const updatedAnswers = {
			...answers,
			[questionIndex]: answer,
		};
		setAnswers(updatedAnswers);
		// Save answers to localStorage whenever they change
		localStorage.setItem(
			`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers`,
			JSON.stringify(updatedAnswers),
		);

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
		// Save user answers to localStorage for results page
		localStorage.setItem(STORAGE_KEYS.USER_ANSWERS, JSON.stringify(answers));
		// Save the question paper to localStorage for the results page
		localStorage.setItem(
			STORAGE_KEYS.QUESTION_PAPER,
			JSON.stringify(questionPaper),
		);
		// Remove unsubmitted test and its answers
		localStorage.removeItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		localStorage.removeItem(`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers`);
		// Navigate to results page
		router.push('/results');
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
		return (
			<div className='container text-center mt-5'>
				<FaSpinner className='spinner mb-2' size={24} />
				<div>Loading test...</div>
			</div>
		);
	}

	if (!questionPaper) {
		return (
			<div className='container text-center mt-5'>
				<FaExclamationCircle className='text-warning mb-3' size={48} />
				<h1>No test found!</h1>
				<p>Please generate a test first.</p>
				<button
					className='btn btn-primary d-flex align-items-center gap-2 mx-auto'
					onClick={() => router.push('/')}
				>
					<FaHome /> Go to Home
				</button>
			</div>
		);
	}

	const q = questionPaper.questions[currentQuestionIndex];
	const index = currentQuestionIndex;

	return (
		<>
			<div className='typeform-bg d-flex flex-column min-vh-100'>
				<div className='container d-flex flex-column flex-grow-1 justify-content-center align-items-center px-2'>
					<h1 className='mb-4 d-flex align-items-center gap-2 mt-4'>
						<FaBookOpen className='text-primary' />
						{questionPaper.topic}
					</h1>
					<div className='d-flex gap-2 mb-3'>
						<Share paper={questionPaper} />
						<Print questionPaper={questionPaper} />
					</div>
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
							<button
								type='button'
								className='btn btn-light rounded-circle shadow-sm d-flex align-items-center justify-content-center'
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
							</button>
							<button
								type='button'
								className='btn btn-light rounded-circle shadow-sm d-flex align-items-center justify-content-center'
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
							</button>
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
							<div className='w-100 text-center mb-4'>
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
							</div>
							{/* Typeform-style options */}
							<div className='w-100'>
								{q.options.map((option, i) => (
									<button
										type='button'
										key={i}
										className={
											`btn btn-outline-primary w-100 mb-3 shadow-sm typeform-btn d-flex align-items-center gap-2` +
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
												<FaDotCircle className='text-primary' size={24} />
											) : (
												<FaCircle className='text-muted' size={24} />
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
									</button>
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
						<button
							type='submit'
							className='btn btn-success w-100 d-flex align-items-center justify-content-center gap-2 rounded-pill shadow mb-5'
							style={{
								fontWeight: 700,
								fontSize: '1.15rem',
								padding: '0.9rem 0',
								marginTop: '0.5rem',
							}}
						>
							<FaCheckCircle /> Submit Answers
						</button>
					</form>
				</div>
			</div>
		</>
	);
}
