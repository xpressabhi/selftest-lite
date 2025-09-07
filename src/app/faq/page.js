import React from 'react';

export const metadata = {
	title: 'FAQ — selftest.in',
	description:
		'Frequently asked questions about selftest.in, quizzes, privacy, and features.',
};

export default function FAQPage() {
	return (
		<main className='container py-5'>
			<h1>Frequently Asked Questions</h1>

			<h2>What is selftest.in?</h2>
			<p>
				A lightweight quiz generator that creates multiple-choice tests on any
				topic. It helps learners practice and retain information.
			</p>

			<h2>Is my data shared?</h2>
			<p>
				No — test history is stored locally in your browser. We do not sell
				personal data.
			</p>

			<h2>How are questions generated?</h2>
			<p>
				Questions are generated using AI prompt templates to produce clear
				stems, distractors, and explanations.
			</p>
		</main>
	);
}
