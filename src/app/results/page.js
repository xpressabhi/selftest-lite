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
		<div
			style={{
				minHeight: '100vh',
				background: '#f8f9fb',
				padding: '0',
				margin: '0',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'flex-start',
			}}
		>
			<div
				style={{
					width: '100%',
					maxWidth: 700,
					marginTop: 48,
					marginBottom: 24,
				}}
			>
				<h1
					style={{
						fontWeight: 700,
						fontSize: '2.5rem',
						textAlign: 'center',
						letterSpacing: '-1px',
						marginBottom: 24,
						color: '#222',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 12,
					}}
				>
					<FaTrophy
						style={{ color: '#ffd700', fontSize: '2.4rem', marginBottom: 3 }}
					/>
					Test Results
				</h1>
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						marginBottom: 32,
					}}
				>
					<div
						style={{
							background: 'linear-gradient(135deg, #f8d90f 0%, #f3f4f7 100%)',
							boxShadow:
								'0 4px 32px 0 rgba(0,0,0,0.05), 0 1.5px 6px 0 rgba(180,180,180,.10)',
							borderRadius: 56,
							padding: '36px 56px',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							minWidth: 220,
						}}
					>
						<div
							style={{
								fontSize: '2.8rem',
								fontWeight: 800,
								color: '#222',
								letterSpacing: '-2px',
								lineHeight: 1.1,
								textAlign: 'center',
							}}
						>
							{score}
							<span
								style={{
									fontWeight: 400,
									fontSize: '1.5rem',
									color: '#888',
									marginLeft: 10,
								}}
							>
								/ {questionPaper.questions.length}
							</span>
						</div>
						<div
							style={{
								fontSize: '1.1rem',
								color: '#555',
								marginTop: 8,
								letterSpacing: 0,
								fontWeight: 500,
							}}
						>
							Your Score
						</div>
					</div>
				</div>

				<div style={{ marginTop: 40 }}>
					<div
						style={{
							textAlign: 'center',
							fontSize: '1.45rem',
							fontWeight: 600,
							color: '#1b1b1b',
							marginBottom: 32,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 10,
						}}
					>
						<FaCheckCircle style={{ color: '#4fbb6b', fontSize: '1.3em' }} />
						Review Your Answers
					</div>
					{questionPaper.questions.map((q, index) => {
						const userAnswer = Array.isArray(userAnswers)
							? userAnswers[index]
							: userAnswers[index.toString()];
						const isCorrect = userAnswer === q.answer;
						const answered = !!userAnswer;
						return (
							<div
								key={index}
								style={{
									background: '#fff',
									borderRadius: 24,
									boxShadow: '0 2px 16px 0 rgba(0,0,0,0.06)',
									padding: '32px 32px 22px 32px',
									marginBottom: 32,
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'stretch',
									position: 'relative',
								}}
							>
								<span
									style={{
										fontSize: 14,
										color: '#b0b5bc',
										fontWeight: 500,
										letterSpacing: '0.5px',
										marginBottom: 8,
										display: 'block',
										textAlign: 'left',
										userSelect: 'none',
									}}
								>
									Question {index + 1}
								</span>
								<div
									style={{
										fontSize: '1.25rem',
										fontWeight: 600,
										color: '#23272f',
										marginBottom: 18,
										lineHeight: 1.5,
										textAlign: 'left',
									}}
								>
									<MarkdownRenderer>{q.question}</MarkdownRenderer>
								</div>
								<div
									style={{
										marginBottom: 6,
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										flexWrap: 'wrap',
									}}
								>
									<span
										style={{ fontWeight: 500, color: '#5d6472', fontSize: 17 }}
									>
										Your Answer:
									</span>
									{answered ? (
										<span
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 6,
												fontWeight: 500,
												fontSize: 16,
												padding: '4px 16px',
												borderRadius: 32,
												background: isCorrect ? '#4fbb6b' : '#e14c4c',
												color: '#fff',
												boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
												marginRight: 8,
											}}
										>
											{isCorrect ? (
												<FaCheckCircle
													style={{ color: '#fff', marginRight: 2 }}
												/>
											) : (
												<FaTimesCircle
													style={{ color: '#fff', marginRight: 2 }}
												/>
											)}
											<MarkdownRenderer>{userAnswer}</MarkdownRenderer>
										</span>
									) : (
										<span
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 6,
												fontWeight: 500,
												fontSize: 16,
												padding: '4px 16px',
												borderRadius: 32,
												background: '#b0b5bc',
												color: '#fff',
												boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
												marginRight: 8,
											}}
										>
											<FaExclamationCircle
												style={{ color: '#fff', marginRight: 2 }}
											/>
											Not Answered
										</span>
									)}
								</div>
								{answered && !isCorrect && (
									<div
										style={{
											marginTop: 7,
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											flexWrap: 'wrap',
										}}
									>
										<span
											style={{
												fontWeight: 500,
												color: '#5d6472',
												fontSize: 17,
											}}
										>
											Correct Answer:
										</span>
										<span
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 6,
												fontWeight: 500,
												fontSize: 16,
												padding: '4px 16px',
												borderRadius: 32,
												background: '#4fbb6b',
												color: '#fff',
												boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
											}}
										>
											<FaArrowRight style={{ color: '#fff', marginRight: 2 }} />
											<MarkdownRenderer>{q.answer}</MarkdownRenderer>
										</span>
									</div>
								)}
							</div>
						);
					})}
				</div>
				<button
					className='btn btn-primary'
					style={{
						width: '100%',
						marginTop: 28,
						fontSize: '1.15rem',
						fontWeight: 600,
						padding: '16px 0',
						borderRadius: 32,
						boxShadow: '0 1.5px 6px 0 rgba(180,180,180,.10)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 12,
						letterSpacing: '0.5px',
					}}
					onClick={handleNewTest}
				>
					<FaPlusCircle /> Start a New Test
				</button>
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
