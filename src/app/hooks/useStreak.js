'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useLocalStorage from './useLocalStorage';

const STREAK_KEY = 'selftest_streak';

/**
 * Daily Streak Hook
 * Tracks consecutive days of quiz activity with streak freezes
 * Data shape:
 *   { currentStreak, longestStreak, lastActiveDate, freezesRemaining, streakHistory[] }
 */
export default function useStreak() {
    const [streakData, setStreakData] = useLocalStorage(STREAK_KEY, {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        freezesRemaining: 1,
        streakHistory: [], // Array of { date, quizCount }
        totalQuizDays: 0,
    });

    const [justExtended, setJustExtended] = useState(false);

    // Get today's date string (YYYY-MM-DD) in local timezone
    const getToday = useCallback(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }, []);

    // Get yesterday's date string
    const getYesterday = useCallback(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    // Get 2 days ago date string (for freeze check)
    const getTwoDaysAgo = useCallback(() => {
        const d = new Date();
        d.setDate(d.getDate() - 2);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    // Check and update the streak on mount (handles gap detection)
    useEffect(() => {
        if (!streakData.lastActiveDate) return;

        const today = getToday();
        const yesterday = getYesterday();
        const twoDaysAgo = getTwoDaysAgo();
        const lastActive = streakData.lastActiveDate;

        // If last active was today, nothing to do
        if (lastActive === today) return;

        // If last active was yesterday, streak is still alive (will extend on next quiz)
        if (lastActive === yesterday) return;

        // If last active was 2 days ago AND we have a freeze, use it
        if (lastActive === twoDaysAgo && streakData.freezesRemaining > 0) {
            setStreakData({
                ...streakData,
                freezesRemaining: streakData.freezesRemaining - 1,
                // Don't reset streak, freeze protects it
            });
            return;
        }

        // Streak broken — reset
        if (lastActive !== today && lastActive !== yesterday) {
            setStreakData({
                ...streakData,
                currentStreak: 0,
                // Keep longest streak
            });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Record quiz activity for today.
     * Returns true if streak was extended (new day).
     */
    const recordActivity = useCallback(() => {
        const today = getToday();
        const yesterday = getYesterday();

        setStreakData((prev) => {
            const wasToday = prev.lastActiveDate === today;
            const wasYesterday = prev.lastActiveDate === yesterday;

            let newStreak = prev.currentStreak;

            if (wasToday) {
                // Already active today — just update history count
                const history = [...prev.streakHistory];
                const todayEntry = history.find((h) => h.date === today);
                if (todayEntry) {
                    todayEntry.quizCount += 1;
                }
                return {
                    ...prev,
                    streakHistory: history,
                };
            }

            if (wasYesterday || prev.currentStreak === 0) {
                // Extend streak (or start fresh)
                newStreak = wasYesterday ? prev.currentStreak + 1 : 1;
            } else {
                // Gap detected, start fresh
                newStreak = 1;
            }

            const newLongest = Math.max(newStreak, prev.longestStreak);

            // Add today to history
            const history = [
                ...prev.streakHistory,
                { date: today, quizCount: 1 },
            ].slice(-90); // Keep last 90 days

            setJustExtended(!wasToday);

            // Earn a freeze every 7 days of streak (max 3)
            let freezes = prev.freezesRemaining;
            if (newStreak > 0 && newStreak % 7 === 0) {
                freezes = Math.min(3, freezes + 1);
            }

            return {
                currentStreak: newStreak,
                longestStreak: newLongest,
                lastActiveDate: today,
                freezesRemaining: freezes,
                streakHistory: history,
                totalQuizDays: (prev.totalQuizDays || 0) + (wasToday ? 0 : 1),
            };
        });

        return !streakData.lastActiveDate || streakData.lastActiveDate !== today;
    }, [getToday, getYesterday, setStreakData, streakData.lastActiveDate]);

    // Was user active today?
    const isActiveToday = useMemo(() => {
        return streakData.lastActiveDate === getToday();
    }, [streakData.lastActiveDate, getToday]);

    // Is streak at risk (not active today, but was yesterday)?
    const isAtRisk = useMemo(() => {
        return !isActiveToday && streakData.currentStreak > 0;
    }, [isActiveToday, streakData.currentStreak]);

    // Get the last 7 days of activity (for mini chart)
    const weekActivity = useMemo(() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const entry = streakData.streakHistory?.find((h) => h.date === dateStr);
            days.push({
                date: dateStr,
                dayName: dayNames[d.getDay()],
                active: !!entry,
                quizCount: entry?.quizCount || 0,
                isToday: i === 0,
            });
        }
        return days;
    }, [streakData.streakHistory]);

    return {
        currentStreak: streakData.currentStreak,
        longestStreak: streakData.longestStreak,
        freezesRemaining: streakData.freezesRemaining,
        totalQuizDays: streakData.totalQuizDays || 0,
        isActiveToday,
        isAtRisk,
        weekActivity,
        justExtended,
        recordActivity,
        clearJustExtended: () => setJustExtended(false),
    };
}
