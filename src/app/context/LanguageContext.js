'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';

const LanguageContext = createContext();
const LANGUAGE_KEY = 'selftest_language';
const SUPPORTED_LANGUAGES = ['english', 'hindi'];

const getSystemLanguage = () => {
	if (typeof navigator === 'undefined') return 'english';
	const locales = navigator.languages && navigator.languages.length > 0
		? navigator.languages
		: [navigator.language || 'en'];
	const locale = locales[0]?.toLowerCase() || 'en';
	return locale.startsWith('hi') ? 'hindi' : 'english';
};

const getInitialLanguage = () => {
	if (typeof window === 'undefined') return 'english';
	const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
	if (SUPPORTED_LANGUAGES.includes(savedLanguage)) {
		return savedLanguage;
	}
	return getSystemLanguage();
};

const translations = {
    english: {
        createQuiz: 'Create Personalized Quiz',
        createQuizSubtitle: 'Create your quiz and test yourself',
        enterTestId: 'Enter Test ID',
        go: 'Go',
        haveTestId: 'Have a Test ID? Enter here',
        or: 'OR',
        whatToLearn: 'What do you want to learn today?',
        placeholderTopic: 'e.g., "Organic Chemistry Class 12", "History of Ancient India", or "Python Programming Basics"',
        moreOptions: 'More options',
        hideOptions: 'Hide options',
        generateQuiz: 'Generate Quiz',
        generating: 'Generating...',
        proTip: 'Pro Tip',
        proTipContent: 'Be specific for better results. Try "Class 10 Math Quadratic Equations" instead of just "Math".',
        testResults: 'Test Results',
        score: 'Score',
        reviewAnswers: 'Review Answers',
        startNewQuiz: 'Start New Quiz',
        similarQuiz: 'Similar Quiz',
        submitTest: 'Submit Test',
        submitTestConfirm: 'Submit Test?',
        submitTestBody: 'You are about to submit your test.',
        answeredCount: 'You have answered',
        outOf: 'out of',
        questions: 'questions',
        unansweredWarning: 'You have',
        unansweredQuestions: 'unanswered questions',
        backToTest: 'Back to Test',
        submitNow: 'Submit Now',
        question: 'Question',
        of: 'of',
        explanation: 'Explanation',
        explainAnswer: 'Explain Answer?',
        loading: 'Loading...',
        noTestFound: 'No test found!',
        pleaseGenerate: 'Please generate a new test.',
        home: 'Go to Home',
        correct: 'Correct',
        incorrect: 'Incorrect',
        skipped: 'Skipped',
        yourAnswer: 'Your Answer',
        correctAnswer: 'Correct Answer',
        excellent: 'Excellent!',
        keepPracticing: 'Keep Practicing!',
        goodJob: 'Good Job!',
        performanceText: "Here's how you performed",
        testNotFound: 'Test not found',
        failedToGenerateQuiz: 'Failed to generate quiz. Please try again.',
        notAnswered: 'Not Answered',
        correctAnswerIs: 'The correct answer is',
    },
    hindi: {
        createQuiz: 'अपना पर्सनलाइज़्ड क्विज़ बनाएं',
        createQuizSubtitle: 'अपना क्विज़ बनाएं और खुद को टेस्ट करें',
        enterTestId: 'टेस्ट आईडी डालें',
        go: 'आगे बढ़ें',
        haveTestId: 'अगर आपके पास टेस्ट आईडी है तो यहाँ डालें',
        or: 'या',
        whatToLearn: 'आज आप क्या सीखना चाहते हैं?',
        placeholderTopic: 'जैसे, "कक्षा 12 कार्बनिक रसायन विज्ञान", "प्राचीन भारत का इतिहास", या "पायथन प्रोग्रामिंग बेसिक्स"',
        moreOptions: 'अधिक विकल्प',
        hideOptions: 'विकल्प छिपाएं',
        generateQuiz: 'क्विज़ बनाएं',
        generating: 'बना रहे हैं...',
        proTip: 'प्रो टिप',
        proTipContent: 'बेहतर परिणामों के लिए विशिष्ट बनें। केवल "गणित" के बजाय "कक्षा 10 गणित द्विघात समीकरण" आज़माएं।',
        testResults: 'टेस्ट परिणाम',
        score: 'स्कोर',
        reviewAnswers: 'उत्तरों की समीक्षा करें',
        startNewQuiz: 'नया क्विज़ शुरू करें',
        similarQuiz: 'समान क्विज़',
        submitTest: 'टेस्ट जमा करें',
        submitTestConfirm: 'टेस्ट जमा करें?',
        submitTestBody: 'आप अपना टेस्ट जमा करने वाले हैं।',
        answeredCount: 'आपने',
        outOf: 'में से',
        questions: 'प्रश्नों का उत्तर दिया है',
        unansweredWarning: 'आपके पास',
        unansweredQuestions: 'अनुत्तरित प्रश्न हैं',
        backToTest: 'टेस्ट पर वापस जाएं',
        submitNow: 'अभी जमा करें',
        question: 'प्रश्न',
        of: 'का',
        explanation: 'व्याख्या',
        explainAnswer: 'उत्तर समझाएं?',
        loading: 'लोड हो रहा है...',
        noTestFound: 'कोई टेस्ट नहीं मिला!',
        pleaseGenerate: 'कृपया एक नया टेस्ट बनाएं।',
        home: 'होम पर जाएं',
        correct: 'सही',
        incorrect: 'गलत',
        skipped: 'छोड़ा गया',
        yourAnswer: 'आपका उत्तर',
        correctAnswer: 'सही उत्तर',
        excellent: 'बहुत बढ़िया!',
        keepPracticing: 'अभ्यास करते रहें!',
        goodJob: 'अच्छा काम!',
        performanceText: 'यहाँ आपका प्रदर्शन है',
        testNotFound: 'टेस्ट नहीं मिला',
        failedToGenerateQuiz: 'क्विज़ बनाने में विफल। कृपया पुन: प्रयास करें।',
        notAnswered: 'उत्तर नहीं दिया गया',
        correctAnswerIs: 'सही उत्तर है',
    },
};

export function LanguageProvider({ children }) {
	const [language, setLanguage] = useState(getInitialLanguage);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		localStorage.setItem(LANGUAGE_KEY, language);
	}, [language]);

	useEffect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('lang', language === 'hindi' ? 'hi' : 'en');
	}, [language]);

	const t = (key) => {
		return translations[language][key] || key;
	};

	const toggleLanguage = () => {
		setLanguage((prev) => (prev === 'english' ? 'hindi' : 'english'));
	};

	return (
		<LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
			{children}
		</LanguageContext.Provider>
	);
}

export function useLanguage() {
	return useContext(LanguageContext);
}
