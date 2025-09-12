'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import dynamic from 'next/dynamic';
import Share from '../components/Share';
// Inline minimal icons to avoid react-icons bundle overhead
const TrophyIcon = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M6 2h12v2a4 4 0 01-4 4H10A4 4 0 016 4V2z' />
		</svg>
	</span>
);

const CheckCircle = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm-1 14l-4-4 1.5-1.5L11 12.5 17.5 6 19 7.5 11 15z' />
		</svg>
	</span>
);

const TimesCircle = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M12 2a10 10 0 100 20 10 10 0 000-20zm4.3 13.3L13.3 12l3-3-1.4-1.4-3 3-3-3L7.5 9l3 3-3 3L8.9 16l3-3 3 3 1.4-1.4z' />
		</svg>
	</span>
);

const SpinnerIcon = () => (
	<span style={{ display: 'inline-flex', width: 18, height: 18 }}>
		<svg viewBox='0 0 50 50' width='18' height='18' fill='currentColor'>
			<path d='M25 5a20 20 0 100 40 20 20 0 000-40zm0 4a16 16 0 110 32 16 16 0 010-32z' />
		</svg>
	</span>
);

const ExclamationCircle = () => (
	<span style={{ display: 'inline-flex', width: 48, height: 48 }}>
		<svg viewBox='0 0 24 24' width='48' height='48' fill='currentColor'>
			<path d='M11 9h2v6h-2V9zm0-4h2v2h-2V5zm1-3a10 10 0 100 20 10 10 0 000-20z' />
		</svg>
	</span>
);

const PencilIcon = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' />
		</svg>
	</span>
);

const PlusCircle = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z' />
		</svg>
	</span>
);

const PrintIcon = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M19 8H5V3h14v5zm-1 10H6v-6h12v6zM8 5h8v2H8V5z' />
		</svg>
	</span>
);

const SyncIcon = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }}>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M12 6V4l4 4-4 4V8a4 4 0 100 8h1v2h-1a6 6 0 110-12z' />
		</svg>
	</span>
);
import Print from '../components/Print';
import {
	Container,
	Row,
	Col,
	Card,
	Button,
	Spinner,
	Alert,
} from 'react-bootstrap';
import useLocalStorage from '../hooks/useLocalStorage';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

// Component that uses useSearchParams (must be wrapped in Suspense)
function ResultsContent() {
	const [testHistory, setTestHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const [questionPaper, setQuestionPaper] = useLocalStorage(
		STORAGE_KEYS.QUESTION_PAPER,
		null,
	);
	const [userAnswers, setUserAnswers] = useLocalStorage(
		STORAGE_KEYS.USER_ANSWERS,
		null,
	);
	const [score, setScore] = useState(0);
	const [loading, setLoading] = useState(true);
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationError, setGenerationError] = useState(null);
	const router = useRouter();
	const searchParams = useSearchParams();

	// Set document title based on loaded question paper topic
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

	useEffect(() => {
		const testId = searchParams.get('id');
		let paper = questionPaper;
		let answers = userAnswers;

		if (testId) {
			const historyEntry = testHistory.find((entry) => entry.id == testId);
			if (
				historyEntry &&
				historyEntry.questionPaper &&
				historyEntry.userAnswers
			) {
				paper = historyEntry.questionPaper;
				answers = historyEntry.userAnswers;
			}
		}

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
				const newTest = {
					id: paper.id || 'NO ID',
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
					setTestHistory([newTest, ...testHistory].slice(0, 10));
				}
			}
		}

		setLoading(false);
	}, [
		searchParams,
		questionPaper,
		userAnswers,
		testHistory,
		setQuestionPaper,
		setTestHistory,
		setUserAnswers,
	]);

	const handleNewTest = () => {
		setQuestionPaper(null);
		router.push('/');
	};

	const handleRegenerateQuiz = async () => {
		if (!questionPaper.requestParams.topic) return;

		setIsGenerating(true);
		setGenerationError(null);
		try {
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...questionPaper.requestParams,
					previousTests: testHistory,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				if (response.status === 429) {
					// Rate limit error
					const resetTime = new Date(errorData.resetTime);
					const minutes = Math.ceil((resetTime - new Date()) / 60000);
					throw new Error(
						`Rate limit exceeded. Please try again in ${minutes} minutes.`,
					);
				} else {
					throw new Error(
						errorData.error || 'Failed to generate quiz. Please try again.',
					);
				}
			}

			const newQuestionPaper = await response.json();
			newQuestionPaper.requestParams = questionPaper.requestParams;

			localStorage.setItem(
				STORAGE_KEYS.UNSUBMITTED_TEST,
				JSON.stringify(newQuestionPaper),
			);
			router.push('/test');
		} catch (error) {
			console.error('Error regenerating quiz:', error);
			setGenerationError(error.message);
		} finally {
			setIsGenerating(false);
		}
	};

	if (loading) {
		return (
			<Container className='text-center mt-5'>
				<Spinner animation='border' className='mb-2' />
				<div>Calculating results...</div>
			</Container>
		);
	}

	if (!questionPaper || !userAnswers) {
		return (
			<Container className='text-center mt-5'>
				<ExclamationCircle className='text-warning mb-3' />
				<h1>No results found!</h1>
				<p>Please take a test first.</p>
				<Button
					variant='primary'
					className='d-inline-flex align-items-center gap-2'
					onClick={() => router.push('/test')}
				>
					<PencilIcon /> Take a Test
				</Button>
			</Container>
		);
	}
	return (
		<div className='typeform-bg d-flex flex-column min-vh-100'>
			<div>
				<div>
					<h1 className='text-center mb-4 text-dark'>
						<TrophyIcon className='text-warning fs-1 mx-2' />
						Test Results
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

					<Container className='mt-4 mb-4'>
						<h2 className='text-center mb-4 fs-4 fw-bold text-dark d-flex align-items-center justify-content-center gap-2'>
							<CheckCircle className='text-success fs-3' />
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
								<Card
									key={index}
									className={`mb-4 shadow-sm rounded-4 ${
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
									<Card.Body className='py-4 px-4'>
										<Card.Title as='h3' className='fs-5 mb-3 text-dark'>
											<span className='me-2 fw-bold'>Q{index + 1}.</span>
										</Card.Title>
										<MarkdownRenderer>{q.question}</MarkdownRenderer>
										<div className='mb-3'>
											<Card.Text as='div' className='mb-1 text-secondary'>
												Your Answer:
												<div className='ms-2 text-dark'>
													{answered ? (
														<MarkdownRenderer>{userAnswer}</MarkdownRenderer>
													) : (
														'Not Answered'
													)}
												</div>
												{isCorrect && answered && (
													<CheckCircle className='text-success ms-2' />
												)}
												{!isCorrect && answered && (
													<TimesCircle className='text-danger ms-2' />
												)}
											</Card.Text>
											<Card.Text as='div' className='mb-0 text-secondary'>
												Correct Answer:
												<div className='ms-2 text-dark'>
													<MarkdownRenderer>{q.answer}</MarkdownRenderer>
												</div>
											</Card.Text>
										</div>
										<Explanation
											questionPaper={questionPaper}
											index={index}
											setQuestionPaper={setQuestionPaper}
										/>
									</Card.Body>
								</Card>
							);
						})}
					</Container>
					<div className='d-flex flex-wrap justify-content-center gap-3 mt-5 mb-5'>
						<Button
							variant='primary'
							size='lg'
							className='d-flex align-items-center gap-2'
							onClick={handleNewTest}
						>
							<PlusCircle /> Start New Quiz
						</Button>
						<div className='d-flex flex-column align-items-center'>
							<Button
								variant='secondary'
								size='lg'
								className='d-flex align-items-center gap-2'
								onClick={handleRegenerateQuiz}
								disabled={!questionPaper?.requestParams?.topic || isGenerating}
								title={
									!questionPaper?.requestParams?.topic
										? "Can't regenerate this quiz"
										: 'Generate a similar quiz'
								}
							>
								<SyncIcon className={`${isGenerating ? 'spinner' : ''}`} />
								{isGenerating
									? 'Generating Quiz...'
									: 'Regenerate Similar Quiz'}
							</Button>
							{generationError && (
								<Alert variant='danger' className='mt-2 small'>
									<ExclamationCircle className='me-1' />
									{generationError}
								</Alert>
							)}
						</div>
						<Print questionPaper={questionPaper} />
						<Share paper={questionPaper} />
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
				<Container className='text-center mt-5'>Loading results...</Container>
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
	const [explanation, setExplanation] = useState(q.explanation || null);

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

			const res = await response.json();
			setExplanation(res?.explanation);

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
				<Spinner animation='border' />
			</div>
		);
	}

	if (explanation) {
		return (
			<div className='mt-4 pt-4 border-top border-light'>
				<h4 className='fs-6 mb-2 text-dark'>Explanation:</h4>
				<MarkdownRenderer>{explanation}</MarkdownRenderer>
			</div>
		);
	}

	return (
		<>
			<Button variant='primary' onClick={(e) => handleExplain(e, index)}>
				Explain Answer?
			</Button>
			{error && (
				<Alert variant='danger' className='mt-3'>
					<ExclamationCircle className='me-2' />
					{error}
				</Alert>
			)}
		</>
	);
}
