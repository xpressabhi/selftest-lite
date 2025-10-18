import React, { useState } from 'react';
import Icon from './Icon';
import dynamic from 'next/dynamic';
// Import document generation libraries
import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	HeadingLevel,
	Table,
	TableRow,
	TableCell,
	BorderStyle,
} from 'docx';
import PptxGenJS from 'pptxgenjs';

const MarkdownRenderer = dynamic(
	() => import('../components/MarkdownRenderer'),
	{
		loading: () => <p>Loading...</p>,
		ssr: false,
	},
);

/**
 * Renders content for printing based on the selected format
 * @param {Object} props - Component props
 * @param {Object} props.questionPaper - The question paper data
 * @param {string} props.format - The print format (test, doc, ppt)
 */
const PrintableContent = ({ questionPaper, format = 'test' }) => {
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
						transform: rotate(-30deg) !important;
						top: 40% !important;
						left: 20% !important;
						width: 60% !important;
						font-size: 5rem !important;
						text-align: center !important;
						font-weight: bold !important;
						color: rgba(200, 200, 200, 0.2) !important;
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
					.ppt-question {
						page-break-after: always;
					}
					.ppt-question:last-child {
						page-break-after: auto;
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
				.ppt-question {
					min-height: 80vh;
					display: flex;
					flex-direction: column;
					padding: 2rem;
					position: relative;
				}
				.ppt-header {
					text-align: center;
					margin-bottom: 2rem;
				}
				.ppt-footer {
					position: absolute;
					bottom: 1rem;
					width: 100%;
					text-align: center;
					font-size: 0.8rem;
					color: #666;
				}
				.doc-content {
					line-height: 1.6;
				}
				.doc-header {
					text-align: center;
					margin-bottom: 2rem;
					border-bottom: 1px solid #ddd;
					padding-bottom: 1rem;
				}
				.doc-section {
					margin-bottom: 2rem;
				}
			`}</style>
			<div className='watermark'>selftest.in</div>

			{format === 'test' && (
				<>
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
				</>
			)}

			{format === 'doc' && (
				<div className='doc-content'>
					<div className='doc-header'>
						<h1>{questionPaper.topic || 'Test Document'}</h1>
						<p>Generated from selftest.in</p>
					</div>

					<div className='doc-section'>
						<h2>Questions</h2>
						{questionPaper.questions.map((q, i) => (
							<div key={i} className='question'>
								<h3>Question {i + 1}</h3>
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
								<h4>Options:</h4>
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
					</div>

					<div className='doc-section'>
						<h2>Answers and Explanations</h2>
						{questionPaper.questions.map((q, i) => (
							<div key={i} className='answer-item'>
								<h3>Answer to Question {i + 1}</h3>
								<MarkdownRenderer>{q.answer}</MarkdownRenderer>
							</div>
						))}
					</div>
				</div>
			)}

			{format === 'ppt' && (
				<>
					{/* Title slide */}
					<div className='ppt-question'>
						<div className='ppt-header'>
							<h1>{questionPaper.topic || 'Test Presentation'}</h1>
							<p>Generated from selftest.in</p>
						</div>
						<div className='ppt-footer'>
							selftest.in | Slide 1 of {questionPaper.questions.length + 1}
						</div>
					</div>

					{/* One slide per question */}
					{questionPaper.questions.map((q, i) => (
						<div key={i} className='ppt-question'>
							<h2>Question {i + 1}</h2>
							<div className='question-content'>
								<MarkdownRenderer>{q.question}</MarkdownRenderer>
							</div>
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
							<div className='answer mt-4'>
								<h4>Answer:</h4>
								<MarkdownRenderer>{q.answer}</MarkdownRenderer>
							</div>
							<div className='ppt-footer'>
								selftest.in | Slide {i + 2} of{' '}
								{questionPaper.questions.length + 1}
							</div>
						</div>
					))}
				</>
			)}
		</div>
	);
};

/**
 * Print component that allows printing test papers in different formats
 * @param {Object} props - Component props
 * @param {Object} props.questionPaper - The question paper data
 */
export default function Print({ questionPaper }) {
	const [showPreview, setShowPreview] = useState(false);
	const [printFormat, setPrintFormat] = useState('ppt'); // Default to PPT format

	const handlePrint = (format = 'ppt') => {
		if (!questionPaper) return;
		setPrintFormat(format);
		setShowPreview(true);
	};

	/**
	 * Creates and downloads a DOCX file from the question paper
	 */
	const generateDocx = async () => {
		try {
			// Create document sections
			const titleSection = {
				properties: {},
				children: [
					new Paragraph({
						text: questionPaper.topic || 'Test Document',
						heading: HeadingLevel.HEADING_1,
						alignment: 'center',
					}),
					new Paragraph({
						text: 'Generated from selftest.in',
						alignment: 'center',
					}),
					new Paragraph({
						text: '',
					}),
					new Paragraph({
						text: 'Questions',
						heading: HeadingLevel.HEADING_2,
					}),
				],
			};

			// Add questions
			const questionChildren = [];
			questionPaper.questions.forEach((q, i) => {
				questionChildren.push(
					new Paragraph({
						text: `Question ${i + 1}`,
						heading: HeadingLevel.HEADING_3,
						spacing: {
							before: 200,
						},
					}),
					new Paragraph({
						text: q.question.replace(/\*\*(.*?)\*\*/g, '$1'), // Simple markdown to text conversion
					}),
					new Paragraph({
						text: 'Options:',
						spacing: {
							before: 100,
						},
					}),
				);

				// Add options
				q.options.forEach((opt, idx) => {
					questionChildren.push(
						new Paragraph({
							text: `${String.fromCharCode(65 + idx)}. ${opt.replace(
								/\*\*(.*?)\*\*/g,
								'$1',
							)}`,
							spacing: {
								before: 40,
							},
							indent: {
								left: 400,
							},
						}),
					);
				});
			});

			// Add answers section
			questionChildren.push(
				new Paragraph({
					text: 'Answers and Explanations',
					heading: HeadingLevel.HEADING_2,
					pageBreakBefore: true,
					spacing: {
						before: 200,
					},
				}),
			);

			// Add answers
			questionPaper.questions.forEach((q, i) => {
				questionChildren.push(
					new Paragraph({
						text: `Answer to Question ${i + 1}`,
						heading: HeadingLevel.HEADING_3,
						spacing: {
							before: 200,
						},
					}),
					new Paragraph({
						text: q.answer.replace(/\*\*(.*?)\*\*/g, '$1'), // Simple markdown to text conversion
					}),
				);
			});

			const contentSection = {
				children: questionChildren,
			};

			// Create a new document with sections
			const doc = new Document({
				title: questionPaper.topic || 'Test Document',
				description: 'Generated from selftest.in',
				sections: [titleSection, contentSection],
			});

			// Generate and download the document
			const buffer = await Packer.toBuffer(doc);
			const blob = new Blob([buffer], {
				type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `selftest_${questionPaper.topic || 'test'}.docx`;
			document.body.appendChild(a);
			a.click();

			// Clean up
			setTimeout(() => {
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, 100);
		} catch (error) {
			console.error('Error generating DOCX file:', error);
			alert(
				'Failed to generate DOCX file. Please try again or use a different format.',
			);
		}
	};

	/**
	 * Creates and downloads a PPTX file from the question paper
	 */
	const generatePptx = async () => {
		try {
			// Create a new presentation
			const pptx = new PptxGenJS();

			// Set presentation properties
			pptx.layout = 'LAYOUT_16x9';
			pptx.title = questionPaper.topic || 'Test Presentation';
			pptx.subject = 'Generated from selftest.in';

			// Add title slide
			const titleSlide = pptx.addSlide();
			titleSlide.addText(
				[
					{
						text: questionPaper.topic || 'Test Presentation',
						options: { fontSize: 36, bold: true },
					},
					{ text: '\nGenerated from selftest.in', options: { fontSize: 18 } },
				],
				{ x: 0.5, y: 1.5, w: 9, h: 2, align: 'center' },
			);
			titleSlide.addText(
				'selftest.in | Slide 1 of ' + (questionPaper.questions.length + 1),
				{
					x: 0,
					y: 5,
					w: '100%',
					h: 0.3,
					align: 'center',
					fontSize: 10,
					color: '666666',
				},
			);

			// Add one slide per question
			questionPaper.questions.forEach((q, i) => {
				const slide = pptx.addSlide();

				// Add question title
				slide.addText(`Question ${i + 1}`, {
					x: 0.5,
					y: 0.5,
					w: 9,
					h: 0.5,
					fontSize: 24,
					bold: true,
				});

				// Add question content
				slide.addText(q.question.replace(/\*\*(.*?)\*\*/g, '$1'), {
					x: 0.5,
					y: 1.2,
					w: 9,
					h: 1.5,
					fontSize: 16,
				});

				// Add options
				let optionsText = '';
				q.options.forEach((opt, idx) => {
					optionsText += `${String.fromCharCode(65 + idx)}. ${opt.replace(
						/\*\*(.*?)\*\*/g,
						'$1',
					)}\n`;
				});

				slide.addText(optionsText, {
					x: 0.8,
					y: 2.8,
					w: 8.7,
					h: 2,
					fontSize: 14,
				});

				// Add answer
				slide.addText('Answer:', {
					x: 0.5,
					y: 4.8,
					w: 9,
					h: 0.3,
					fontSize: 16,
					bold: true,
				});
				slide.addText(q.answer.replace(/\*\*(.*?)\*\*/g, '$1'), {
					x: 0.5,
					y: 5.1,
					w: 9,
					h: 1,
					fontSize: 14,
				});

				// Add footer
				slide.addText(
					'selftest.in | Slide ' +
						(i + 2) +
						' of ' +
						(questionPaper.questions.length + 1),
					{
						x: 0,
						y: 6.7,
						w: '100%',
						h: 0.3,
						align: 'center',
						fontSize: 10,
						color: '666666',
					},
				);
			});

			// Generate and download the presentation
			pptx.writeFile({
				fileName: `selftest_${questionPaper.topic || 'test'}.pptx`,
			});
		} catch (error) {
			console.error('Error generating PPTX file:', error);
			alert(
				'Failed to generate PPTX file. Please try again or use a different format.',
			);
		}
	};

	/**
	 * Handles printing or downloading content based on format
	 */
	const handlePrintContent = async () => {
		if (printFormat === 'test') {
			// For test format, use browser print functionality
			const printContents = document.querySelector('.print-content').outerHTML;
			const watermark = '<div class="watermark" style="display: block !important; position: fixed !important; visibility: visible !important; opacity: 0.2 !important; z-index: 9999 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; forced-color-adjust: none !important; transform: rotate(-30deg) !important; top: 40% !important; left: 20% !important; width: 60% !important; font-size: 5rem !important; text-align: center !important; font-weight: bold !important; color: rgba(200, 200, 200, 0.2) !important;">selftest.in</div>';
			const styles = Array.from(
				document.querySelectorAll('style, link[rel="stylesheet"]'),
			)
				.map((node) => node.outerHTML)
				.join('');
			const newWin = window.open('', '', 'width=800,height=600');
			newWin.document.write('<html><head><title>selftest.in</title>');
			newWin.document.write(styles);
			newWin.document.write('</head><body>');
			newWin.document.write(watermark); // Add watermark explicitly
			newWin.document.write(printContents);
			newWin.document.write('</body></html>');
			newWin.document.close();
			newWin.focus();
			newWin.print();
			newWin.close();
		} else if (printFormat === 'doc') {
			// Generate and download DOCX file
			await generateDocx();
		} else if (printFormat === 'ppt') {
			// Generate and download PPTX file
			await generatePptx();
		}
	};

	if (!showPreview) {
		// Show only one button on the main page
		return (
			<button
				type='button'
				className='btn btn-outline-secondary d-flex align-items-center gap-2'
				onClick={() => handlePrint('ppt')}
				title='Print test in presentation format'
			>
				<Icon name='print' /> Print Test
			</button>
		);
	}

	return (
		<div className='print-dialog fixed-top vh-100 w-100 bg-light overflow-auto'>
			<div className='container position-relative'>
				<div className='d-flex justify-content-between position-fixed top-0 p-3 bg-light gap-5'>
					<div className='d-flex gap-2'>
						<button
							type='button'
							className='btn btn-primary d-flex align-items-center gap-2'
							onClick={handlePrintContent}
						>
							<Icon name={printFormat === 'test' ? 'print' : 'download'} />
							{printFormat === 'test' ? 'Print' : 'Download'}
						</button>
						<div className='btn-group'>
							<button
								type='button'
								className={`btn btn-outline-secondary ${
									printFormat === 'test' ? 'active' : ''
								}`}
								onClick={() => setPrintFormat('test')}
							>
								Test
							</button>
							<button
								type='button'
								className={`btn btn-outline-secondary ${
									printFormat === 'doc' ? 'active' : ''
								}`}
								onClick={() => setPrintFormat('doc')}
							>
								Doc
							</button>
							<button
								type='button'
								className={`btn btn-outline-secondary ${
									printFormat === 'ppt' ? 'active' : ''
								}`}
								onClick={() => setPrintFormat('ppt')}
							>
								PPT
							</button>
						</div>
					</div>
					<button
						type='button'
						className='close-button btn btn-outline-secondary d-flex align-items-center gap-2'
						onClick={() => setShowPreview(false)}
					>
						<Icon name='close' /> Close
					</button>
				</div>
				<div style={{ marginTop: '70px' }}>
					<PrintableContent
						questionPaper={questionPaper}
						format={printFormat}
					/>
				</div>
			</div>
		</div>
	);
}
