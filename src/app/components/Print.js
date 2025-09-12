import React, { useState } from 'react';
import Icon from './Icon';
import dynamic from 'next/dynamic';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

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
						display: block !important;
						position: fixed !important;
						visibility: visible !important;
						opacity: 0.2 !important;
						z-index: 9999 !important;
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
						color-adjust: exact !important;
						forced-color-adjust: none !important;
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
					width: 60%;
					font-size: 5rem;
					color: rgba(200, 200, 200, 0.2);
					transform: rotate(-30deg);
					pointer-events: none;
					user-select: none;
					z-index: 1;
					text-align: center;
					font-weight: bold;
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
		const printContents = document.querySelector('.print-content').outerHTML;
		const styles = Array.from(
			document.querySelectorAll('style, link[rel="stylesheet"]'),
		)
			.map((node) => node.outerHTML)
			.join('');
		const newWin = window.open('', '', 'width=800,height=600');
		newWin.document.write('<html><head><title>selftest.in</title>');
		newWin.document.write(styles);
		newWin.document.write('</head><body>');
		newWin.document.write(printContents);
		newWin.document.write('</body></html>');
		newWin.document.close();
		newWin.focus();
		newWin.print();
		newWin.close();
	};

	if (!showPreview) {
		return (
			<button
				type='button'
				className='btn btn-outline-secondary d-flex align-items-center gap-2'
				onClick={handlePrint}
			>
				<Icon name='print' /> Print Test
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
					<Icon name='close' /> Close
				</button>
				<button
					type='button'
					className='btn btn-primary position-fixed top-0 start-0 m-3 d-flex align-items-center gap-2'
					onClick={handlePrintContent}
				>
					<Icon name='print' /> Print
				</button>
				<PrintableContent questionPaper={questionPaper} />
			</div>
		</div>
	);
}
