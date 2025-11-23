'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import dynamic from 'next/dynamic';
import Share from '../components/Share';
import Icon from '../components/Icon';
import Print from '../components/Print';
import { Container, Card, Button, Spinner, Alert, Row, Col } from 'react-bootstrap';
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

// Component that uses useSearchParams (must be wrapped in Suspense)
function ResultsContent() {
	const searchParams = useSearchParams();
	const testId = searchParams.get('id');
	const [testHistory, _, updateHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationError, setGenerationError] = useState(null);
	const [questionPaper, setQuestionPaper] = useState();
	const [loading, setLoading] = useState(true);
	const router = useRouter();

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
		if (testId) {
			const historyEntry = testHistory.find((entry) => entry.id == testId);
			if (historyEntry) {
				if (!historyEntry.userAnswers) {
					router.push('/test?id=' + historyEntry.id);
				} else {
					setQuestionPaper(historyEntry);
					setLoading(false);
				}
			} else {
				router.push('/test?id=' + testId);
			}
		}
	}, [testId, testHistory, router]);

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
					previousTests: testHistory.slice(0, 10),
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
			updateHistory(newQuestionPaper);
			router.push('/test?id=' + newQuestionPaper.id);
		} catch (error) {
			console.error('Error regenerating quiz:', error);
			setGenerationError(error.message);
		} finally {
			setIsGenerating(false);
		}
	};
	const { score, topic, userAnswers, totalQuestions, questions } =
		questionPaper || {};

	if (loading) {
		return <Loading />;
	}

	if (!questionPaper) {
		return (
			<Container className='text-center mt-5'>
				<Icon name='exclamationCircle' className='text-warning mb-3' />
				<h1>No results found!</h1>
				<p>Please take a test first.</p>
				<Button
					variant='primary'
					className='d-inline-flex align-items-center gap-2'
					onClick={() => router.push('/')}
				>
					<Icon name='pencil' /> Create a Test
				</Button>
			</Container>
		);
	}

	if (questionPaper && !userAnswers) {
		return (
			<Container className='text-center mt-5'>
				<Icon name='exclamationCircle' className='text-warning mb-3' />
				<h1>
					<MarkdownRenderer>{topic}</MarkdownRenderer>
				</h1>
				<p>Please take a test first.</p>
				<Button
					variant='primary'
					className='d-inline-flex align-items-center gap-2'
					onClick={() => router.push('/test?id=' + questionPaper.id)}
				>
					<Icon name='pencil' /> Attempt Test
				</Button>
			</Container>
		);
	}

	const percentage = Math.round((score / totalQuestions) * 100);
	let feedbackColor = '#10b981'; // green
	let feedbackText = 'Excellent!';
	if (percentage < 40) {
		feedbackColor = '#ef4444'; // red
		feedbackText = 'Keep Practicing!';
	} else if (percentage < 70) {
		feedbackColor = '#f59e0b'; // yellow
		feedbackText = 'Good Job!';
	}

	return (
		<div className='d-flex flex-column min-vh-100 pb-5'>
			<Container style={{ maxWidth: 800 }}>
				<div className='text-center mb-5'>
					<h1 className='display-5 fw-bold mb-2'>Test Results</h1>
					<p className='text-muted fs-5'>
						Here&apos;s how you performed
					</p>
				</div>

				{/* Score Card */}
				<Card className='glass-card border-0 mb-5 overflow-hidden'>
					<Card.Body className='p-5 text-center position-relative'>
						<div
							className='position-absolute top-0 start-0 w-100 h-100 opacity-10'
							style={{
								background: `radial-gradient(circle at center, ${feedbackColor}, transparent 70%)`,
								pointerEvents: 'none'
							}}
						/>

						<div className='position-relative'>
							<div
								className='d-inline-flex align-items-center justify-content-center rounded-circle mb-3 shadow-sm'
								style={{
									width: '120px',
									height: '120px',
									background: `linear-gradient(135deg, ${feedbackColor} 0%, ${feedbackColor}dd 100%)`,
									color: 'white'
								}}
							>
								<div>
									<div className='display-4 fw-bold lh-1'>{score}</div>
									<div className='small opacity-75'>out of {totalQuestions}</div>
								</div>
							</div>

							<h2 className='fw-bold mb-1' style={{ color: feedbackColor }}>{feedbackText}</h2>
							<p className='text-muted mb-4'>You scored {percentage}%</p>

							<div className='d-flex justify-content-center gap-2 flex-wrap'>
								<Button
									variant='primary'
									className='d-flex align-items-center gap-2 px-4 rounded-pill'
									onClick={handleNewTest}
								>
									<Icon name='plusCircle' /> New Quiz
								</Button>

								{questionPaper?.requestParams?.topic && (
									<Button
										variant='outline-primary'
										className='d-flex align-items-center gap-2 px-4 rounded-pill bg-white'
										onClick={handleRegenerateQuiz}
										disabled={isGenerating}
									>
										<Icon
											name='repeat1'
											className={`${isGenerating ? 'spinner' : ''}`}
										/>
										{isGenerating ? 'Generating...' : 'Similar Quiz'}
									</Button>
								)}
							</div>

							{generationError && (
								<Alert variant='danger' className='mt-3 d-inline-block'>
									<Icon name='exclamationCircle' className='me-1' />
									{generationError}
								</Alert>
							)}
						</div>
					</Card.Body>
				</Card>

				<div className='d-flex align-items-center gap-2 mb-4 px-2'>
					<Icon name='checkCircle' className='text-success fs-4' />
					<h3 className='fw-bold m-0'>Review Answers</h3>
				</div>

				{/* Review List */}
				<div className='d-flex flex-column gap-4'>
					{questions.map((q, index) => {
						const userAnswer = Array.isArray(userAnswers)
							? userAnswers[index]
							: userAnswers[index.toString()];
						const isCorrect = userAnswer === q.answer;
						const answered = !!userAnswer;

						return (
							<Card
								key={index}
								className='glass-card border-0 shadow-sm overflow-hidden'
							>
								<div
									className='position-absolute start-0 top-0 bottom-0'
									style={{
										width: '6px',
										background: isCorrect ? '#10b981' : answered ? '#ef4444' : '#9ca3af'
									}}
								/>
								<Card.Body className='p-4 ps-5'>
									<div className='d-flex justify-content-between align-items-start mb-3'>
										<h5 className='fw-bold text-dark mb-0'>Question {index + 1}</h5>
										{isCorrect ? (
											<span className='badge bg-success bg-opacity-10 text-success px-3 py-2 rounded-pill'>
												Correct
											</span>
										) : answered ? (
											<span className='badge bg-danger bg-opacity-10 text-danger px-3 py-2 rounded-pill'>
												Incorrect
											</span>
										) : (
											<span className='badge bg-secondary bg-opacity-10 text-secondary px-3 py-2 rounded-pill'>
												Skipped
											</span>
										)}
									</div>

									<div className='fs-5 mb-4 text-dark'>
										<MarkdownRenderer>{q.question}</MarkdownRenderer>
									</div>

									<Row className='g-3'>
										<Col md={6}>
											<div className={`p-3 rounded-3 h-100 ${isCorrect ? 'bg-success bg-opacity-10 border border-success border-opacity-25' : 'bg-light border'}`}>
												<small className='text-muted d-block mb-1 fw-semibold text-uppercase' style={{ fontSize: '0.7rem' }}>
													Your Answer
												</small>
												<div className={isCorrect ? 'text-success fw-medium' : 'text-dark'}>
													{answered ? (
														<MarkdownRenderer>{userAnswer}</MarkdownRenderer>
													) : (
														<span className='text-muted fst-italic'>Not Answered</span>
													)}
												</div>
											</div>
										</Col>
										<Col md={6}>
											<div className='p-3 rounded-3 h-100 bg-light border'>
												<small className='text-muted d-block mb-1 fw-semibold text-uppercase' style={{ fontSize: '0.7rem' }}>
													Correct Answer
												</small>
												<div className='text-dark fw-medium'>
													<MarkdownRenderer>{q.answer}</MarkdownRenderer>
												</div>
											</div>
										</Col>
									</Row>

									<Explanation
										questionPaper={questionPaper}
										index={index}
										updateHistory={updateHistory}
									/>
								</Card.Body>
							</Card>
						);
					})}
				</div>

				<div className='d-flex justify-content-center gap-3 mt-5 opacity-75'>
					<FloatingButtonWithCopy data={testId} label='Test Id' />
					<Share paper={questionPaper} />
					<Print questionPaper={questionPaper} />
				</div>
			</Container>
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

function Explanation({ questionPaper, index, updateHistory }) {
	const [loadingExplanation, setLoadingExplanation] = useState(false);
	const [error, setError] = useState(null);
	const q = questionPaper.questions[index];
	const [explanation, setExplanation] = useState(q.explanation || null);

	const handleExplain = async (e) => {
		e.preventDefault();
		setLoadingExplanation(true);
		setError(null);
		const topic = questionPaper.topic
			? questionPaper.topic
			: 'General Knowledge';
		const language = questionPaper.requestParams?.language || 'english';
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
					language,
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
			questionPaper.questions[index].explanation = res?.explanation;
			updateHistory(questionPaper);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoadingExplanation(false);
		}
	};

	if (loadingExplanation) {
		return (
			<div className='mt-3 pt-3 border-top border-light'>
				<div className='d-flex align-items-center gap-2 text-muted'>
					<Spinner animation='border' size='sm' />
					<small>Generating explanation...</small>
				</div>
			</div>
		);
	}

	if (explanation) {
		return (
			<div className='mt-3 pt-3 border-top border-light'>
				<div className='d-flex align-items-center gap-2 mb-2'>
					<Icon name='lightbulb' className='text-warning' size={16} />
					<h6 className='fw-bold m-0 text-dark'>Explanation</h6>
				</div>
				<div className='text-secondary small'>
					<MarkdownRenderer>{explanation}</MarkdownRenderer>
				</div>
			</div>
		);
	}

	return (
		<div className='mt-3 pt-3 border-top border-light'>
			<Button
				variant='link'
				className='p-0 text-decoration-none d-flex align-items-center gap-2 text-primary'
				style={{ fontSize: '0.9rem' }}
				onClick={handleExplain}
			>
				<Icon name='info' size={16} />
				Explain Answer
			</Button>
			{error && (
				<Alert variant='danger' className='mt-2 py-2 px-3 small'>
					{error}
				</Alert>
			)}
		</div>
	);
}
