'use client';

import { useEffect, useState } from 'react';
import useLocalStorage from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';
import {
	findCachedTestRecord,
	hydrateTestRecordFromApiResponse,
} from '../utils/testRecord';

export default function useResolvedTestRecord(
	testId,
	{
		notFoundKey = 'testNotFound',
		loadFailedKey = 'failedToLoadTest',
		includeErrorDetails = true,
	} = {},
) {
	const { t } = useLanguage();
	const [testHistory, _, updateHistory, __, isHistoryHydrated] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const [questionPaper, setQuestionPaper] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!isHistoryHydrated) return undefined;

		if (!testId) {
			setQuestionPaper(null);
			setError(t(notFoundKey));
			setLoading(false);
			return undefined;
		}

		const cachedTest = findCachedTestRecord(testHistory, testId);
		if (cachedTest) {
			setQuestionPaper(cachedTest);
			setError(null);
			setLoading(false);
			return undefined;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		const loadFromApi = async () => {
			try {
				const response = await fetch(`/api/test?id=${encodeURIComponent(testId)}`);
				const data = await response.json().catch(() => ({}));

				if (cancelled) return;

				if (!response.ok || data.error || !data.test) {
					setQuestionPaper(null);
					setError(data.error || t(notFoundKey));
					setLoading(false);
					return;
				}

				const hydratedPaper = hydrateTestRecordFromApiResponse(data);
				if (!hydratedPaper) {
					setQuestionPaper(null);
					setError(t(notFoundKey));
					setLoading(false);
					return;
				}

				updateHistory(hydratedPaper);
				setQuestionPaper(hydratedPaper);
				setError(null);
				setLoading(false);
			} catch (fetchError) {
				if (cancelled) return;
				setQuestionPaper(null);
				setError(
					includeErrorDetails
						? `${t(loadFailedKey)} ${fetchError.message}`
						: t(loadFailedKey),
				);
				setLoading(false);
			}
		};

		loadFromApi();

		return () => {
			cancelled = true;
		};
	}, [
		isHistoryHydrated,
		includeErrorDetails,
		loadFailedKey,
		notFoundKey,
		t,
		testHistory,
		testId,
		updateHistory,
	]);

	return {
		testHistory,
		updateHistory,
		questionPaper,
		setQuestionPaper,
		loading,
		error,
		isHistoryHydrated,
	};
}
