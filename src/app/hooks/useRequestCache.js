'use client';

import { useCallback, useRef } from 'react';

/**
 * Hook for caching API requests
 * Useful for slow connections to avoid repeated requests
 *
 * @param {Object} options
 * @param {number} options.ttl - Time to live in milliseconds (default: 5 minutes)
 * @returns {Object} - { getCached, setCached, clearCache }
 */
export default function useRequestCache(options = {}) {
	const { ttl = 5 * 60 * 1000 } = options; // Default 5 minutes
	const cacheRef = useRef(new Map());

	const getCached = useCallback((key) => {
		const cached = cacheRef.current.get(key);
		if (!cached) return null;

		const { data, timestamp } = cached;
		if (Date.now() - timestamp > ttl) {
			cacheRef.current.delete(key);
			return null;
		}

		return data;
	}, [ttl]);

	const setCached = useCallback((key, data) => {
		cacheRef.current.set(key, {
			data,
			timestamp: Date.now(),
		});
	}, []);

	const clearCache = useCallback(() => {
		cacheRef.current.clear();
	}, []);

	const clearExpired = useCallback(() => {
		const now = Date.now();
		for (const [key, { timestamp }] of cacheRef.current.entries()) {
			if (now - timestamp > ttl) {
				cacheRef.current.delete(key);
			}
		}
	}, [ttl]);

	return {
		getCached,
		setCached,
		clearCache,
		clearExpired,
	};
}
