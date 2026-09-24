#!/usr/bin/env node
// Content quality evaluation harness.
//
// Generates papers with the production prompt + schema and reports
// deterministic quality metrics before and after the automatic fixes:
// answer-position bias, longest-option tell, structural defects, and
// near-duplicates. Optional --judge adds a model review of correctness,
// single-answer defensibility, and distractor quality.
//
// Usage:
//   npm run eval:content
//   npm run eval:content -- --questions=5 --topics="NEET biology cells|UPSC polity"
//   npm run eval:content -- --judge --strict
//
// Exit code is 0 unless --strict is passed and a threshold fails.

import { GoogleGenAI } from '@google/genai';
import * as z from 'zod';
import { generatePrompt } from '../src/lib/server/prompt.js';
import { paperSchema } from '../src/lib/server/quizSchema.js';
import { parseJsonResponse } from '../src/lib/server/jsonResponse.js';
import { applyQualityFixes, inspectQuestionBatch } from '../src/lib/server/questionQuality.js';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const getArg = (name, fallback) => {
	const found = args.find((argument) => argument.startsWith(`--${name}=`));
	return found ? found.split('=').slice(1).join('=') : fallback;
};

const strict = hasFlag('strict');
const judge = hasFlag('judge');
// Uniform option shuffling gives every key a 50% chance of landing in slot A
// or B, whatever the model's raw bias was. Judge the served share against that
// null with a one-sided binomial z-test instead of a fixed percentage: at 30
// questions a fixed 60% gate false-alarms roughly one run in five, while a
// real shuffle failure (share near the model's raw bias) still trips 2σ.
const SHUFFLE_SIGMA_LIMIT = 2;
function servedBiasLimit(questionCount) {
	const n = Math.max(1, questionCount);
	return 0.5 + SHUFFLE_SIGMA_LIMIT * Math.sqrt(0.25 / n);
}
const questionsPerPaper = Math.min(Math.max(Number(getArg('questions', 10)) || 10, 1), 25);
const difficulty = getArg('difficulty', 'intermediate');
const language = getArg('language', 'english');
const model = getArg('model', 'gemini-flash-lite-latest');
const judgeModel = getArg('judge-model', model);
const topics = getArg(
	'topics',
	'Class 12 chemistry organic reactions|NEET biology human physiology|UPSC polity fundamental rights'
)
	.split('|')
	.map((topic) => topic.trim())
	.filter(Boolean);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
	console.error('GEMINI_API_KEY is not set. Run via `npm run eval:content` (loads .env/.env.local).');
	process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

async function generateText(prompt) {
	let lastError = null;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const response = await ai.models.generateContent({
				model,
				contents: prompt,
				config: {
					responseMimeType: 'application/json',
					responseJsonSchema: z.toJSONSchema(paperSchema),
					thinkingConfig: {
						thinkingLevel: 'minimal',
					},
				},
			});
			return response.text;
		} catch (error) {
			lastError = error;
			if (!/503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded/iu.test(String(error?.message || ''))) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}
	throw lastError;
}

const JUDGE_SCHEMA = z.object({
	scores: z.array(
		z.object({
			correctness: z.number().min(1).max(5),
			singleAnswer: z.number().min(1).max(5),
			distractors: z.number().min(1).max(5),
		})
	),
});

function countIssue(issues, code) {
	return issues.filter((entry) => entry.issue === code).length;
}

function answerIndex(question) {
	return Array.isArray(question.options) ? question.options.indexOf(question.answer) : -1;
}

async function judgePaper(questions) {
	const list = questions
		.map(
			(question, index) =>
				`Q${index + 1}: ${question.question}\n` +
				(question.options || []).map((option, optionIndex) => `  ${optionIndex + 1}. ${option}`).join('\n') +
				`\nKeyed answer: ${question.answer}`
		)
		.join('\n\n');
	const response = await ai.models.generateContent({
		model: judgeModel,
		contents: `You are a strict exam quality reviewer. For every multiple-choice question below, score 1 (bad) to 5 (excellent) on:
- correctness: is the keyed answer factually correct?
- singleAnswer: is exactly one option defensible?
- distractors: are the wrong options plausible and free of tells?

Return JSON: { "scores": [{ "correctness": n, "singleAnswer": n, "distractors": n }, ...] } with one entry per question, in order.

${list}`,
		config: {
			responseMimeType: 'application/json',
			responseJsonSchema: z.toJSONSchema(JUDGE_SCHEMA),
			thinkingConfig: { thinkingLevel: 'minimal' },
		},
	});
	const parsed = JUDGE_SCHEMA.safeParse(parseJsonResponse(response.text));
	return parsed.success ? parsed.data.scores : null;
}

const perPaper = [];

for (const topic of topics) {
	const prompt = generatePrompt({
		topic,
		numQuestions: questionsPerPaper,
		difficulty,
		testType: 'multiple-choice',
		topicContext: 'Evaluation run.',
		examName: '',
		syllabusFocus: [],
		previousQuestions: [],
		language,
		testMode: 'quiz-practice',
		objectiveOnly: false,
		userContext: null,
		warmUpDifficulty: null,
	});

	try {
		const text = await generateText(prompt);
		const parsed = paperSchema.safeParse(parseJsonResponse(text));
		if (!parsed.success) {
			perPaper.push({ topic, error: 'schema-invalid' });
			continue;
		}

		const rawQuestions = parsed.data.questions;
		const rawIssues = inspectQuestionBatch(rawQuestions, { language });
		const { questions: fixedQuestions } = applyQualityFixes(rawQuestions, { language });
		const positions = rawQuestions.map(answerIndex).filter((index) => index >= 0);
		const earlyPositions = positions.filter((index) => index <= 1).length;
		const shuffledPositions = fixedQuestions.map(answerIndex).filter((index) => index >= 0);
		const shuffledEarly = shuffledPositions.filter((index) => index <= 1).length;
		const scores = judge ? await judgePaper(rawQuestions) : null;
		const averages = scores
			? {
					correctness: scores.reduce((sum, s) => sum + s.correctness, 0) / scores.length,
					singleAnswer: scores.reduce((sum, s) => sum + s.singleAnswer, 0) / scores.length,
					distractors: scores.reduce((sum, s) => sum + s.distractors, 0) / scores.length,
				}
			: null;

		perPaper.push({
			topic,
			questions: rawQuestions.length,
			nearDuplicates: countIssue(rawIssues, 'near-duplicate'),
			structuralIssues:
				countIssue(rawIssues, 'duplicate-options') +
				countIssue(rawIssues, 'empty-option') +
				countIssue(rawIssues, 'lazy-option') +
				countIssue(rawIssues, 'answer-not-in-options') +
				countIssue(rawIssues, 'language-drift') +
				countIssue(rawIssues, 'latex-unbalanced'),
			longestTell: countIssue(rawIssues, 'longest-answer-tell'),
			earlyShare: positions.length > 0 ? earlyPositions / positions.length : 0,
			shuffledEarlyShare:
				shuffledPositions.length > 0 ? shuffledEarly / shuffledPositions.length : 0,
			shuffledAnswerPositions: [...new Set(fixedQuestions.map(answerIndex))]
				.filter((index) => index >= 0)
				.sort()
				.join(','),
			judgeAverages: averages,
		});
	} catch (error) {
		perPaper.push({ topic, error: String(error?.message || error).slice(0, 200) });
	}
}

const loaded = perPaper.filter((paper) => !paper.error);
const totalQuestions = loaded.reduce((sum, paper) => sum + paper.questions, 0);
const aggregate = {
	papers: loaded.length,
	questions: totalQuestions,
	nearDuplicates: loaded.reduce((sum, paper) => sum + paper.nearDuplicates, 0),
	structuralIssues: loaded.reduce((sum, paper) => sum + paper.structuralIssues, 0),
	longestTell: loaded.reduce((sum, paper) => sum + paper.longestTell, 0),
	earlyShare: totalQuestions
		? loaded.reduce((sum, paper) => sum + paper.earlyShare * paper.questions, 0) / totalQuestions
		: 0,
	shuffledEarlyShare: totalQuestions
		? loaded.reduce((sum, paper) => sum + paper.shuffledEarlyShare * paper.questions, 0) /
			totalQuestions
		: 0,
};

console.log('\n=== Content evaluation ===');
for (const paper of perPaper) {
	if (paper.error) {
		console.log(`  ${paper.topic}: ERROR ${paper.error}`);
		continue;
	}
	console.log(
		`  ${paper.topic}: ${paper.questions}Q, A/B ${(paper.earlyShare * 100).toFixed(0)}%, longest-tell ${paper.longestTell}, dup ${paper.nearDuplicates}, structural ${paper.structuralIssues}${paper.judgeAverages ? `, judge ${paper.judgeAverages.correctness.toFixed(1)}/${paper.judgeAverages.singleAnswer.toFixed(1)}/${paper.judgeAverages.distractors.toFixed(1)}` : ''}`
	);
}
console.log('\n=== Aggregate ===');
console.log(`  papers:             ${aggregate.papers}/${topics.length}`);
console.log(`  questions:          ${aggregate.questions}`);
console.log(`  answer at A/B (model):   ${(aggregate.earlyShare * 100).toFixed(1)}%`);
const biasLimit = servedBiasLimit(aggregate.questions);
console.log(
	`  answer at A/B (served):  ${(aggregate.shuffledEarlyShare * 100).toFixed(1)}% (uniform-shuffle limit ${(biasLimit * 100).toFixed(1)}% at ${SHUFFLE_SIGMA_LIMIT}σ)`
);
console.log(`  longest-option key: ${aggregate.longestTell} (${totalQuestions ? ((aggregate.longestTell / totalQuestions) * 100).toFixed(1) : '0'}%, target < 35%)`);
console.log(`  near-duplicates:    ${aggregate.nearDuplicates}`);
console.log(`  structural issues:  ${aggregate.structuralIssues}`);

const failures = [];
if (aggregate.papers < topics.length) failures.push('one or more papers failed to generate');
if (totalQuestions > 0 && aggregate.shuffledEarlyShare > biasLimit) {
	failures.push('answer-position bias too high (served)');
}
if (totalQuestions > 0 && aggregate.longestTell / totalQuestions >= 0.35) {
	failures.push('longest-option tell too high');
}
if (aggregate.nearDuplicates > 0) failures.push('near-duplicates found');
if (aggregate.structuralIssues > 0) failures.push('structural defects found');

if (failures.length > 0) {
	console.log(`\n${failures.length} quality issue(s): ${failures.join('; ')}`);
} else {
	console.log('\nAll deterministic checks passed.');
}
if (strict && failures.length > 0) {
	process.exitCode = 1;
}
