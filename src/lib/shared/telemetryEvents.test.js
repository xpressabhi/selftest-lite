import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TELEMETRY_EVENTS } from './telemetryEvents.js';

// Repo root resolves from this file: src/lib/shared/ -> ../../..
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function listSourceFiles(dir) {
	const files = [];
	for (const name of readdirSync(dir)) {
		const filePath = join(dir, name);
		if (statSync(filePath).isDirectory()) {
			files.push(...listSourceFiles(filePath));
		} else if (/\.(js|svelte)$/.test(name) && !name.endsWith('.test.js')) {
			files.push(filePath);
		}
	}
	return files;
}

/**
 * Extracts the first argument of every track()/trackDebounced() call and
 * returns all string literals inside it. Handles ternaries and nested
 * parentheses/braces so multi-line calls are covered too.
 */
function extractTrackedEvents(source) {
	const events = [];
	const callPattern = /\btrack(?:Debounced)?\s*\(/g;
	let match;
	while ((match = callPattern.exec(source))) {
		let index = match.index + match[0].length;
		let depth = 1;
		let quote = null;
		let argument = '';
		for (; index < source.length && depth > 0; index += 1) {
			const char = source[index];
			if (quote) {
				argument += char;
				if (char === '\\') {
					argument += source[index + 1] ?? '';
					index += 1;
					continue;
				}
				if (char === quote) {
					quote = null;
				}
				continue;
			}
			if (char === "'" || char === '"' || char === '`') {
				quote = char;
				argument += char;
				continue;
			}
			if (char === '(' || char === '[' || char === '{') {
				depth += 1;
			} else if (char === ')' || char === ']' || char === '}') {
				depth -= 1;
				if (depth === 0) {
					break;
				}
			} else if (char === ',' && depth === 1) {
				break;
			}
			argument += char;
		}
		for (const literal of argument.matchAll(/['"`]([a-z][a-z0-9:_-]+)['"`]/gi)) {
			events.push(literal[1]);
		}
	}
	return events;
}

function collectEmittedEvents() {
	const emitted = new Map();
	for (const file of listSourceFiles(SRC_ROOT)) {
		const source = readFileSync(file, 'utf8');
		for (const event of extractTrackedEvents(source)) {
			if (!emitted.has(event)) {
				emitted.set(event, file.replace(`${SRC_ROOT}/`, 'src/'));
			}
		}
	}
	return emitted;
}

describe('telemetry event allowlist', () => {
	const emitted = collectEmittedEvents();

	it('allows every event emitted by track()/trackDebounced()', () => {
		const blocked = [...emitted.entries()]
			.filter(([event]) => !TELEMETRY_EVENTS.has(event))
			.map(([event, file]) => `${event} (${file})`);
		expect(blocked).toEqual([]);
	});

	it('keeps no allowlisted event without an emit site', () => {
		const dead = [...TELEMETRY_EVENTS].filter((event) => !emitted.has(event));
		expect(dead).toEqual([]);
	});
});
