'use client';

import Icon from './Icon';
import { useDataSaver } from '../context/DataSaverContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * Data Saver Toggle Component
 * Allows users to enable/disable data saving mode
 * - Reduces animations
 * - Simplifies UI elements
 * - Shows data usage info
 *
 * @param {Object} props
 * @param {boolean} props.showLabel - Show descriptive label
 * @param {string} props.variant - 'button' | 'switch' | 'banner'
 */
export default function DataSaverToggle({ showLabel = true, variant = 'button' }) {
	const {
		isDataSaverActive: isEnabled,
		isAutoMode,
		isSlowConnection,
		toggleDataSaver,
	} = useDataSaver();
	const { t } = useLanguage();

	const toggle = () => {
		toggleDataSaver();
	};

	if (variant === 'banner' && isEnabled) {
		return (
			<div className="data-saver-banner" role="alert">
				<Icon name="wifiOff" size={16} />
				<span>
					{isAutoMode && isSlowConnection
						? t('dataSaverAutoEnabled')
						: t('dataSaverEnabled')}
				</span>
				<button
					className="disable-btn"
					onClick={toggle}
					type="button"
				>
					{t('disable')}
				</button>
				<style jsx>{`
					.data-saver-banner {
						display: flex;
						align-items: center;
						gap: 8px;
						padding: 12px 16px;
						background: var(--bg-tertiary);
						border: 1px solid var(--border-color);
						border-radius: var(--radius-md);
						margin-bottom: 16px;
						font-size: 0.875rem;
						color: var(--text-secondary);
					}

					.disable-btn {
						margin-left: auto;
						padding: 4px 12px;
						background: transparent;
						border: 1px solid var(--border-color);
						border-radius: var(--radius-sm);
						font-size: 0.75rem;
						color: var(--text-primary);
						cursor: pointer;
					}

					.disable-btn:active {
						background: var(--bg-secondary);
					}
				`}</style>
			</div>
		);
	}

	if (variant === 'switch') {
		return (
			<div className="data-saver-switch">
				<div className="switch-info">
					<span className="switch-label">{t('dataSaver')}</span>
					{showLabel && (
						<span className="switch-description">{t('reduceAnimationsDataUsage')}</span>
					)}
				</div>
				<button
					className={`switch ${isEnabled ? 'on' : 'off'}`}
					onClick={toggle}
					aria-pressed={isEnabled}
					aria-label={t('toggleDataSaverMode')}
					type="button"
				>
					<span className="switch-thumb" />
				</button>
				<style jsx>{`
					.data-saver-switch {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 16px;
						padding: 16px;
						background: var(--bg-primary);
						border: 1px solid var(--border-color);
						border-radius: var(--radius-md);
					}

					.switch-info {
						display: flex;
						flex-direction: column;
						gap: 4px;
					}

					.switch-label {
						font-weight: 600;
						color: var(--text-primary);
					}

					.switch-description {
						font-size: 0.75rem;
						color: var(--text-muted);
					}

					.switch {
						width: 48px;
						height: 28px;
						background: var(--bg-tertiary);
						border: none;
						border-radius: 14px;
						position: relative;
						cursor: pointer;
						padding: 0;
						transition: background 0.2s ease;
					}

					.switch.on {
						background: var(--accent-primary);
					}

					.switch-thumb {
						position: absolute;
						top: 2px;
						left: 2px;
						width: 24px;
						height: 24px;
						background: white;
						border-radius: 50%;
						transition: transform 0.2s ease;
						box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
					}

					.switch.on .switch-thumb {
						transform: translateX(20px);
					}

					/* Reduced motion */
					@media (prefers-reduced-motion: reduce) {
						.switch,
						.switch-thumb {
							transition: none;
						}
					}
				`}</style>
			</div>
		);
	}

	// Default button variant
	return (
		<button
			className={`data-saver-btn ${isEnabled ? 'active' : ''}`}
			onClick={toggle}
			aria-pressed={isEnabled}
			aria-label={t('toggleDataSaverMode')}
			type="button"
		>
			<Icon name={isEnabled ? 'wifiOff' : 'wifi'} size={18} />
			{showLabel && (
				<span>{`${t('dataSaver')} ${isEnabled ? t('on') : t('off')}`}</span>
			)}
			<style jsx>{`
				.data-saver-btn {
					display: inline-flex;
					align-items: center;
					gap: 8px;
					padding: 8px 16px;
					background: var(--bg-tertiary);
					border: 1px solid var(--border-color);
					border-radius: var(--radius-md);
					font-size: 0.875rem;
					font-weight: 500;
					color: var(--text-secondary);
					cursor: pointer;
					transition: all 0.15s ease;
				}

				.data-saver-btn.active {
					background: var(--accent-primary);
					color: white;
					border-color: var(--accent-primary);
				}

				.data-saver-btn:active {
					transform: scale(0.98);
				}
			`}</style>
		</button>
	);
}
