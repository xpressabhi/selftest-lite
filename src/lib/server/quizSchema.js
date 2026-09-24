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

export const matchingQuestionSchema = z.object({
	question: z.string().describe('The matching instruction stem, without the columns themselves'),
	rationale: z
		.string()
		.describe(
			'Private one-sentence reasoning: why each pair is the correct match and why the closest alternatives are wrong'
		),
	columnA: z
		.array(z.string())
		.describe('Column I: exactly four short items (up to six words each), distinct from one another'),
	columnB: z
		.array(z.string())
		.describe(
			'Column II: exactly four matching items, written in the same order as Column I so columnB[i] is the correct match for columnA[i]. Do not scramble them and do not output options or an answer.'
		),
});

export const assertionReasoningQuestionSchema = z.object({
	assertion: z.string().describe('Assertion (A): one factual statement'),
	reason: z.string().describe('Reason (R): one factual statement that does not restate the assertion'),
	rationale: z
		.string()
		.describe(
			'Private one-sentence reasoning: why the keyed relationship between assertion and reason is the right one'
		),
	answer: z
		.enum(['a', 'b', 'c', 'd'])
		.describe(
			'The correct code: a = both A and R true, R explains A; b = both true, R does not explain A; c = A true, R false; d = A false, R true'
		),
});

export const paperSchema = z.object({
	topic: z.string().describe('The topic of the test'),
	questions: z.array(questionSchema).describe('An array of questions in the test'),
});

/**
 * The structured-output schema for a paper, per test type. The model can only
 * answer in the shape its format needs: content fields for matching and
 * assertion-reasoning (the server owns options and the answer), or the full
 * question shape for legacy formats.
 */
export function paperSchemaFor(testType) {
	if (testType === 'matching') {
		return z.object({
			topic: z.string().describe('The topic of the test'),
			questions: z.array(matchingQuestionSchema).describe('An array of matching questions'),
		});
	}
	if (testType === 'assertion-reasoning') {
		return z.object({
			topic: z.string().describe('The topic of the test'),
			questions: z
				.array(assertionReasoningQuestionSchema)
				.describe('An array of assertion-reasoning questions'),
		});
	}
	return paperSchema;
}

export const explanationSchema = z.object({
	explanation: z.string().describe('A clear, concise explanation of the answer'),
});
