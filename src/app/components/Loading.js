'use client';

import OptimizedLoading from './OptimizedLoading';

/**
 * Loading Component
 * Wrapper around OptimizedLoading for backward compatibility
 */
export default function Loading(props) {
	return <OptimizedLoading {...props} />;
}
