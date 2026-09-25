#!/usr/bin/env node
/**
 * Informational unused-locale-key detector.
 *
 * Reads src/lib/locales/english.json and looks for every key that no code can
 * reach: a key is "referenced" when a string literal in the .js/.svelte files
 * under src/ names it, either as the first argument of t()/$t()/translate() or as a raw
 * key string (data files, key maps, component props). Keys that are only
 * produced dynamically are "allowlisted" instead of reported as unused.
 *
 * Output (stdout, JSON, exit code always 0):
 *   {
 *     "total": <number>,          // keys in english.json
 *     "referenced": <number>,     // keys named by a literal somewhere in src
 *     "unused": [...keys],        // no literal reference and no dynamic producer
 *     "allowlisted": [...keys]    // no literal reference, but dynamically producible
 *   }
 * referenced + unused.length + allowlisted.length === total.
 *
 * The allowlist is derived from the source, never hardcoded:
 *  - Achievement family: ACHIEVEMENTS ids and STREAK_MILESTONES are parsed out of
 *    src/lib/client/learning.js, and the key prefix/suffix are read from the
 *    `achievement_...` template literals in the Svelte code that render them.
 *    This expands to e.g. achievement_first_quiz_title for each ACHIEVEMENTS id
 *    and achievement_streak_3_title for each milestone.
 *  - Producer files: every string literal in the data/key-map files
 *    (src/lib/data/blogPosts.js, faqs.js, indianExams.js; src/lib/client/learning.js;
 *    src/lib/server/intentParse.js; src/lib/client/plannerState.js; the
 *    API_ERROR_MESSAGE_KEYS map in src/lib/client/i18n.js) that matches a locale key.
 *  - Other template literals with `${...}` interpolations are converted to patterns
 *    and matching keys are allowlisted, but only when the static parts are
 *    specific enough (at least 4 letters and one identifier-like run). Broad
 *    patterns such as `${anything}` are ignored so the detector stays useful.
 *    The achievement_* family is excluded from these generic patterns and driven
 *    only by the ACHIEVEMENTS/milestone lists.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(ROOT, 'src');
const ENGLISH_PATH = join(SRC_DIR, 'lib', 'locales', 'english.json');

/** Files whose string literals describe keys resolved indirectly (t(variable)). */
const PRODUCER_FILES = [
	'src/lib/data/blogPosts.js',
	'src/lib/data/faqs.js',
	'src/lib/data/indianExams.js',
	'src/lib/client/learning.js',
	'src/lib/server/intentParse.js',
	'src/lib/client/plannerState.js',
	'src/lib/client/i18n.js',
];

const ACHIEVEMENTS_SOURCE = 'src/lib/client/learning.js';

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
	);
}

/**
 * Every string literal in JS/Svelte source: '...', "...", and `...` without
 * interpolation. Regex scanning (not a parser) may pick up strings inside
 * comments; that only ever adds a literal, i.e. it errs toward "referenced".
 */
function stringLiterals(text) {
	const literals = [];
	for (const match of text.matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\.|[^`\\])*)`/g)) {
		literals.push(match[2] ?? match[3]);
	}
	return literals;
}

/** Literal keys passed as the first argument of t()/$t()/translate(). */
function translationCallKeys(text) {
	const keys = [];
	const pattern =
		/(?:\$t|\btranslate)\s*\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/g;
	for (const match of text.matchAll(pattern)) {
		keys.push(match[1] ?? match[2] ?? match[3]);
	}
	return keys;
}

/** Interpolated template literals: { file, template }. */
function interpolatedTemplates(file, text) {
	const templates = [];
	for (const match of text.matchAll(/`((?:\\.|[^`\\])*)`/g)) {
		if (match[1].includes('${')) {
			templates.push({ file, template: match[1] });
		}
	}
	return templates;
}

/** A dynamic pattern is trusted only when its static skeleton is specific. */
function isSpecificTemplate(template) {
	const parts = template.split(/\$\{[^}]*\}/g).filter((part) => part.length > 0);
	if (parts.length === 0) {
		return false;
	}
	const letters = parts.join('').replace(/[^A-Za-z]/g, '').length;
	return letters >= 4 && parts.some((part) => /[A-Za-z_][A-Za-z0-9_]{3,}/.test(part));
}

function templateToPattern(template) {
	const parts = template
		.split(/\$\{[^}]*\}/g)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`^${parts.join('.*')}$`);
}

/** First capture group of `pattern` in `text`, or null. */
function firstMatch(text, pattern) {
	const match = text.match(pattern);
	return match ? match[1] : null;
}

function loadAchievementKeys(englishKeys, sources) {
	const learningText = readFileSync(join(ROOT, ACHIEVEMENTS_SOURCE), 'utf8');
	const achievementsBlock = firstMatch(
		learningText,
		/const ACHIEVEMENTS\s*=\s*\[([\s\S]*?)\n\];/
	);
	const milestoneBlock = firstMatch(
		learningText,
		/export const STREAK_MILESTONES\s*=\s*\[([^\]]*)\]/
	);
	const achievementIds = achievementsBlock
		? [...achievementsBlock.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1])
		: [];
	const milestones = milestoneBlock ? milestoneBlock.match(/\d+/g) || [] : [];

	const keys = new Set();
	for (const { template } of sources) {
		if (!template.startsWith('achievement_')) {
			continue;
		}
		const prefix = template.slice(0, template.indexOf('${'));
		const suffix = template.slice(template.lastIndexOf('}') + 1);
		const bases =
			prefix === 'achievement_streak_'
				? milestones.map((days) => `streak_${days}`)
				: prefix === 'achievement_'
					? achievementIds
					: [];
		for (const base of bases) {
			const key = `${prefix}${base}${suffix}`;
			if (englishKeys.has(key)) {
				keys.add(key);
			}
		}
	}
	return keys;
}

function main() {
	const english = JSON.parse(readFileSync(ENGLISH_PATH, 'utf8'));
	const englishKeys = new Set(Object.keys(english));
	const localeKeys = [...englishKeys];

	const files = walk(SRC_DIR).filter((file) => /\.(js|svelte)$/.test(file));
	const literals = new Set();
	const references = new Set();
	const templates = [];

	for (const file of files) {
		const text = readFileSync(file, 'utf8');
		for (const literal of stringLiterals(text)) {
			literals.add(literal);
		}
		for (const key of translationCallKeys(text)) {
			if (englishKeys.has(key)) {
				references.add(key);
			}
		}
		templates.push(...interpolatedTemplates(relative(ROOT, file), text));
	}

	const referenced = new Set([...literals].filter((literal) => englishKeys.has(literal)));
	for (const key of references) {
		referenced.add(key);
	}

	const allowlisted = new Set();

	// 1. Achievement family: ACHIEVEMENTS ids + STREAK_MILESTONES x code templates.
	for (const key of loadAchievementKeys(englishKeys, templates)) {
		allowlisted.add(key);
	}

	// 2. Producer files: literal keys resolved indirectly through t(variable).
	for (const producer of PRODUCER_FILES) {
		const text = readFileSync(join(ROOT, producer), 'utf8');
		for (const literal of stringLiterals(text)) {
			if (englishKeys.has(literal)) {
				allowlisted.add(literal);
			}
		}
	}

	// 3. Other specific `prefix_${...}_suffix` templates.
	for (const { template } of templates) {
		if (template.startsWith('achievement_') || !isSpecificTemplate(template)) {
			continue;
		}
		const pattern = templateToPattern(template);
		for (const key of localeKeys) {
			if (!key.startsWith('achievement_') && pattern.test(key)) {
				allowlisted.add(key);
			}
		}
	}

	const unused = localeKeys.filter((key) => !referenced.has(key) && !allowlisted.has(key)).sort();
	const dynamicOnly = localeKeys
		.filter((key) => !referenced.has(key) && allowlisted.has(key))
		.sort();

	console.log(
		JSON.stringify(
			{
				total: localeKeys.length,
				referenced: referenced.size,
				unused,
				allowlisted: dynamicOnly,
			},
			null,
			2
		)
	);
}

main();
