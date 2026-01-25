'use client';

import useLocalStorage from './useLocalStorage';

const STORAGE_KEY = 'selftest_bookmarks';

export default function useBookmarks() {
    const [bookmarks, setBookmarks] = useLocalStorage(STORAGE_KEY, []);

    const isBookmarked = (question) => {
        // Identify by question text + answer to be reasonably unique
        // Ideally we'd have IDs, but generated questions might not have persistent IDs across sessions if not from DB
        return bookmarks.some(
            (b) => b.question === question.question && b.answer === question.answer,
        );
    };

    const toggleBookmark = (question) => {
        if (isBookmarked(question)) {
            // Remove
            setBookmarks(
                bookmarks.filter(
                    (b) =>
                        b.question !== question.question || b.answer !== question.answer,
                ),
            );
        } else {
            // Add
            setBookmarks([
                ...bookmarks,
                {
                    ...question,
                    bookmarkedAt: Date.now(),
                },
            ]);
        }
    };

    const removeBookmark = (question) => {
        setBookmarks(
            bookmarks.filter(
                (b) => b.question !== question.question || b.answer !== question.answer,
            ),
        );
    };

    return {
        bookmarks,
        isBookmarked,
        toggleBookmark,
        removeBookmark,
    };
}
