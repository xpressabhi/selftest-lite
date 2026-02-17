import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to manage localStorage with React state synchronization.
 * @param {string} key - The key to store the value under in localStorage.
 * @param {*} initialValue - The initial value to use if the key does not exist in localStorage.
 * @returns {[any, Function]} - Returns the current value and a setter function.
 */
function useLocalStorage(key, initialValue) {
	const initialValueRef = useRef(initialValue);
	useEffect(() => {
		initialValueRef.current = initialValue;
	}, [initialValue]);

	const getInitialValue = useCallback(() => {
		const value = initialValueRef.current;
		return typeof value === 'function' ? value() : value;
	}, []);

	// Keep first render deterministic between SSR and hydration.
	const [storedValue, setStoredValue] = useState(() => getInitialValue());
	const [hydratedKey, setHydratedKey] = useState(null);
	const isHydrated = hydratedKey === key;

	// Read storage after mount/key change.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			const item = window.localStorage.getItem(key);
			setStoredValue(item ? JSON.parse(item) : getInitialValue());
		} catch (error) {
			console.error('Error reading localStorage key', key, error);
			setStoredValue(getInitialValue());
		} finally {
			setHydratedKey(key);
		}
	}, [key, getInitialValue]);

	// Write only after current key has been hydrated from storage.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (hydratedKey !== key) return;
		try {
			window.localStorage.setItem(key, JSON.stringify(storedValue));
		} catch (error) {
			console.error('Error setting localStorage key', key, error);
		}
	}, [key, storedValue, hydratedKey]);

	// Listen for changes in localStorage from other tabs or windows
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const handleStorageChange = (event) => {
			if (event.key === key) {
				try {
					setStoredValue(
						event.newValue ? JSON.parse(event.newValue) : getInitialValue(),
					);
				} catch (error) {
					console.error('Error parsing localStorage key', key, error);
				}
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => {
			window.removeEventListener('storage', handleStorageChange);
		};
	}, [key, getInitialValue]);

	const updateHistory = (updatedPaper) => {
		setStoredValue((prevStoredValue) => {
			const safeHistory = Array.isArray(prevStoredValue) ? prevStoredValue : [];
			const updatedHistory = safeHistory.filter((t) => t.id !== updatedPaper.id);
			updatedHistory.unshift({
				...updatedPaper,
				timestamp: Date.now(),
			});
			return updatedHistory
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, 100);
		});
	};
	const cleanUpKey = () => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.removeItem(key);
		} catch (error) {
			console.error('Error removing localStorage key', key, error);
		}
	};

	return [storedValue, setStoredValue, updateHistory, cleanUpKey, isHydrated];
}

export default useLocalStorage;
