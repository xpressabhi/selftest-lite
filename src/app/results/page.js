'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import MarkdownRenderer from '../components/MarkdownRenderer';
import 'bootstrap/dist/css/bootstrap.min.css';

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
			<div className='container text-center mt-5'>Calculating results...</div>
		);
	}

	if (!questionPaper || !userAnswers) {
		return (
			<div className='container text-center mt-5'>
				<h1>No results found!</h1>
				<p>Please take a test first.</p>
				<button
					className='btn btn-primary'
					onClick={() => router.push('/test')}
				>
					Take a Test
				</button>
			</div>
		);
	}

	return (
		<div className='container mt-5'>
			<h1 className='mb-4 text-center'>Test Results</h1>
			<div className='alert alert-info text-center'>
				<h2>
					Your Score: {score} / {questionPaper.questions.length}
				</h2>
			</div>

			<div className='mt-5'>
				<h3 className='mb-3'>Review Your Answers</h3>
				{questionPaper.questions.map((q, index) => {
					// Get user answer from either array or object format
					const userAnswer = Array.isArray(userAnswers)
						? userAnswers[index]
						: userAnswers[index.toString()];

					return (
						<div key={index} className='card mb-3'>
							<div className='card-header'>
								Question {index + 1}:{' '}
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
							</div>
							<div className='card-body'>
								<p>
									<strong>Your Answer:</strong>{' '}
									<span
										className={
											userAnswer === q.answer ? 'text-success' : 'text-danger'
										}
									>
										{userAnswer ? (
											<MarkdownRenderer>{userAnswer}</MarkdownRenderer>
										) : (
											'Not Answered'
										)}
									</span>
								</p>
								{userAnswer !== q.answer && (
									<p>
										<strong>Correct Answer:</strong>{' '}
										<span className='text-success'>
											<MarkdownRenderer>{q.answer}</MarkdownRenderer>
										</span>
									</p>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<button className='btn btn-primary w-100 mt-4' onClick={handleNewTest}>
				Start a New Test
			</button>
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
