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
		try {
			window.localStorage.setItem(key, JSON.stringify(storedValue));
		} catch (error) {
			console.error('Error setting localStorage key', key, error);
		}
	}, [key, storedValue]);

	return [storedValue, setStoredValue];
}

export default useLocalStorage;
