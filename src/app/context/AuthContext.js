'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [isAuthLoading, setIsAuthLoading] = useState(true);

	const refreshSession = useCallback(async () => {
		setIsAuthLoading(true);
		try {
			const response = await fetch('/api/auth/me', {
				method: 'GET',
				cache: 'no-store',
			});

			if (!response.ok) {
				setUser(null);
				return null;
			}

			const data = await response.json();
			const resolvedUser = data?.user || null;
			setUser(resolvedUser);
			return resolvedUser;
		} catch (error) {
			console.error('Failed to refresh auth session:', error);
			setUser(null);
			return null;
		} finally {
			setIsAuthLoading(false);
		}
	}, []);

	useEffect(() => {
		refreshSession();
	}, [refreshSession]);

	const loginWithGoogleCredential = useCallback(async (credential) => {
		const response = await fetch('/api/auth/google', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ credential }),
		});

		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(data?.error || 'Google sign-in failed');
		}

		const resolvedUser = data?.user || null;
		setUser(resolvedUser);
		return resolvedUser;
	}, []);

	const logout = useCallback(async () => {
		try {
			await fetch('/api/auth/logout', {
				method: 'POST',
			});
		} catch (error) {
			console.error('Failed to call logout endpoint:', error);
		} finally {
			if (
				typeof window !== 'undefined' &&
				window.google?.accounts?.id?.disableAutoSelect
			) {
				window.google.accounts.id.disableAutoSelect();
			}
			setUser(null);
		}
	}, []);

	const value = useMemo(
		() => ({
			user,
			isAuthenticated: Boolean(user),
			isAuthLoading,
			refreshSession,
			loginWithGoogleCredential,
			logout,
		}),
		[user, isAuthLoading, refreshSession, loginWithGoogleCredential, logout],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within AuthProvider');
	}
	return context;
}
