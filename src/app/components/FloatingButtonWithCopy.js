import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
import { useLanguage } from '../context/LanguageContext';

export default function FloatingButtonWithCopy({
	label,
	data = '0',
}) {
	const { t } = useLanguage();
	const [copied, setCopied] = useState(false);
	const displayLabel = label || t('testId');

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
				<span>{copied ? t('copied') : `${displayLabel} ${data}`}</span>
			</Button>
		</div>
	);
}
