import React from 'react';

export const metadata = {
	title: 'Terms of Service — selftest.in',
	description: 'Terms and conditions for using selftest.in.',
};

export default function TermsPage() {
	return (
		<main className='container py-5'>
			<h1>Terms of Service</h1>
			<p>
				By using selftest.in, you agree to these terms. Please read them
				carefully.
			</p>

			<h2>Acceptable use</h2>
			<p>
				Users must not use the service to generate or distribute illegal or
				harmful content.
			</p>

			<h2>Limitation of liability</h2>
			<p>
				We are not liable for indirect or incidental damages. The service is
				provided as-is.
			</p>
		</main>
	);
}
