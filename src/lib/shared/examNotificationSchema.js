// Zod mirrors of the model contracts for the exam notification sync.
// responseJsonSchema is generated from these (same pattern as quizSchema), and
// the script re-validates the parsed response with the same shapes before the
// tolerant normalizer takes over.

import { HUB_CATEGORIES } from '../data/indianExams.js';
import { z } from 'zod';

const isoDate = z
	.string()
	.nullable()
	.describe('Date in YYYY-MM-DD when the page clearly states it for this notification, else null');

const CATEGORY_IDS = HUB_CATEGORIES.map((category) => category.id).join(', ');

export const extractedNotificationSchema = z.object({
	title: z.string().describe('Verbatim headline exactly as printed on the page'),
	notificationUrl: z
		.string()
		.nullable()
		.describe('Absolute https URL of the official notice or PDF, copied from the page; null if absent'),
	applyUrl: z.string().nullable().describe('Absolute https apply link when the page carries one, else null'),
	publishedAt: isoDate.describe('Date the notice was published/uploaded, not the exam date'),
	applyStart: isoDate.describe('First date for applications, when stated'),
	applyEnd: isoDate.describe('Last date for applications, when stated'),
	examDate: isoDate.describe('Examination date when stated'),
	vacancies: z.number().int().nullable().describe('Number of vacancies when stated, else null'),
	qualification: z.string().nullable().describe('Short qualification line, e.g. "Graduate" or "12th pass"'),
	category: z
		.string()
		.nullable()
		.describe(`One of: ${CATEGORY_IDS}; else null`),
	state: z.string().nullable().describe('Indian state for state-level recruitment, else null'),
	examId: z.string().nullable().describe('Known practice exam id from the prompt list, only when clearly matching'),
	confidence: z.number().min(0).max(1).nullable().describe('Your 0-1 certainty that every filled field is correct')
});

export const examNotificationExtractionSchema = z.object({
	items: z.array(extractedNotificationSchema)
});

export const sourceSuggestionSchema = z.object({
	org: z.string().nullable(),
	url: z.string(),
	category: z.string().nullable(),
	reason: z.string().nullable()
});

export const sourceDiscoverySchema = z.object({
	suggestions: z.array(sourceSuggestionSchema)
});
