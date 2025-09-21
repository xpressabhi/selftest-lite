export function getLocalStorage(key, initialValue) {
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
}

export function setLocalStorage(key, value) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error setting localStorage key', key, error);
    }
}

export function updateHistory(key, updatedPaper) {
    const history = getLocalStorage(key, []);
    const updatedHistory = history.filter((t) => t.id !== updatedPaper.id);
    updatedHistory.unshift({
        ...updatedPaper,
        timestamp: Date.now(),
    });
    setLocalStorage(key, updatedHistory.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100));
}

export function cleanUpKey(key) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.error('Error removing localStorage key', key, error);
    }
}
