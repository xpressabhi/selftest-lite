import React from 'react';

export const metadata = {
	title: 'Privacy Policy — selftest.in',
	description:
		'Privacy policy for selftest.in. Learn how we collect and use data.',
};

export default function PrivacyPage() {
	return (
		<main className='container py-5'>
			<h1>Privacy Policy</h1>
			<p>
				This page describes how selftest.in collects, uses, and protects your
				personal information.
			</p>

			<h2>Data we collect</h2>
			<ul>
				<li>
					Test history stored locally in the browser (no personal data
					required).
				</li>
				<li>
					Optional user-provided contact information when you reach out via the
					Contact form.
				</li>
				<li>Standard analytics data (anonymous) to improve the service.</li>
			</ul>

			<h2>How we use data</h2>
			<p>
				Data is used to improve quiz quality, measure usage, and help diagnose
				problems. We do not sell user data to third parties.
			</p>

			<h2>Cookies and tracking</h2>
			<p>
				We may use cookies and third-party analytics (e.g., Vercel Analytics).
				You can opt out via your browser settings where applicable.
			</p>
		</main>
	);
}
