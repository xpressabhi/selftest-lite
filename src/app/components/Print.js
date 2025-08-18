import React from 'react';
import { FaPrint } from 'react-icons/fa';

export default function Print({ questionPaper }) {
	const handlePrint = () => {
		if (!questionPaper) return;
		const printWindow = window.open('', '_blank');
		const content = `
			<html>
				<head>
					<title>selftest.in</title>
					<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
					<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/markdown-it-texmath@1.0.0/css/texmath.min.css" />
					<style>
						h1, h2, h3, h4, h5, h6 { margin: 16px 0 8px; font-weight: bold; }
						p { margin: 8px 0; }
						ul, ol { margin: 8px 0 8px 24px; }
						li { margin: 4px 0; }
						code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
						pre { background: #f5f5f5; padding: 8px; border-radius: 5px; overflow-x: auto; }
						blockquote { border-left: 4px solid #ccc; margin: 8px 0; padding-left: 12px; color: #555; }
						strong { font-weight: bold; }
						em { font-style: italic; }
						.watermark {
							position: fixed;
							top: 40%;
							left: 20%;
							font-size: 5rem;
							color: rgba(200,200,200,0.2);
							transform: rotate(-30deg);
							z-index: -1;
						}
						.katex {
							font-size: 1.1em;
						}
						@media print {
							.watermark { position: fixed; }
						}
					</style>
					<script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.1/dist/markdown-it.min.js"></script>
					<script src="https://cdn.jsdelivr.net/npm/markdown-it-texmath@1.0.0/texmath.min.js"></script>
					<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
				</head>
				<body>
					<div class="watermark">selftest.in</div>
					<h2>${questionPaper.topic || 'Test'}</h2>
					${questionPaper.questions
						.map(
							(q, i) => `
						<div class="question">
							<strong>Q${i + 1}.</strong>
							<div class="question-text" data-md="${encodeURIComponent(q.question)}"></div>
							<div class="options">
								${q.options
									.map(
										(opt, idx) =>
											`<div class="option" data-md="${encodeURIComponent(
												opt,
											)}">${String.fromCharCode(65 + idx)}.</div>`,
									)
									.join('')}
							</div>
						</div>
					`,
						)
						.join('')}
					<div class="answers">
						<h3>Answers</h3>
						<ol>
							${questionPaper.questions
								.map(
									(q, i) =>
										`<li><div class="answer-text" data-md="${encodeURIComponent(
											q.answer,
										)}"></div></li>`,
								)
								.join('')}
						</ol>
					</div>
					<script>
						const md = window.markdownit().use(texmath.use(katex));
						document.querySelectorAll('[data-md]').forEach(el => {
							el.innerHTML = md.render(decodeURIComponent(el.getAttribute('data-md')));
						});
						document.querySelectorAll('.answer-text').forEach(el => {
							try {
								katex.render(el.textContent, el, { throwOnError: false });
							} catch (e) {
								console.error('KaTeX render error:', e);
							}
						});
						// trigger print after rendering finishes
						setTimeout(() => {
							window.print();
						}, 300);
					</script>
				</body>
			</html>
		`;
		printWindow.document.write(content);
		printWindow.document.close();
	};

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
