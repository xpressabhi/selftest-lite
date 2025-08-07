'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import MarkdownRenderer from '../components/MarkdownRenderer';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
	FaSpinner,
	FaExclamationCircle,
	FaHome,
	FaBookOpen,
	FaQuestion,
	FaCheckCircle,
	FaCircle,
	FaDotCircle,
} from 'react-icons/fa';

export default function Test() {
	const [questionPaper, setQuestionPaper] = useState(null);
	const [answers, setAnswers] = useState({});
	const [loading, setLoading] = useState(true);
	const router = useRouter();

	useEffect(() => {
		// Load question paper from localStorage
		const storedPaper = localStorage.getItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		if (storedPaper) {
			setQuestionPaper(JSON.parse(storedPaper));
			// Don't remove the unsubmitted test until it's actually submitted
			// This ensures the test persists across page refreshes
		}

		// Load saved answers if they exist
		const savedAnswers = localStorage.getItem(
			`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers`,
		);
		if (savedAnswers) {
			setAnswers(JSON.parse(savedAnswers));
		}

		setLoading(false);
	}, []);

	const handleAnswerChange = (questionIndex, answer) => {
		const updatedAnswers = {
			...answers,
			[questionIndex]: answer,
		};
		setAnswers(updatedAnswers);

		// Save answers to localStorage whenever they change
		localStorage.setItem(
			`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers`,
			JSON.stringify(updatedAnswers),
		);
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		// Save user answers to localStorage for results page
		localStorage.setItem(STORAGE_KEYS.USER_ANSWERS, JSON.stringify(answers));
		// Save the question paper to localStorage for the results page
		localStorage.setItem(
			STORAGE_KEYS.QUESTION_PAPER,
			JSON.stringify(questionPaper),
		);
		// Remove unsubmitted test and its answers
		localStorage.removeItem(STORAGE_KEYS.UNSUBMITTED_TEST);
		localStorage.removeItem(`${STORAGE_KEYS.UNSUBMITTED_TEST}_answers`);
		// Navigate to results page
		router.push('/results');
	};

	if (loading) {
		return (
			<div className='container text-center mt-5'>
				<FaSpinner className='spinner mb-2' size={24} />
				<div>Loading test...</div>
			</div>
		);
	}

	if (!questionPaper) {
		return (
			<div className='container text-center mt-5'>
				<FaExclamationCircle className='text-warning mb-3' size={48} />
				<h1>No test found!</h1>
				<p>Please generate a test first.</p>
				<button
					className='btn btn-primary d-flex align-items-center gap-2 mx-auto'
					onClick={() => router.push('/')}
				>
					<FaHome /> Go to Home
				</button>
			</div>
		);
	}

	return (
		<div className='container mt-5'>
			<h1 className='mb-4 d-flex align-items-center gap-2'>
				<FaBookOpen className='text-primary' />
				{questionPaper.topic}
			</h1>
			<form onSubmit={handleSubmit}>
				{questionPaper.questions.map((q, index) => (
					<div key={index} className='card mb-4'>
						<div className='card-header d-flex align-items-center gap-2'>
							<FaQuestion className='text-primary' />
							<span className='badge bg-primary rounded-pill'>{index + 1}</span>
						</div>
						<div className='card-body'>
							<h5 className='card-title'>
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
							</h5>
							{q.options.map((option, i) => (
								<div key={i} className='form-check py-2'>
									<div className='d-flex align-items-center gap-2'>
										{answers[index] === option ? (
											<FaDotCircle className='text-primary' size={20} />
										) : (
											<FaCircle className='text-muted' size={20} />
										)}
										<input
											className='form-check-input d-none'
											type='radio'
											name={`question-${index}`}
											id={`question-${index}-option-${i}`}
											value={option}
											onChange={() => handleAnswerChange(index, option)}
											checked={answers[index] === option}
										/>
										<label
											className='form-check-label w-100 cursor-pointer'
											style={{ cursor: 'pointer' }}
											htmlFor={`question-${index}-option-${i}`}
										>
											<MarkdownRenderer>{option}</MarkdownRenderer>
										</label>
									</div>
								</div>
							))}
						</div>
					</div>
				))}
				<button
					type='submit'
					className='btn btn-success w-100 d-flex align-items-center justify-content-center gap-2'
				>
					<FaCheckCircle /> Submit Answers
				</button>
			</form>
		</div>
	);
}
