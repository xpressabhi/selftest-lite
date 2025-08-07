'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Results() {
	const [score, setScore] = useState(0);
	const [questionPaper, setQuestionPaper] = useState(null);
	const [userAnswers, setUserAnswers] = useState(null);
	const [loading, setLoading] = useState(true);
	const router = useRouter();

	useEffect(() => {
		const storedPaper = localStorage.getItem(STORAGE_KEYS.QUESTION_PAPER);
		const storedAnswers = localStorage.getItem(STORAGE_KEYS.USER_ANSWERS);

		if (storedPaper && storedAnswers) {
			const paper = JSON.parse(storedPaper);
			const answers = JSON.parse(storedAnswers);
			setQuestionPaper(paper);
			setUserAnswers(answers);

			let calculatedScore = 0;
			paper.questions.forEach((q, index) => {
				if (answers[index] === q.answer) {
					calculatedScore++;
				}
			});
			setScore(calculatedScore);

			// Save to test history
			const testId = new Date().getTime().toString();
			const testHistory =
				JSON.parse(localStorage.getItem(STORAGE_KEYS.TEST_HISTORY)) || [];
			const newTest = {
				id: testId,
				topic: paper.topic || 'Untitled Test',
				timestamp: new Date().getTime(),
				score: calculatedScore,
				totalQuestions: paper.questions.length,
			};

			// Add new test to history and keep only the last 10 tests
			const updatedHistory = [newTest, ...testHistory].slice(0, 10);
			localStorage.setItem(
				STORAGE_KEYS.TEST_HISTORY,
				JSON.stringify(updatedHistory),
			);
		}
		setLoading(false);
	}, []);

	const handleNewTest = () => {
		localStorage.removeItem(STORAGE_KEYS.QUESTION_PAPER);
		localStorage.removeItem(STORAGE_KEYS.USER_ANSWERS);
		router.push('/generate');
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
				{questionPaper.questions.map((q, index) => (
					<div key={index} className='card mb-3'>
						<div className='card-header'>
							Question {index + 1}: {q.question}
						</div>
						<div className='card-body'>
							<p>
								<strong>Your Answer:</strong>{' '}
								<span
									className={
										userAnswers[index] === q.answer
											? 'text-success'
											: 'text-danger'
									}
								>
									{userAnswers[index] || 'Not Answered'}
								</span>
							</p>
							{userAnswers[index] !== q.answer && (
								<p>
									<strong>Correct Answer:</strong>{' '}
									<span className='text-success'>{q.answer}</span>
								</p>
							)}
						</div>
					</div>
				))}
			</div>

			<button className='btn btn-primary w-100 mt-4' onClick={handleNewTest}>
				Start a New Test
			</button>
		</div>
	);
}
