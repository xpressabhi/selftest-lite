import React, { useState } from 'react';
import { FaPrint } from 'react-icons/fa';
import { IoMdClose } from 'react-icons/io';
import MarkdownRenderer from './MarkdownRenderer';

const PrintableContent = ({ questionPaper }) => {
	return (
		<div className='print-content'>
			<style jsx global>{`
				@media print {
					body * {
						visibility: hidden;
					}
					.print-content,
					.print-content * {
						visibility: visible;
					}
					.print-content {
						position: absolute;
						left: 0;
						top: 0;
					}
					.watermark {
						position: fixed !important;
						visibility: visible !important;
					}
					@page {
						size: A4;
						margin: 2cm;
					}
					.print-dialog {
						padding: 0 !important;
						margin: 0 !important;
					}
					.close-button {
						display: none !important;
					}
				}
				.print-content {
					padding: 20px;
					max-width: 800px;
					margin: 0 auto;
					background: white;
				}
				.watermark {
					position: fixed;
					top: 40%;
					left: 20%;
					font-size: 5rem;
					color: rgba(200, 200, 200, 0.2);
					transform: rotate(-30deg);
					z-index: -1;
				}
				.question {
					margin: 1.5rem 0;
				}
				.question-number {
					font-weight: bold;
					margin-right: 0.5rem;
				}
				.options {
					margin-left: 2rem;
					margin-top: 0.5rem;
				}
				.option {
					margin: 0.5rem 0;
					display: flex;
					gap: 0.5rem;
				}
				.option-letter {
					flex-shrink: 0;
				}
				.answers {
					margin-top: 2rem;
					page-break-before: always;
				}
				.answer-item {
					margin: 0.5rem 0;
				}
			`}</style>
			<div className='watermark'>selftest.in</div>
			<h2>{questionPaper.topic || 'Test'}</h2>
			{questionPaper.questions.map((q, i) => (
				<div key={i} className='question'>
					<span className='question-number'>Q{i + 1}.</span>
					<MarkdownRenderer>{q.question}</MarkdownRenderer>
					<div className='options'>
						{q.options.map((opt, idx) => (
							<div key={idx} className='option'>
								<span className='option-letter'>
									{String.fromCharCode(65 + idx)}.
								</span>
								<MarkdownRenderer>{opt}</MarkdownRenderer>
							</div>
						))}
					</div>
				</div>
			))}
			<div className='answers'>
				<h3>Answers</h3>
				<ol>
					{questionPaper.questions.map((q, i) => (
						<li key={i} className='answer-item'>
							<MarkdownRenderer>{q.answer}</MarkdownRenderer>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
};

export default function Print({ questionPaper }) {
	const [showPreview, setShowPreview] = useState(false);

	const handlePrint = () => {
		if (!questionPaper) return;
		setShowPreview(true);
	};

	const handlePrintContent = () => {
		window.print();
	};

	if (!showPreview) {
		return (
			<button
				type='button'
				className='btn btn-outline-secondary d-flex align-items-center gap-2'
				onClick={handlePrint}
			>
				<FaPrint /> Print Test
			</button>
		);
	}

	return (
		<div className='print-dialog fixed-top vh-100 w-100 bg-light overflow-auto'>
			<div className='container position-relative'>
				<button
					type='button'
					className='close-button btn btn-outline-secondary position-fixed top-0 end-0 m-3 d-flex align-items-center gap-2'
					onClick={() => setShowPreview(false)}
				>
					<IoMdClose /> Close
				</button>
				<button
					type='button'
					className='btn btn-primary position-fixed top-0 start-0 m-3 d-flex align-items-center gap-2'
					onClick={handlePrintContent}
				>
					<FaPrint /> Print
				</button>
				<PrintableContent questionPaper={questionPaper} />
			</div>
		</div>
	);
}
