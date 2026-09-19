/**
 * FAQ content - grouped questions rendered as an accordion.
 *
 * `answerKeys` holds one key for a plain answer, or three keys where the
 * middle one is emphasised (the point the answer is really making). Keeping
 * the shape this small means `locales.test.js` can validate every entry.
 */

export const FAQ_SECTIONS = [
	{
		id: 'general',
		titleKey: 'faqSectionGeneral',
		items: [
			{
				id: 'what-is',
				questionKey: 'faqQWhatIs',
				answerKeys: ['faqAWhatIs1', 'faqAWhatIsHighlight', 'faqAWhatIs2'],
			},
			{ id: 'is-free', questionKey: 'faqQIsFree', answerKeys: ['faqAIsFree'] },
			{
				id: 'question-count',
				questionKey: 'faqQHowManyQuestions',
				answerKeys: ['faqAHowManyQuestions'],
			},
		],
	},
	{
		id: 'practice',
		titleKey: 'faqSectionPractice',
		items: [
			{
				id: 'better-questions',
				questionKey: 'faqQBetterQuestions',
				answerKeys: ['faqABetterQuestions'],
			},
			{
				id: 'wrong-answer',
				questionKey: 'faqQWrongAnswer',
				answerKeys: ['faqAWrongAnswer'],
			},
			{
				id: 'repeats',
				questionKey: 'faqQDoQuestionsRepeat',
				answerKeys: ['faqADoQuestionsRepeat'],
			},
			{
				id: 'explanations',
				questionKey: 'faqQExplanations',
				answerKeys: ['faqAExplanations'],
			},
		],
	},
	{
		id: 'privacy',
		titleKey: 'faqSectionPrivacyData',
		items: [
			{ id: 'store-data', questionKey: 'faqQStoreData', answerKeys: ['faqAStoreData'] },
			{ id: 'save-quizzes', questionKey: 'faqQSaveQuizzes', answerKeys: ['faqASaveQuizzes'] },
			{ id: 'sign-in', questionKey: 'faqQSignIn', answerKeys: ['faqASignIn'] },
			{ id: 'delete-data', questionKey: 'faqQDeleteData', answerKeys: ['faqADeleteData'] },
		],
	},
	{
		id: 'technical',
		titleKey: 'faqSectionTechnical',
		items: [
			{
				id: 'ai-generation',
				questionKey: 'faqQAiGeneration',
				answerKeys: ['faqAAiGeneration'],
			},
			{ id: 'offline', questionKey: 'faqQOffline', answerKeys: ['faqAOffline'] },
			{ id: 'languages', questionKey: 'faqQLanguages', answerKeys: ['faqALanguages'] },
			{ id: 'devices', questionKey: 'faqQDevices', answerKeys: ['faqADevices'] },
		],
	},
];

/** Flat view - used by the About page teaser and by tests. */
export const FAQ_ITEMS = FAQ_SECTIONS.flatMap((section) =>
	section.items.map((item) => ({ ...item, sectionId: section.id }))
);

export function getFaqItems(ids) {
	return ids.map((id) => FAQ_ITEMS.find((item) => item.id === id)).filter(Boolean);
}

/** Anchor id for deep links such as `/faq#q-offline`. */
export function faqAnchorId(itemId) {
	return `q-${itemId}`;
}
