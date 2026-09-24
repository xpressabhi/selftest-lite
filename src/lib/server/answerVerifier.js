import * as z from 'zod';
import { questionTextFor } from '$lib/shared/questionText';

// Independent answer verification: after generation, a second model call
// solves each question without seeing the keyed answer. Questions where the
// verifier disagrees are sent back for regeneration. This catches miskeys and
// ambiguous items that prompt-level "self checks" miss.

export const answerVerificationSchema = z.object({
	answers: z
		.array(z.string())
		.describe(
			'One entry per question, in order. Each entry must be the complete text of the single best option, copied exactly.'
		),
});

export function buildAnswerVerificationPrompt({ questions, language = 'english' }) {
	const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
	const questionList = questions
		.map((question, index) => {
			const options = (question.options || [])
				.map((option, optionIndex) => `  ${optionLabels[optionIndex] || optionIndex + 1}. ${option}`)
				.join('\n');
			return `Q${index + 1}: ${questionTextFor(question)}\n${options}`;
		})
		.join('\n\n');

	return `You are an independent exam answer verifier. Solve every question below from scratch. You do not know the intended answer; determine the single best option for each question using your own knowledge.

LANGUAGE: ${language || 'english'}
RULES:
- Reason about each question before choosing an option.
- Choose exactly one option per question.
- Return exactly ${questions.length} entries in the answers array, one per question, in the same order.
- If a question is ambiguous, has no correct option, or has more than one defensible option, still choose the most likely intended answer and prefix it with "AMBIGUOUS: ".
- Copy the chosen option text exactly, character for character.

Return JSON in this shape:
{ "answers": ["<full text of correct option for Q1>", "<... for Q2>", ...] }

QUESTIONS:
${questionList}`;
}
