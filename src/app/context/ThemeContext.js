'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        // Check for saved theme or system preference
        const savedTheme = localStorage.getItem('selftest_theme');
        if (savedTheme) {
            setTheme(savedTheme);
        } else if (
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
            setTheme('dark');
        }
    }, []);

    useEffect(() => {
        // Apply theme to body
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('selftest_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
