import React from 'react';
import Icon from './Icon';

export default function Share({ paper }) {
	const { id, topic } = paper || {};
	const handleShare = async () => {
		if (!id) return;
		const params = new URLSearchParams({ id }).toString();
		const shareUrl = `${window.location.origin}/test?${params}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: topic || 'Test Topic',
					text: topic + 'Check out this test!',
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
	if (!id) return null;

	return (
		<button
			className='btn btn-outline-secondary d-flex align-items-center gap-2'
			onClick={handleShare}
		>
			<Icon name='share' /> Share Test
		</button>
	);
}
