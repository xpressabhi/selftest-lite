import * as z from 'zod';

export const questionSchema = z.object({
	question: z.string().describe('The question text with formatting'),
	rationale: z
		.string()
		.describe(
			'Private one-sentence reasoning: why the correct answer is factually right and why the closest distractor is wrong'
		),
	options: z
		.array(z.string())
		.describe(
			'Four answer options. Distractors must be plausible misconceptions, same category and similar length as the key'
		),
	answer: z
		.string()
		.describe('The correct answer, copied exactly from one complete option string'),
});

export const paperSchema = z.object({
	topic: z.string().describe('The topic of the test'),
	questions: z.array(questionSchema).describe('An array of questions in the test'),
});

export const explanationSchema = z.object({
	explanation: z.string().describe('A clear, concise explanation of the answer'),
});
