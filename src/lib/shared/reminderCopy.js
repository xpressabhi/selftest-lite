// Push copy for the daily practice reminder.
//
// The sender picks one variant per subscriber per UTC day from the language
// stored on the subscription, so the push reads like a friend checking in for
// a co-study session rather than a scheduled robot: stable all day, fresh the
// next. Both languages must always carry the same number of variants.

export const REMINDER_COPY_LANGUAGES = ['en', 'hi'];

export const REMINDER_COPY = {
	en: [
		{
			title: 'Yo! Your study buddy called 🎯',
			body: "The table's set, the chai's warm — 5 quick questions?"
		},
		{
			title: 'I started without you 😤',
			body: '5 questions. Catch up before I finish first.'
		},
		{
			title: 'Missed you at the study table 📚',
			body: "Come back — 5 questions and we're even."
		},
		{
			title: 'Study session? Right now? 🏃',
			body: 'Yes. 5 questions. Bring your brain.'
		},
		{
			title: "Don't leave me hanging 📚",
			body: "One tiny test. 3 minutes. That's the deal."
		},
		{
			title: 'Your streak just texted me 🔥',
			body: "It asked: 'where did they go?' 5 questions. Go."
		}
	],
	hi: [
		{
			title: 'अरे! स्टडी साथी ने बुलाया 🎯',
			body: 'मेज़ तैयार है, चाय गरम है — 5 आसान सवाल?'
		},
		{
			title: 'मैंने तुम्हारे बिना शुरू कर दिया 😤',
			body: '5 सवाल। पीछे मत रहो।'
		},
		{
			title: 'स्टडी टेबल पर तुम्हारी कमी महसूस हुई 📚',
			body: 'आ जाओ — 5 सवाल और बराबरी।'
		},
		{
			title: 'स्टडी सेशन? अभी? 🏃',
			body: 'हाँ। 5 सवाल। दिमाग साथ लाओ।'
		},
		{
			title: 'छोड़के मत जा, दोस्त 📚',
			body: 'एक छोटा टेस्ट। 3 मिनट। बस।'
		},
		{
			title: 'तुम्हारी स्ट्रीक ने मुझे मैसेज किया 🔥',
			body: "पूछ रही है — 'वो कहाँ गए?' 5 सवाल। जाओ।"
		}
	]
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Language codes the reminder system understands: `hi`/`hindi` → `hi`, else `en`. */
export function normalizeReminderLanguage(language) {
	return language === 'hi' || language === 'hindi' ? 'hi' : 'en';
}

/**
 * The copy for one subscriber on one day. Rotation is by UTC day so every
 * send within a day agrees; an unusable date falls back to day 0 instead of
 * throwing mid-send.
 */
export function getReminderCopy(language, date = new Date()) {
	const resolvedLanguage = normalizeReminderLanguage(language);
	const variants = REMINDER_COPY[resolvedLanguage];
	const time = date instanceof Date ? date.getTime() : Number(date);
	const day = Number.isFinite(time) ? Math.floor(time / DAY_MS) : 0;
	const index = ((day % variants.length) + variants.length) % variants.length;
	return { ...variants[index] };
}
