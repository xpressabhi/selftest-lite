'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { STORAGE_KEYS } from '../constants';
import Icon from '../components/Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import Loading from '../components/Loading';
import { useLanguage } from '../context/LanguageContext';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

import Share from '../components/Share';
import Print from '../components/Print';
import { Container, Button, Card, Badge, Alert, Accordion } from 'react-bootstrap';

function ResultsContent() {
	const searchParams = useSearchParams();
	const id = searchParams.get('id');
	const [testHistory, _, updateHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const [questionPaper, setQuestionPaper] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const router = useRouter();
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationError, setGenerationError] = useState(null);
	const { t } = useLanguage();

	useEffect(() => {
		if (id) {
			const paper = testHistory.find((t) => t.id == id);
			if (paper) {
				setQuestionPaper(paper);
			} else {
				setError('Test result not found.');
			}
			setLoading(false);
		}
	}, [id, testHistory]);

	const handleNewTest = () => {
		router.push('/');
	};

	const handleRegenerateQuiz = async () => {
		if (!questionPaper?.requestParams) return;

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
				throw new Error(errorData.error || t('failedToGenerateQuiz'));
			}

			const newQuestionPaper = await response.json();
			newQuestionPaper.requestParams = questionPaper.requestParams;
			updateHistory(newQuestionPaper);
			router.push('/test?id=' + newQuestionPaper.id);
		} catch (err) {
			setGenerationError(err.message);
			setIsGenerating(false);
		}
	};

	if (loading) return <Loading />;

	if (error || !questionPaper) {
		return (
			<Container className='text-center mt-5'>
				<Alert variant='danger'>{error || t('testNotFound')}</Alert>
				<Button onClick={handleNewTest} variant='primary'>
					{t('home')}
				</Button>
			</Container>
		);
	}

	if (!questionPaper.userAnswers) {
		router.push('/test?id=' + questionPaper.id);
		return <Loading />;
	}

	const { score, totalQuestions, userAnswers, questions } = questionPaper;
	const percentage = Math.round((score / totalQuestions) * 100);

	let feedbackColor = '#3b82f6'; // blue-500
	let feedbackText = t('goodJob');

	if (percentage >= 80) {
		feedbackColor = '#10b981'; // emerald-500
		feedbackText = t('excellent');
	} else if (percentage < 50) {
		feedbackColor = '#f59e0b'; // amber-500
		feedbackText = t('keepPracticing');
	}

	return (
		<div className='min-vh-100 pb-5'>
			<Container style={{ maxWidth: '800px' }}>
				<div className='text-center mb-5'>
					<h1 className='display-5 fw-bold mb-2'>{t('testResults')}</h1>
					<p className='text-muted fs-5'>
						{t('performanceText')}
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
									<div className='small opacity-75'>{t('outOf')} {totalQuestions}</div>
								</div>
							</div>

							<h2 className='fw-bold mb-1' style={{ color: feedbackColor }}>{feedbackText}</h2>
							<p className='text-muted mb-4'>{t('score')} {percentage}%</p>

							<div className='d-flex justify-content-center gap-2 flex-wrap'>
								<Button
									variant='primary'
									className='d-flex align-items-center gap-2 px-4 rounded-pill'
									onClick={handleNewTest}
								>
									<Icon name='plusCircle' /> {t('startNewQuiz')}
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
										{isGenerating ? t('generating') : t('similarQuiz')}
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
					<h3 className='fw-bold m-0'>{t('reviewAnswers')}</h3>
				</div>

				<div className='d-flex flex-column gap-4'>
					{questions.map((q, index) => {
						const userAnswer = userAnswers[index];
						const isCorrect = userAnswer === q.answer;
						const isSkipped = !userAnswer;

						let statusColor = 'danger';
						let statusIcon = 'xCircle';
						let statusText = t('incorrect');

						if (isCorrect) {
							statusColor = 'success';
							statusIcon = 'checkCircle';
							statusText = t('correct');
						} else if (isSkipped) {
							statusColor = 'warning';
							statusIcon = 'minusCircle';
							statusText = t('skipped');
						}

						return (
							<Card key={index} className='border-0 glass-card shadow-sm overflow-hidden'>
								<div className={`h-100 w-2 position-absolute top-0 start-0 bg-${statusColor}`} style={{ width: '6px' }} />
								<Card.Body className='p-4'>
									<div className='d-flex justify-content-between align-items-start mb-3'>
										<Badge bg={statusColor} className='d-flex align-items-center gap-1 px-3 py-2 rounded-pill'>
											<Icon name={statusIcon} size={14} />
											{statusText}
										</Badge>
										<span className='text-muted fw-bold opacity-50'>#{index + 1}</span>
									</div>

									<div className='mb-4 fs-5 fw-medium text-dark'>
										<MarkdownRenderer>{q.question}</MarkdownRenderer>
									</div>

									<div className='d-flex flex-column gap-3'>
										{/* User Answer */}
										<div className={`p-3 rounded-3 border ${isCorrect ? 'bg-success bg-opacity-10 border-success' : isSkipped ? 'bg-warning bg-opacity-10 border-warning' : 'bg-danger bg-opacity-10 border-danger'}`}>
											<small className={`d-block mb-1 fw-bold text-${statusColor} text-uppercase`} style={{ fontSize: '0.75rem' }}>
												{t('yourAnswer')}
											</small>
											<div className={isSkipped ? 'text-muted fst-italic' : 'text-dark'}>
												{isSkipped ? t('notAnswered') : <MarkdownRenderer>{userAnswer}</MarkdownRenderer>}
											</div>
										</div>

										{/* Correct Answer (if wrong or skipped) */}
										{(!isCorrect || isSkipped) && (
											<div className='p-3 rounded-3 border bg-success bg-opacity-10 border-success'>
												<small className='d-block mb-1 fw-bold text-success text-uppercase' style={{ fontSize: '0.75rem' }}>
													{t('correctAnswer')}
												</small>
												<div className='text-dark'>
													<MarkdownRenderer>{q.answer}</MarkdownRenderer>
												</div>
											</div>
										)}
									</div>

									{/* Explanation */}
									<Accordion className='mt-3' flush>
										<Accordion.Item eventKey='0' className='border-0 bg-transparent'>
											<Accordion.Header className='small'>
												<span className='d-flex align-items-center gap-2 text-primary fw-semibold'>
													<Icon name='info' size={16} />
													{t('explainAnswer')}
												</span>
											</Accordion.Header>
											<Accordion.Body className='text-muted bg-light bg-opacity-50 rounded-3 mt-2'>
												<div className='d-flex gap-2'>
													<div className='fw-bold text-dark'>{t('explanation')}:</div>
													<div>
														<MarkdownRenderer>
															{q.explanation || `${t('correctAnswerIs')} **${q.answer}**.`}
														</MarkdownRenderer>
													</div>
												</div>
											</Accordion.Body>
										</Accordion.Item>
									</Accordion>
								</Card.Body>
							</Card>
						);
					})}
				</div>

				<div className='d-flex gap-3 mt-5 justify-content-center opacity-75'>
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
