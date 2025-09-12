import React from 'react';

const ArrowRight = () => (
	<span style={{ display: 'inline-flex', width: 16, height: 16 }} aria-hidden>
		<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
			<path d='M10 17l5-5-5-5v10zM5 19h2V5H5v14z' />
		</svg>
	</span>
);

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
			<ArrowRight /> Share Test
		</button>
	);
}
