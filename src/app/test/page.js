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
} from 'react-icons/fa';

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
			<style>
				{`
				.fade-slide {
					transition: opacity 0.3s cubic-bezier(.4,0,.2,1), transform 0.3s cubic-bezier(.4,0,.2,1);
				}
				.fade-in {
					opacity: 1;
					transform: translateY(0px);
				}
				.fade-out {
					opacity: 0;
					transform: translateY(30px);
				}
				.typeform-bg {
					background: #f8f9fa;
					min-height: 100vh;
				}
				.typeform-btn:active, .typeform-btn.active {
					background-color: #e7f0fa !important;
					border-color: #0d6efd !important;
					color: #0d6efd !important;
				}
				.typeform-btn:focus {
					box-shadow: 0 0 0 0.2rem rgba(13,110,253,.15);
				}
				`}
			</style>
			<div className='typeform-bg d-flex flex-column min-vh-100'>
				<div className='container d-flex flex-column flex-grow-1 justify-content-center align-items-center px-2'>
					<h1
						className='mb-4 d-flex align-items-center gap-2 mt-4'
						style={{ fontWeight: 700, fontSize: '2rem' }}
					>
						<FaBookOpen className='text-primary' />
						{questionPaper.topic}
					</h1>
					<form
						onSubmit={handleSubmit}
						className='w-100'
						style={{ maxWidth: 600 }}
					>
						<div
							key={index}
							className={`fade-slide ${fadeState} w-100`}
							onTouchStart={onTouchStart}
							onTouchEnd={onTouchEnd}
							style={{
								background: 'white',
								borderRadius: '2rem',
								boxShadow: '0 8px 32px rgba(60,60,70,0.08)',
								padding: '3rem 2rem 2rem 2rem',
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
								<div
									style={{
										fontSize: '1.7rem',
										fontWeight: 700,
										lineHeight: 1.25,
										color: '#212529',
										letterSpacing: '-0.01em',
									}}
								>
									<MarkdownRenderer>{q.question}</MarkdownRenderer>
								</div>
							</div>
							{/* Typeform-style options */}
							<div className='w-100'>
								{q.options.map((option, i) => (
									<button
										type='button'
										key={i}
										className={
											`btn btn-outline-primary btn-lg w-100 py-3 mb-3 rounded-pill shadow-sm typeform-btn` +
											(answers[index] === option ? ' active' : '')
										}
										style={{
											fontWeight: 600,
											fontSize: '1.15rem',
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
										<span className='me-2'>
											{answers[index] === option ? (
												<FaDotCircle className='text-primary' size={24} />
											) : (
												<FaCircle className='text-muted' size={24} />
											)}
										</span>
										<span
											style={{
												textAlign: 'left',
												display: 'inline-block',
												width: '85%',
											}}
										>
											<MarkdownRenderer>{option}</MarkdownRenderer>
										</span>
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
							className='btn btn-success w-100 d-flex align-items-center justify-content-center gap-2 rounded-pill shadow'
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
