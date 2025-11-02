import React, { useState } from 'react';
import { Button } from 'react-bootstrap';

export default function FloatingButtonWithCopy({
	label = 'label',
	data = '0',
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(data);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch (err) {
			console.error('Failed to copy text:', err);
		}
	};

	return (
		<div>
			<Button
				variant={copied ? 'outline-success' : 'outline-primary'}
				onClick={handleCopy}
				className='d-flex align-items-center gap-1 shadow-sm'
			>
				<span>{copied ? 'Copied!' : `${label} ${data}`}</span>
			</Button>
		</div>
	);
}
