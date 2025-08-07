'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import MarkdownRenderer from '../components/MarkdownRenderer';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Test() {
	const [questionPaper, setQuestionPaper] = useState(null);
	const [answers, setAnswers] = useState({});
	const [loading, setLoading] = useState(true);
	const router = useRouter();

	useEffect(() => {
		const storedPaper = localStorage.getItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		if (storedPaper) {
			setQuestionPaper(JSON.parse(storedPaper));
			localStorage.removeItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		}
		setLoading(false);
	}, []);

	const handleAnswerChange = (questionIndex, answer) => {
		setAnswers({
			...answers,
			[questionIndex]: answer,
		});
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		// Save user answers to localStorage
		localStorage.setItem(STORAGE_KEYS.USER_ANSWERS, JSON.stringify(answers));
		// Save the question paper to localStorage for the results page
		localStorage.setItem(STORAGE_KEYS.QUESTION_PAPER, JSON.stringify(questionPaper));
		// Remove unsubmitted test
		localStorage.removeItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		// Navigate to results page
		router.push('/results');
	};

	if (loading) {
		return <div className='container text-center mt-5'>Loading...</div>;
	}

	if (!questionPaper) {
		return (
			<div className='container text-center mt-5'>
				<h1>No test found!</h1>
				<p>Please generate a test first.</p>
				<button
					className='btn btn-primary'
					onClick={() => router.push('/')}
				>
					Go to Home
				</button>
			</div>
		);
	}

	return (
		<div className='container mt-5'>
			<h1 className='mb-4'>{questionPaper.topic}</h1>
			<form onSubmit={handleSubmit}>
				{questionPaper.questions.map((q, index) => (
					<div key={index} className='card mb-4'>
						<div className='card-header'>Question {index + 1}</div>
						<div className='card-body'>
							<h5 className='card-title'>
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
							</h5>
							{q.options.map((option, i) => (
								<div key={i} className='form-check'>
									<input
										className='form-check-input'
										type='radio'
										name={`question-${index}`}
										id={`question-${index}-option-${i}`}
										value={option}
										onChange={() => handleAnswerChange(index, option)}
										checked={answers[index] === option}
									/>
									<label
										className='form-check-label'
										htmlFor={`question-${index}-option-${i}`}
									>
										<MarkdownRenderer>{option}</MarkdownRenderer>
									</label>
								</div>
							))}
						</div>
					</div>
				))}
				<button type='submit' className='btn btn-success w-100'>
					Submit Answers
				</button>
			</form>
		</div>
	);
}
