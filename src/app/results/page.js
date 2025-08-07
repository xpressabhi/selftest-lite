'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Results() {
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

		if (testId) {
			// Load from history if testId is present
			const testHistory =
				JSON.parse(localStorage.getItem(STORAGE_KEYS.TEST_HISTORY)) || [];
			const historicalTest = testHistory.find((test) => test.id === testId);

			if (historicalTest) {
				// For historical tests, we need to store the full question paper and user answers
				// This is a simplification; ideally, the full test data would be stored with the history entry.
				// For now, we'll assume the historicalTest object contains enough info or we fetch it.
				// Since the current history only stores metadata, we'll need to adjust.
				// Let's assume for now that the historicalTest object will eventually contain `questionPaper` and `userAnswers`.
				// For the current structure, we can't load full historical test details this way.
				// I will modify the TestHistory saving logic to include full paper and answers.
				// For now, if an ID is passed, we'll just show a message that historical viewing is not fully supported yet.
				// This requires a change in how tests are saved in results/page.js.

				// Re-evaluating: The current `results/page.js` saves the *metadata* of the test to history.
				// To view past tests, we need to save the `questionPaper` and `userAnswers` along with the metadata.
				// This is a more significant change. Let's first ensure the current flow works, then enhance history viewing.

				// For now, if an ID is present, we'll try to load the full paper and answers from specific keys
				// that would have been saved if the test was just completed.
				// This means the `id` parameter is currently not fully utilized for loading *past* tests.
				// The user's request implies viewing past tests. I need to adjust the saving mechanism.

				// Let's modify the saving logic first to include the full paper and answers in the history.
				// Then, this `useEffect` can correctly load them.
				// I will revert this change and first modify the saving logic in the same file.

				// Re-re-evaluating: The prompt is about tracking created tests and submitted answers in local storage and displaying links.
				// The current `results/page.js` already saves the metadata to `TEST_HISTORY`.
				// The `TestHistory.js` component already creates links like `/results?id=${test.id}`.
				// The missing part is `results/page.js` actually using that `id` to load the specific test.

				// To enable viewing past tests, the `TEST_HISTORY` entry needs to contain the full `questionPaper` and `userAnswers`.
				// This is a change to the `newTest` object being saved.
				// I will modify the `newTest` object to include `questionPaper` and `userAnswers`.

				// Then, this `useEffect` will check for `testId` and load from `testHistory`.
				// If `testId` is not present, it will load the most recent unsubmitted test.

				const historyEntry = testHistory.find((entry) => entry.id === testId);
				if (
					historyEntry &&
					historyEntry.questionPaper &&
					historyEntry.userAnswers
				) {
					paper = historyEntry.questionPaper;
					answers = historyEntry.userAnswers;
				} else {
					// Fallback if historical data is incomplete or not found
					const storedPaper = localStorage.getItem(STORAGE_KEYS.QUESTION_PAPER);
					const storedAnswers = localStorage.getItem(STORAGE_KEYS.USER_ANSWERS);
					if (storedPaper && storedAnswers) {
						paper = JSON.parse(storedPaper);
						answers = JSON.parse(storedAnswers);
					}
				}
			} else {
				// No testId, load the most recently completed test
				const storedPaper = localStorage.getItem(STORAGE_KEYS.QUESTION_PAPER);
				const storedAnswers = localStorage.getItem(STORAGE_KEYS.USER_ANSWERS);
				if (storedPaper && storedAnswers) {
					paper = JSON.parse(storedPaper);
					answers = JSON.parse(storedAnswers);
				}
			}

			if (paper && answers) {
				setQuestionPaper(paper);
				setUserAnswers(answers);

				let calculatedScore = 0;
				paper.questions.forEach((q, index) => {
					if (answers[index] === q.answer) {
						calculatedScore++;
					}
				});
				setScore(calculatedScore);

				// If this is a newly submitted test (no testId in URL), save it to history
				if (!testId) {
					const newTestId = new Date().getTime().toString();
					const testHistory =
						JSON.parse(localStorage.getItem(STORAGE_KEYS.TEST_HISTORY)) || [];
					const newTest = {
						id: newTestId,
						topic: paper.topic || 'Untitled Test',
						timestamp: new Date().getTime(),
						score: calculatedScore,
						totalQuestions: paper.questions.length,
						questionPaper: paper, // Save full question paper
						userAnswers: answers, // Save user's answers
					};

					const updatedHistory = [newTest, ...testHistory].slice(0, 10);
					localStorage.setItem(
						STORAGE_KEYS.TEST_HISTORY,
						JSON.stringify(updatedHistory),
					);
				}
			}
			setLoading(false);
		}
	}, [searchParams]);

	const handleNewTest = () => {
		localStorage.removeItem(STORAGE_KEYS.QUESTION_PAPER);
		localStorage.removeItem(STORAGE_KEYS.USER_ANSWERS);
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
