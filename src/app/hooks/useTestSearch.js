'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function useTestSearch({ isDataSaverActive = false } = {}) {
	const { t } = useLanguage();
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [searchLanguageFilter, setSearchLanguageFilter] = useState('all');
	const [searchExamTypeFilter, setSearchExamTypeFilter] = useState('all');
	const [searchResults, setSearchResults] = useState([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [searchError, setSearchError] = useState('');
	const searchAbortRef = useRef(null);

	const fetchTests = useCallback(
		async (query = '', languageFilter = 'all', examTypeFilter = 'all') => {
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
				if (languageFilter !== 'all') {
					params.set('language', languageFilter);
				}
				if (examTypeFilter !== 'all') {
					params.set('examType', examTypeFilter);
				}

				const response = await fetch(`/api/test?${params.toString()}`, {
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(t('failedToFetchTests'));
				}

				const data = await response.json();
				setSearchResults(Array.isArray(data.tests) ? data.tests : []);
			} catch (error) {
				if (error.name !== 'AbortError') {
					setSearchError(t('unableLoadTests'));
					setSearchResults([]);
				}
			} finally {
				if (!controller.signal.aborted) {
					setSearchLoading(false);
				}
			}
		},
		[isDataSaverActive, t],
	);

	useEffect(() => {
		if (!isSearchOpen) return;

		const delay = searchQuery.trim() ? 250 : 0;
		const timer = setTimeout(() => {
			fetchTests(searchQuery, searchLanguageFilter, searchExamTypeFilter);
		}, delay);

		return () => clearTimeout(timer);
	}, [
		isSearchOpen,
		searchQuery,
		searchLanguageFilter,
		searchExamTypeFilter,
		fetchTests,
	]);

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
		setSearchLanguageFilter('all');
		setSearchExamTypeFilter('all');
		setSearchError('');
	};

	const closeSearch = () => {
		setIsSearchOpen(false);
	};

	return {
		isSearchOpen,
		searchQuery,
		searchLanguageFilter,
		searchExamTypeFilter,
		searchResults,
		searchLoading,
		searchError,
		setSearchQuery,
		setSearchLanguageFilter,
		setSearchExamTypeFilter,
		openSearch,
		closeSearch,
	};
}
