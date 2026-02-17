import * as z from 'zod';

export const questionSchema = z.object({
	question: z.string().describe('The question text with formatting'),
	options: z.array(z.string()).describe('The answer options for the question'),
	answer: z
		.string()
		.describe('The correct answer to the question, Must match exactly one of the options'),
});

export const paperSchema = z.object({
	topic: z.string().describe('The topic of the test'),
	questions: z.array(questionSchema).describe('An array of questions in the test'),
});
