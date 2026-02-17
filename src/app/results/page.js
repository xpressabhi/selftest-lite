'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { STORAGE_KEYS } from '../constants';
import Icon from '../components/Icon';
import useLocalStorage from '../hooks/useLocalStorage';
import Loading from '../components/Loading';
import { useLanguage } from '../context/LanguageContext';
import useBookmarks from '../hooks/useBookmarks';
import useSoundEffects from '../hooks/useSoundEffects';
import useStreak from '../hooks/useStreak';
import useAchievements from '../hooks/useAchievements';
import SoundToggle from '../components/SoundToggle';

// Lazy load heavy interactive/visual components
const Confetti = dynamic(() => import('../components/Confetti'), { ssr: false });
const TrophyBurst = dynamic(() => import('../components/Confetti').then(mod => mod.TrophyBurst), { ssr: false });
const Share = dynamic(() => import('../components/Share'), { loading: () => <Button variant="outline-primary" disabled>...</Button>, ssr: false });
const Print = dynamic(() => import('../components/Print'), { loading: () => <Button variant="outline-primary" disabled>...</Button>, ssr: false });

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>...</p>,
		ssr: false,
	},
);

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
	const [isRetrying, setIsRetrying] = useState(false);
	const [loadingExplanation, setLoadingExplanation] = useState({});
	const [generationError, setGenerationError] = useState(null);
	const { t } = useLanguage();
	const { isBookmarked, toggleBookmark } = useBookmarks();

	// UX Enhancement: Celebration effects
	const [showConfetti, setShowConfetti] = useState(false);
	const [showTrophy, setShowTrophy] = useState(false);
	const [celebrationTriggered, setCelebrationTriggered] = useState(false);
	const [achievementToasts, setAchievementToasts] = useState([]);
	const { playCelebration, playCorrect, initAudio } = useSoundEffects();

	// Streak & Achievements
	const { recordActivity, currentStreak, longestStreak } = useStreak();
	const { checkAchievements, newlyUnlocked, clearNewlyUnlocked } = useAchievements({ longestStreak });

	useEffect(() => {
		if (id) {
			const paper = testHistory.find((t) => t.id == id);
			if (paper) {
				setQuestionPaper(paper);
			} else {
				setError(t('testResultNotFound'));
			}
			setLoading(false);
		}
	}, [id, testHistory, t]);

	useEffect(() => {
		if (!questionPaper || questionPaper.userAnswers) return;
		router.replace('/test?id=' + questionPaper.id);
	}, [questionPaper, router]);

	// Trigger celebration effects, streak recording, and achievement checking
	useEffect(() => {
		if (questionPaper && questionPaper.userAnswers && !celebrationTriggered) {
			const { score, totalQuestions } = questionPaper;
			const percentage = Math.round((score / totalQuestions) * 100);

			// Record streak activity
			recordActivity();

			// Initialize audio context on first interaction
			initAudio();

			// Delay celebration slightly for dramatic effect
			const timer = setTimeout(() => {
				if (percentage >= 80) {
					setShowConfetti(true);
					playCelebration();

					// Perfect score gets trophy burst
					if (percentage === 100) {
						setShowTrophy(true);
					}
				} else if (percentage >= 50) {
					// Good effort sound
					playCorrect();
				}

				// Check for new achievements
				const newUnlocks = checkAchievements();
				if (newUnlocks.length > 0) {
					setAchievementToasts(newUnlocks);
					// Auto-clear after 5 seconds
					setTimeout(() => setAchievementToasts([]), 5000);
				}

				setCelebrationTriggered(true);
			}, 500);

			return () => clearTimeout(timer);
		}
	}, [questionPaper, celebrationTriggered, playCelebration, playCorrect, initAudio, recordActivity, checkAchievements]);

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

	const handleRetryMistakes = async () => {
		if (!questionPaper) return;

		setIsRetrying(true);
		setGenerationError(null);

		try {
			// Filter only incorrect questions
			const incorrectQuestions = questionPaper.questions.filter((q, index) => {
				const userAnswer = questionPaper.userAnswers[index];
				return userAnswer !== q.answer;
			});

			if (incorrectQuestions.length === 0) {
				setIsRetrying(false);
				return;
			}

			// Create new test object directly without API call since we have the questions
			const newTest = {
				id: crypto.randomUUID(), // Generate client-side ID for immediate use
				topic: `${t('retryPrefix')} ${questionPaper.topic}`,
				timestamp: null, // Indicates unsubmitted
				questions: incorrectQuestions,
				requestParams: questionPaper.requestParams, // Keep original params
				createdAt: Date.now(),
				isRetry: true,
				originalTestId: questionPaper.id,
			};

			// Save to local storage history
			// Note: We need to register this ID in the database if we want shareable links, 
			// but for local retry, client-side is faster and cheaper.
			// However, to reuse existing Test component logic which fetches from API if not found,
			// we should probably stick to local storage for now and maybe sync later.
			// The current Test component prioritizes local history, so this works!

			updateHistory(newTest);
			router.push('/test?id=' + newTest.id);

		} catch (err) {
			setGenerationError(`${t('failedPrepareRetry')} ${err.message}`);
			setIsRetrying(false);
		}
	};

	const fetchExplanation = async (index, question) => {
		if (loadingExplanation[index]) return;

		setLoadingExplanation((prev) => ({ ...prev, [index]: true }));
		try {
			const res = await fetch('/api/explain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topic: questionPaper.topic,
					question: question.question,
					answer: question.answer,
					language: questionPaper.requestParams?.language || 'english',
				}),
			});
			const data = await res.json();

			if (data.error) throw new Error(data.error);

			if (data.explanation) {
				// Update local state and history to persist the explanation
				const updatedQuestions = [...questionPaper.questions];
				updatedQuestions[index] = {
					...updatedQuestions[index],
					explanation: data.explanation,
				};

				const updatedPaper = { ...questionPaper, questions: updatedQuestions };
				setQuestionPaper(updatedPaper);
				updateHistory(updatedPaper);
			}
		} catch (e) {
			console.error(e);
			// Optionally show a toast or alert, but console is fine for now
		} finally {
			setLoadingExplanation((prev) => ({ ...prev, [index]: false }));
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
		return <Loading />;
	}

	const { score, totalQuestions, userAnswers, questions, timeTaken } = questionPaper;
	const percentage = Math.round((score / totalQuestions) * 100);

	const formatTime = (seconds) => {
		if (!seconds) return t('na');
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}${t('minuteShort')} ${secs}${t('secondShort')}`;
	};

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
		<div style={{ minHeight: 'var(--app-viewport-height, 100dvh)' }}>
			{/* Celebration effects */}
			<Confetti
				show={showConfetti}
				duration={4000}
				particleCount={percentage === 100 ? 150 : 100}
				onComplete={() => setShowConfetti(false)}
			/>
			<TrophyBurst show={showTrophy} />

			{/* Achievement Toast Notifications */}
				{achievementToasts.length > 0 && (
					<div
						style={{
							position: 'fixed',
							bottom: 'calc(var(--bottom-nav-offset, 96px) + 12px)',
							right: 'max(12px, var(--safe-right, 0px))',
							zIndex: 9999,
							display: 'flex',
							flexDirection: 'column',
						gap: '8px',
					}}
				>
					{achievementToasts.map((a) => (
						<div
							key={a.id}
							className='glass-card shadow-lg d-flex align-items-center gap-3 px-4 py-3 rounded-pill'
							style={{
								animation: 'slideInRight 0.4s ease-out',
								border: '1px solid rgba(99, 102, 241, 0.3)',
								minWidth: '250px',
							}}
						>
							<span style={{ fontSize: '1.6rem' }}>{a.icon}</span>
							<div>
								<div className='fw-bold small' style={{ color: 'var(--accent-primary)' }}>
									{t('achievementUnlocked')}
								</div>
								<div className='fw-semibold small'>{a.title}</div>
							</div>
						</div>
					))}
				</div>
			)}

			<Container style={{ maxWidth: '800px' }}>
				<div className='d-flex justify-content-end mb-2'>
					<SoundToggle />
				</div>
				<div className='text-center mb-5'>
					<h1 className='display-5 fw-bold mb-2'>{t('testResults')}</h1>
					<p className='text-muted fs-5'>
						{t('performanceText')}
					</p>
				</div>

				{/* Score Card */}
				<Card className='glass-card border-0 mb-5 overflow-hidden'>
					<Card.Body className='p-5 text-center position-relative'>
						{/* Speed Challenge Badge */}
						{questionPaper.requestParams?.testType === 'speed-challenge' && (
							<div className='position-absolute top-0 end-0 m-3'>
								<Badge bg='danger' className='d-flex align-items-center gap-1 shadow-sm px-3 py-2 rounded-pill'>
									<Icon name='zap' size={14} /> {t('speedChallengeRef')}
								</Badge>
							</div>
						)}
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
							<p className='text-muted mb-3'>
								{t('score')} {percentage}%
								{timeTaken && (
									<span className='ms-3 ps-3 border-start d-inline-flex align-items-center gap-1'>
										<Icon name='clock' size={14} />
										{formatTime(timeTaken)}
									</span>
								)}
							</p>

							{/* Streak display */}
							{currentStreak > 0 && (
								<div className='mb-4'>
									<Badge
										bg='warning'
										text='dark'
										className='px-3 py-2 rounded-pill d-inline-flex align-items-center gap-2 fw-bold'
									style={{ fontSize: '0.85rem' }}
								>
									🔥 {currentStreak} {t('dayStreak')}
								</Badge>
							</div>
						)}

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

								{/* Retry Mistakes Button */}
								{percentage < 100 && (
									<Button
										variant='warning'
										className='d-flex align-items-center gap-2 px-4 rounded-pill text-dark fw-bold'
										onClick={handleRetryMistakes}
										disabled={isRetrying}
										>
											<Icon
												name='repeat1'
												className={`${isRetrying ? 'spinner' : ''}`}
											/>
											{isRetrying ? t('preparing') : t('retryWrongQs')}
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

									<Button
										variant='link'
										className={`position-absolute top-0 end-0 m-3 p-0 ${isBookmarked(q) ? 'text-primary' : 'text-muted opacity-25'
											}`}
										onClick={() => toggleBookmark(q)}
									>
										<Icon name={isBookmarked(q) ? 'bookmarkFill' : 'bookmark'} size={24} />
									</Button>

									<div className='mb-4 fs-5 fw-medium text-dark pe-4'>
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
												<div className='d-flex flex-column gap-2'>
													<div className='d-flex gap-2 flex-column'>
														<div className='text-dark small'>
															<MarkdownRenderer>
																{`${t('correctAnswerIs')} **${q.answer}**.`}
															</MarkdownRenderer>
														</div>
															{q.explanation && (
																<div className='mt-2 pt-2 border-top border-secondary border-opacity-10'>
																	<Badge bg='primary' className='mb-2 bg-opacity-75 text-white fw-medium' style={{ fontSize: '0.65rem' }}>
																		{t('aiExplanation')}
																	</Badge>
																<div className='text-dark'>
																	<MarkdownRenderer>{q.explanation}</MarkdownRenderer>
																</div>
															</div>
														)}
													</div>
													{!q.explanation && (
														<Button
															variant='link'
															className='p-0 text-decoration-none d-flex align-items-center gap-2 align-self-start mt-1'
															onClick={() => fetchExplanation(index, q)}
															disabled={loadingExplanation[index]}
														>
															<Icon
																name='sparkles'
																size={16}
																className={loadingExplanation[index] ? 'spinner' : 'text-primary'}
															/>
															<span className='small fw-bold'>
																{loadingExplanation[index]
																	? t('generatingExplanation')
																	: t('generateExplanation')}
															</span>
														</Button>
													)}
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
	const { t } = useLanguage();

	return (
		<Suspense
			fallback={
				<Container className='text-center mt-5'>{t('loadingResults')}</Container>
			}
		>
			<ResultsContent />
		</Suspense>
	);
}
