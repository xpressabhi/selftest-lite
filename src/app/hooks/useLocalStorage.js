import { useState, useEffect } from 'react';

/**
 * Custom hook to manage localStorage with React state synchronization.
 * @param {string} key - The key to store the value under in localStorage.
 * @param {*} initialValue - The initial value to use if the key does not exist in localStorage.
 * @returns {[any, Function]} - Returns the current value and a setter function.
 */
function useLocalStorage(key, initialValue) {
	// State to store the current value
	const [storedValue, setStoredValue] = useState(() => {
		if (typeof window === 'undefined') {
			return initialValue;
		}
		try {
			const item = window.localStorage.getItem(key);
			return item ? JSON.parse(item) : initialValue;
		} catch (error) {
			console.error('Error reading localStorage key', key, error);
			return initialValue;
		}
	});

	// Update localStorage whenever the state changes
	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(key, JSON.stringify(storedValue));
		} catch (error) {
			console.error('Error setting localStorage key', key, error);
		}
	}, [key, storedValue]);

	// Listen for changes in localStorage from other tabs or windows
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const handleStorageChange = (event) => {
			if (event.key === key) {
				try {
					setStoredValue(
						event.newValue ? JSON.parse(event.newValue) : initialValue,
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
	}, [key, initialValue]);

	const updateHistory = (updatedPaper) => {
		const updatedHistory = storedValue.filter((t) => t.id !== updatedPaper.id);
		updatedHistory.unshift({
			...updatedPaper,
			timestamp: Date.now(),
		});
		setStoredValue(
			updatedHistory.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100),
		); // keep only latest 20 entries
	};

	return [storedValue, setStoredValue, updateHistory];
}

export default useLocalStorage;
