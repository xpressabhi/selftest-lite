// Deep-link builder for the concept playground. Pure and shared: the results
// review card links with question context, the playground page reads the same
// params back as prefill. Truncation bounds the URL for very long questions.
export const PLAYGROUND_QUESTION_MAX_LENGTH = 400;
export const PLAYGROUND_ANSWER_MAX_LENGTH = 200;

export function buildPlaygroundHref({ topic, question, answer, language } = {}) {
	const params = new URLSearchParams();

	const normalizedTopic = String(topic ?? '').trim();
	if (normalizedTopic) {
		params.set('topic', normalizedTopic);
	}

	const normalizedQuestion = String(question ?? '')
		.trim()
		.slice(0, PLAYGROUND_QUESTION_MAX_LENGTH);
	if (normalizedQuestion) {
		params.set('question', normalizedQuestion);
	}

	const normalizedAnswer = String(answer ?? '')
		.trim()
		.slice(0, PLAYGROUND_ANSWER_MAX_LENGTH);
	if (normalizedAnswer) {
		params.set('answer', normalizedAnswer);
	}

	const base =
		String(language ?? '').toLowerCase() === 'hindi' ? '/hi/playground' : '/playground';
	return params.size > 0 ? `${base}?${params.toString()}` : base;
}
