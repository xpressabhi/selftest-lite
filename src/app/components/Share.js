import React from 'react';
import { FaArrowRight } from 'react-icons/fa';

export default function Share({ requestParams }) {
	const handleShare = async () => {
		if (!requestParams) return;

		const params = new URLSearchParams(requestParams).toString();
		const shareUrl = `${window.location.origin}/?${params}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: questionPaper.topic || 'Test Results',
					text: 'Check out this test!',
					url: shareUrl,
				});
			} catch (err) {
				console.error('Share failed:', err);
			}
		} else {
			// fallback: copy link
			await navigator.clipboard.writeText(shareUrl);
			alert('Share link copied to clipboard!');
		}
	};
	if (!requestParams) return null;

	return (
		<button
			className='btn btn-outline-secondary d-flex align-items-center gap-2'
			onClick={handleShare}
		>
			<FaArrowRight /> Share
		</button>
	);
}
