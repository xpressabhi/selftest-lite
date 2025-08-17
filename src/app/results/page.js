'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import MarkdownRenderer from '../components/MarkdownRenderer';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
	FaTrophy,
	FaCheckCircle,
	FaTimesCircle,
	FaSpinner,
	FaExclamationCircle,
	FaPencilAlt,
	FaArrowRight,
	FaPlusCircle,
	FaBookOpen,
} from 'react-icons/fa';

// Component that uses useSearchParams (must be wrapped in Suspense)
function ResultsContent() {
	const [score, setScore] = useState(0);
	const [questionPaper, setQuestionPaper] = useState(null);
	const [userAnswers, setUserAnswers] = useState(null);
	const [loading, setLoading] = useState(true);
	const router = useRouter();
	const searchParams = useSearchParams();

	useEffect(() => {
		const testId = searchParams.get('id');
		let paper = null;
		let answers = null;

		// Load test history from localStorage
		const testHistory =
			JSON.parse(localStorage.getItem(STORAGE_KEYS.TEST_HISTORY)) || [];

		if (testId) {
			// If testId is provided, try to load from history first
			const historyEntry = testHistory.find((entry) => entry.id === testId);

			if (
				historyEntry &&
				historyEntry.questionPaper &&
				historyEntry.userAnswers
			) {
				// If we have a complete history entry with question paper and answers, use it
				paper = historyEntry.questionPaper;
				answers = historyEntry.userAnswers;
				console.log('Loaded test from history:', historyEntry.id);
			} else {
				console.log('History entry incomplete or not found for ID:', testId);
			}
		} else {
			// No testId, load from localStorage (most recently completed test)
			const storedPaper = localStorage.getItem(STORAGE_KEYS.QUESTION_PAPER);
			const storedAnswers = localStorage.getItem(STORAGE_KEYS.USER_ANSWERS);

			if (storedPaper && storedAnswers) {
				paper = JSON.parse(storedPaper);
				answers = JSON.parse(storedAnswers);
				console.log('Loaded test from localStorage');
			}
		}

		// If we have both paper and answers, calculate score and update state
		if (paper && answers) {
			setQuestionPaper(paper);
			setUserAnswers(answers);

			// Convert answers to array if it's an object (from test page)
			const answersArray = Array.isArray(answers)
				? answers
				: Object.values(answers);

			let calculatedScore = 0;
			paper.questions.forEach((q, index) => {
				if (answersArray[index] === q.answer) {
					calculatedScore++;
				}
			});
			setScore(calculatedScore);

			// If this is a newly submitted test (no testId in URL), save it to history
			if (!testId) {
				const newTestId = new Date().getTime().toString();
				const newTest = {
					id: newTestId,
					topic: paper.topic || 'Untitled Test',
					timestamp: new Date().getTime(),
					score: calculatedScore,
					totalQuestions: paper.questions.length,
					questionPaper: paper, // Save full question paper
					userAnswers: answers, // Save user's answers
				};

				// Check if this exact test was already saved in the last minute
				const oneMinuteAgo = Date.now() - 60000; // 1 minute ago
				const existingTest = testHistory.find(
					(test) =>
						test.topic === newTest.topic &&
						test.score === newTest.score &&
						test.timestamp > oneMinuteAgo,
				);

				if (!existingTest) {
					const updatedHistory = [newTest, ...testHistory].slice(0, 10);
					localStorage.setItem(
						STORAGE_KEYS.TEST_HISTORY,
						JSON.stringify(updatedHistory),
					);
				}
			}
		} else {
			console.log('Could not load test data');
		}

		setLoading(false);
	}, [searchParams]);

	const handleNewTest = () => {
		// Clear only the question paper when starting a new test
		// We don't need to remove USER_ANSWERS as it won't affect new test creation
		localStorage.removeItem(STORAGE_KEYS.QUESTION_PAPER);
		router.push('/');
	};

	const handleShare = async () => {
		if (!questionPaper?.requestParams) return;

		const params = new URLSearchParams(questionPaper.requestParams).toString();
		const shareUrl = `${window.location.origin}/?${params}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: questionPaper.topic || 'Test Results',
					text: 'Check out this test!',
					url: shareUrl,
				});
			} catch (err) {
				console.error('Share failed:', err);
			}
		} else {
			// fallback: copy link
			await navigator.clipboard.writeText(shareUrl);
			alert('Share link copied to clipboard!');
		}
	};

	if (loading) {
		return (
			<div className='container text-center mt-5'>
				<FaSpinner className='spinner mb-2' size={24} />
				<div>Calculating results...</div>
			</div>
		);
	}

	if (!questionPaper || !userAnswers) {
		return (
			<div className='container text-center mt-5'>
				<FaExclamationCircle className='text-warning mb-3' size={48} />
				<h1>No results found!</h1>
				<p>Please take a test first.</p>
				<button
					className='btn btn-primary d-inline-flex align-items-center gap-2'
					onClick={() => router.push('/test')}
				>
					<FaPencilAlt /> Take a Test
				</button>
			</div>
		);
	}
	return (
		<div className='typeform-bg d-flex flex-column min-vh-100'>
			<div>
				<div>
					<h1 className='text-center mb-4 text-dark d-flex align-items-center justify-content-between gap-2'>
						<FaTrophy className='text-warning fs-1' />
						Test Results
						<button
							className='btn btn-outline-secondary btn-lg d-flex align-items-center gap-2'
							onClick={handleShare}
						>
							<FaArrowRight /> Share
						</button>
					</h1>
					<div className='d-flex justify-content-center mb-4'>
						<div
							className='bg-light rounded-3 shadow-sm p-4 text-center'
							style={{
								minWidth: 200,
								background: 'linear-gradient(135deg, #f8d90f 0%, #f3f4f7 100%)',
							}}
						>
							<h2 className='fs-1 fw-bold mb-1 text-dark'>
								{score} / {questionPaper.questions.length}
							</h2>
							<p className='fs-5 mb-0 text-secondary'>Score</p>
						</div>
					</div>

					<div className='container mt-4 mb-4'>
						<h2 className='text-center mb-4 fs-4 fw-bold text-dark d-flex align-items-center justify-content-center gap-2'>
							<FaCheckCircle className='text-success fs-3' />
							Review Your Answers
						</h2>
						<p className='lead text-center'>{questionPaper.topic || 'Test'}</p>
						{questionPaper.questions.map((q, index) => {
							const userAnswer = Array.isArray(userAnswers)
								? userAnswers[index]
								: userAnswers[index.toString()];
							const isCorrect = userAnswer === q.answer;
							const answered = !!userAnswer;
							return (
								<div
									key={index}
									className={`card mb-4 shadow-sm rounded-4 ${
										isCorrect
											? 'border-success'
											: answered
											? 'border-danger'
											: 'border-secondary'
									}`}
									style={{
										borderLeft: `8px solid ${
											isCorrect ? '#28a745' : answered ? '#dc3545' : '#6c757d'
										}`,
									}}
								>
									<div className='card-body py-4 px-4'>
										<h3 className='card-title fs-5 mb-3 text-dark'>
											<span className='me-2 fw-bold'>Q{index + 1}.</span>
										</h3>
										<MarkdownRenderer>{q.question}</MarkdownRenderer>
										<div className='mb-3'>
											<div className='card-text mb-1 text-secondary'>
												Your Answer:
												<div className='ms-2 text-dark'>
													{answered ? (
														<MarkdownRenderer>{userAnswer}</MarkdownRenderer>
													) : (
														'Not Answered'
													)}
												</div>
												{isCorrect && answered && (
													<FaCheckCircle className='text-success ms-2' />
												)}
												{!isCorrect && answered && (
													<FaTimesCircle className='text-danger ms-2' />
												)}
											</div>
											<div className='card-text mb-0 text-secondary'>
												Correct Answer:
												<div className='ms-2 text-dark'>
													<MarkdownRenderer>{q.answer}</MarkdownRenderer>
												</div>
											</div>
										</div>
										<Explanation
											questionPaper={questionPaper}
											index={index}
											setQuestionPaper={setQuestionPaper}
										/>
									</div>
								</div>
							);
						})}
					</div>
					<div className='d-flex justify-content-center gap-3 mt-5 mb-5'>
						<button
							className='btn btn-primary btn-lg d-flex align-items-center gap-2'
							onClick={handleNewTest}
						>
							<FaPlusCircle /> Start New Test
						</button>
						<button
							className='btn btn-outline-secondary btn-lg d-flex align-items-center gap-2'
							onClick={handleShare}
						>
							<FaArrowRight /> Share
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// Main component that wraps ResultsContent in Suspense
export default function Results() {
	return (
		<Suspense
			fallback={
				<div className='container text-center mt-5'>Loading results...</div>
			}
		>
			<ResultsContent />
		</Suspense>
	);
}

function Explanation({ questionPaper, index, setQuestionPaper }) {
	const [loadingExplanation, setLoadingExplanation] = useState(false);
	const [error, setError] = useState(null);
	const q = questionPaper.questions[index];
	const searchParams = useSearchParams();

	const handleExplain = async (e, index) => {
		e.preventDefault();
		setLoadingExplanation(true);
		setError(null);
		const topic = questionPaper.topic
			? questionPaper.topic
			: 'General Knowledge';
		const question = questionPaper.questions[index].question;
		const answer = questionPaper.questions[index].answer;

		try {
			const response = await fetch('/api/explain', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					topic,
					question,
					answer,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				if (response.status === 429) {
					// Rate limit error
					const resetTime = new Date(errorData.resetTime);
					const minutes = Math.ceil((resetTime - new Date()) / 60000);
					setError(errorData.error || 'Rate limit exceeded');
					setLoadingExplanation(false);
				} else {
					setError(
						errorData.error ||
							'An error occurred while generating the explanation.',
					);
				}
				return;
			}

			const { explanation } = await response.json();
			setQuestionPaper((prev) => ({
				...prev,
				questions: prev.questions.map((q, i) =>
					i === index ? { ...q, explanation } : q,
				),
			}));

			const testId = searchParams.get('id');
			// Load test history from localStorage
			const testHistory =
				JSON.parse(localStorage.getItem(STORAGE_KEYS.TEST_HISTORY)) || [];
			if (testId) {
				// Update existing history entry
				const historyEntry = testHistory.find((entry) => entry.id === testId);
				if (historyEntry) {
					historyEntry.questionPaper.questions[index].explanation = explanation;
					localStorage.setItem(
						STORAGE_KEYS.TEST_HISTORY,
						JSON.stringify(testHistory),
					);
				}
			}
		} catch (err) {
			setError(err.message);
		} finally {
			setLoadingExplanation(false);
		}
	};

	if (loadingExplanation) {
		return (
			<div className='mt-4 pt-4 border-top border-light'>
				<h4 className='fs-6 mb-2 text-dark'>Loading explanation...</h4>
				<FaSpinner className='spinner' />
			</div>
		);
	}

	if (q.explanation) {
		return (
			<div className='mt-4 pt-4 border-top border-light'>
				<h4 className='fs-6 mb-2 text-dark'>Explanation:</h4>
				<MarkdownRenderer>{q.explanation}</MarkdownRenderer>
			</div>
		);
	}

	return (
		<>
			<button
				className='btn btn-primary'
				onClick={(e) => handleExplain(e, index)}
			>
				Explain Answer?
			</button>
			{error && (
				<div className='alert alert-danger mt-3'>
					<FaExclamationCircle className='me-2' />
					{error}
				</div>
			)}
		</>
	);
}
