'use client';

import React from 'react';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * Essential for mobile/low-end devices where errors are more common
 */
class ErrorBoundaryImpl extends React.Component {
	constructor(props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error) {
		return { hasError: true, error };
	}

	componentDidCatch(error, errorInfo) {
		// Log error details in development
		if (process.env.NODE_ENV === 'development') {
			console.error('Error caught by boundary:', error);
			console.error('Component stack:', errorInfo.componentStack);
		}

		// Report to analytics if available
		if (typeof window !== 'undefined' && window.gtag) {
			window.gtag('event', 'exception', {
				description: error?.message || 'Unknown error',
				fatal: false,
			});
		}
	}

	handleReload = () => {
		window.location.reload();
	};

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		const { t } = this.props;
		if (this.state.hasError) {
			return (
				<div className="error-boundary">
					<div className="error-content">
						<div className="error-icon">
							<Icon name="exclamationCircle" size={48} />
						</div>
						<h2 className="error-title">{t('somethingWentWrong')}</h2>
						<p className="error-message">
							{t('errorBoundaryMessage')}
						</p>
						<div className="error-actions">
							{this.props.onReset && (
								<button
									className="btn btn-secondary"
									onClick={this.handleReset}
									type="button"
								>
									{t('tryAgain')}
								</button>
								)}
							<button
								className="btn btn-primary"
								onClick={this.handleReload}
								type="button"
							>
								{t('reloadPage')}
							</button>
						</div>
						{process.env.NODE_ENV === 'development' && this.state.error && (
							<details className="error-details">
								<summary>{t('errorDetailsDevOnly')}</summary>
								<pre>{this.state.error.stack}</pre>
							</details>
						)}
					</div>
					<style jsx>{`
							.error-boundary {
								min-height: 100vh;
								min-height: 100dvh;
								min-height: var(--app-viewport-height, 100dvh);
								display: flex;
							align-items: center;
							justify-content: center;
							padding: 24px;
							background: var(--bg-secondary);
						}

						.error-content {
							text-align: center;
							max-width: 400px;
						}

						.error-icon {
							color: var(--accent-danger);
							margin-bottom: 16px;
						}

						.error-title {
							font-size: 1.5rem;
							font-weight: 700;
							color: var(--text-primary);
							margin: 0 0 8px;
						}

						.error-message {
							color: var(--text-secondary);
							margin: 0 0 24px;
						}

						.error-actions {
							display: flex;
							gap: 12px;
							justify-content: center;
							flex-wrap: wrap;
						}

						.btn {
							padding: 12px 24px;
							border-radius: var(--radius-md);
							font-weight: 600;
							border: none;
							cursor: pointer;
							transition: all 0.15s ease;
							min-height: 48px;
						}

						.btn-primary {
							background: var(--accent-primary);
							color: white;
						}

						.btn-secondary {
							background: var(--bg-tertiary);
							color: var(--text-primary);
						}

						.error-details {
							margin-top: 24px;
							text-align: left;
							color: var(--text-muted);
							font-size: 0.875rem;
						}

						.error-details pre {
							background: var(--bg-tertiary);
							padding: 16px;
							border-radius: var(--radius-md);
							overflow-x: auto;
							font-size: 0.75rem;
							margin-top: 8px;
						}

						/* Data saver mode */
						.data-saver .btn-primary {
							background: var(--accent-primary);
						}
					`}</style>
				</div>
			);
		}

		return this.props.children;
	}
}

export default function ErrorBoundary(props) {
	const { t } = useLanguage();
	return <ErrorBoundaryImpl {...props} t={t} />;
}
