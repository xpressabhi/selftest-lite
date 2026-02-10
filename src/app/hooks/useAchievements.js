'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useLocalStorage from './useLocalStorage';
import { STORAGE_KEYS } from '../constants';

const ACHIEVEMENTS_KEY = 'selftest_achievements';

/**
 * Achievement definitions
 * Each achievement has: id, title, description, icon (emoji), condition checker
 */
const ACHIEVEMENT_DEFS = [
    {
        id: 'first_quiz',
        title: 'First Steps',
        description: 'Complete your first quiz',
        icon: '🎯',
        category: 'milestones',
        check: (stats) => stats.totalQuizzes >= 1,
    },
    {
        id: 'five_quizzes',
        title: 'Getting Serious',
        description: 'Complete 5 quizzes',
        icon: '📚',
        category: 'milestones',
        check: (stats) => stats.totalQuizzes >= 5,
    },
    {
        id: 'ten_quizzes',
        title: 'Quiz Master',
        description: 'Complete 10 quizzes',
        icon: '🏅',
        category: 'milestones',
        check: (stats) => stats.totalQuizzes >= 10,
    },
    {
        id: 'twenty_five_quizzes',
        title: 'Knowledge Seeker',
        description: 'Complete 25 quizzes',
        icon: '🧠',
        category: 'milestones',
        check: (stats) => stats.totalQuizzes >= 25,
    },
    {
        id: 'fifty_quizzes',
        title: 'Unstoppable',
        description: 'Complete 50 quizzes',
        icon: '🚀',
        category: 'milestones',
        check: (stats) => stats.totalQuizzes >= 50,
    },
    {
        id: 'perfect_score',
        title: 'Perfectionist',
        description: 'Get a perfect 100% score',
        icon: '💯',
        category: 'performance',
        check: (stats) => stats.hasPerfectScore,
    },
    {
        id: 'three_perfects',
        title: 'Flawless',
        description: 'Get 3 perfect scores',
        icon: '✨',
        category: 'performance',
        check: (stats) => stats.perfectScoreCount >= 3,
    },
    {
        id: 'streak_3',
        title: 'On Fire',
        description: 'Reach a 3-day streak',
        icon: '🔥',
        category: 'streaks',
        check: (stats) => stats.longestStreak >= 3,
    },
    {
        id: 'streak_7',
        title: 'Week Warrior',
        description: 'Reach a 7-day streak',
        icon: '⚡',
        category: 'streaks',
        check: (stats) => stats.longestStreak >= 7,
    },
    {
        id: 'streak_30',
        title: 'Monthly Legend',
        description: 'Reach a 30-day streak',
        icon: '👑',
        category: 'streaks',
        check: (stats) => stats.longestStreak >= 30,
    },
    {
        id: 'speed_demon',
        title: 'Speed Demon',
        description: 'Complete a quiz in under 60 seconds',
        icon: '⚡',
        category: 'special',
        check: (stats) => stats.fastestQuiz !== null && stats.fastestQuiz < 60,
    },
    {
        id: 'night_owl',
        title: 'Night Owl',
        description: 'Complete a quiz after midnight',
        icon: '🦉',
        category: 'special',
        check: (stats) => stats.hasNightQuiz,
    },
    {
        id: 'early_bird',
        title: 'Early Bird',
        description: 'Complete a quiz before 7am',
        icon: '🐦',
        category: 'special',
        check: (stats) => stats.hasEarlyQuiz,
    },
    {
        id: 'bookworm',
        title: 'Bookworm',
        description: 'Bookmark 10 questions',
        icon: '📖',
        category: 'special',
        check: (stats) => stats.bookmarkCount >= 10,
    },
    {
        id: 'five_topics',
        title: 'Renaissance',
        description: 'Take quizzes on 5 different topics',
        icon: '🎨',
        category: 'special',
        check: (stats) => stats.uniqueTopics >= 5,
    },
    {
        id: 'hundred_questions',
        title: 'Centurion',
        description: 'Answer 100 questions total',
        icon: '💪',
        category: 'milestones',
        check: (stats) => stats.totalQuestions >= 100,
    },
];

/**
 * Achievement Badge Hook
 * Tracks unlocked achievements based on quiz history and streak data
 */
export default function useAchievements(streakData = {}) {
    const [unlockedIds, setUnlockedIds] = useLocalStorage(ACHIEVEMENTS_KEY, []);
    const [testHistory] = useLocalStorage(STORAGE_KEYS.TEST_HISTORY, []);
    const [newlyUnlocked, setNewlyUnlocked] = useState([]);

    // Compute stats from test history
    const stats = useMemo(() => {
        const completedTests = testHistory.filter((t) => t.userAnswers);
        const totalQuizzes = completedTests.length;
        const totalQuestions = completedTests.reduce(
            (acc, t) => acc + (t.totalQuestions || 0),
            0,
        );
        const perfectScoreCount = completedTests.filter(
            (t) => t.score === t.totalQuestions,
        ).length;
        const hasPerfectScore = perfectScoreCount > 0;
        const fastestQuiz = completedTests.reduce((min, t) => {
            if (t.timeTaken && (min === null || t.timeTaken < min)) return t.timeTaken;
            return min;
        }, null);

        // Time-based badges
        let hasNightQuiz = false;
        let hasEarlyQuiz = false;
        completedTests.forEach((t) => {
            if (t.timestamp) {
                const hour = new Date(t.timestamp).getHours();
                if (hour >= 0 && hour < 5) hasNightQuiz = true;
                if (hour >= 4 && hour < 7) hasEarlyQuiz = true;
            }
        });

        // Unique topics
        const topics = new Set(completedTests.map((t) => t.topic).filter(Boolean));

        // Bookmark count from localStorage
        let bookmarkCount = 0;
        if (typeof window !== 'undefined') {
            try {
                const bookmarks = JSON.parse(localStorage.getItem('selftest_bookmarks') || '[]');
                bookmarkCount = bookmarks.length;
            } catch (e) { /* ignore */ }
        }

        return {
            totalQuizzes,
            totalQuestions,
            hasPerfectScore,
            perfectScoreCount,
            fastestQuiz,
            hasNightQuiz,
            hasEarlyQuiz,
            uniqueTopics: topics.size,
            bookmarkCount,
            longestStreak: streakData.longestStreak || 0,
        };
    }, [testHistory, streakData.longestStreak]);

    /**
     * Check for newly unlocked achievements
     * Call this after quiz completion
     */
    const checkAchievements = useCallback(() => {
        const newUnlocks = [];

        ACHIEVEMENT_DEFS.forEach((def) => {
            if (!unlockedIds.includes(def.id) && def.check(stats)) {
                newUnlocks.push(def);
            }
        });

        if (newUnlocks.length > 0) {
            const newIds = newUnlocks.map((a) => a.id);
            setUnlockedIds([...unlockedIds, ...newIds]);
            setNewlyUnlocked(newUnlocks);
        }

        return newUnlocks;
    }, [unlockedIds, stats, setUnlockedIds]);

    // All achievements with their unlock status
    const allAchievements = useMemo(() => {
        return ACHIEVEMENT_DEFS.map((def) => ({
            ...def,
            unlocked: unlockedIds.includes(def.id),
        }));
    }, [unlockedIds]);

    const unlockedCount = unlockedIds.length;
    const totalCount = ACHIEVEMENT_DEFS.length;
    const progress = Math.round((unlockedCount / totalCount) * 100);

    const clearNewlyUnlocked = useCallback(() => {
        setNewlyUnlocked([]);
    }, []);

    return {
        allAchievements,
        unlockedCount,
        totalCount,
        progress,
        newlyUnlocked,
        checkAchievements,
        clearNewlyUnlocked,
        stats,
    };
}

// Export definitions for use in UI
export { ACHIEVEMENT_DEFS };
