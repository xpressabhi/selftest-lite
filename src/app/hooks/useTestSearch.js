'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export default function useTestSearch({ isDataSaverActive = false } = {}) {
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchError, setSearchError] = useState('');
	const searchAbortRef = useRef(null);

	const fetchTests = useCallback(
		async (query = '') => {
			if (searchAbortRef.current) {
				searchAbortRef.current.abort();
			}

			const controller = new AbortController();
			searchAbortRef.current = controller;

			const trimmed = query.trim();
			const limit = trimmed
				? isDataSaverActive
					? 5
					: 10
				: isDataSaverActive
					? 4
					: 5;

			try {
				setSearchLoading(true);
				setSearchError('');

				const params = new URLSearchParams({
					limit: String(limit),
				});
				if (trimmed) {
					params.set('q', trimmed);
				}

				const response = await fetch(`/api/test?${params.toString()}`, {
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error('Failed to fetch tests');
				}

				const data = await response.json();
				setSearchResults(Array.isArray(data.tests) ? data.tests : []);
			} catch (error) {
				if (error.name !== 'AbortError') {
					setSearchError('Unable to load tests right now.');
					setSearchResults([]);
				}
			} finally {
				if (!controller.signal.aborted) {
					setSearchLoading(false);
				}
			}
		},
		[isDataSaverActive],
	);

	useEffect(() => {
		if (!isSearchOpen) return;

		const delay = searchQuery.trim() ? 250 : 0;
		const timer = setTimeout(() => {
			fetchTests(searchQuery);
		}, delay);

		return () => clearTimeout(timer);
	}, [isSearchOpen, searchQuery, fetchTests]);

	useEffect(() => {
		return () => {
			if (searchAbortRef.current) {
				searchAbortRef.current.abort();
			}
		};
	}, []);

	const openSearch = () => {
		setIsSearchOpen(true);
		setSearchQuery('');
		setSearchError('');
	};

	const closeSearch = () => {
		setIsSearchOpen(false);
	};

	return {
		isSearchOpen,
		searchQuery,
		searchResults,
		searchLoading,
		searchError,
		setSearchQuery,
		openSearch,
		closeSearch,
	};
}
