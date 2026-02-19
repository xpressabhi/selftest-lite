import React from 'react';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';

export default function Share({ paper }) {
	const { t } = useLanguage();
	const { id, topic } = paper || {};
	const handleShare = async () => {
		if (!id) return;
		const params = new URLSearchParams({ id }).toString();
		const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
		const normalizedConfiguredOrigin = configuredOrigin
			? configuredOrigin.replace(/\/+$/, '')
			: '';
		const shareOrigin = normalizedConfiguredOrigin || window.location.origin;
		const shareUrl = `${shareOrigin}/test?${params}`;
		const safeTopic = topic || t('defaultTestTopic');

		if (navigator.share) {
			try {
				await navigator.share({
					title: safeTopic,
					text: `${safeTopic} - ${t('checkOutThisTest')}`,
					url: shareUrl,
				});
			} catch (err) {
				console.error('Share failed:', err);
			}
		} else {
			// fallback: copy link
			await navigator.clipboard.writeText(shareUrl);
			alert(t('shareLinkCopied'));
		}
	};
	if (!id) return null;

	return (
		<button
			className='btn btn-outline-secondary d-flex align-items-center gap-2'
			onClick={handleShare}
		>
			<Icon name='share' /> {t('share')}
		</button>
	);
}
