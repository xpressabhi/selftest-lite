import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Repo root resolves from this file: src/lib/styles/ -> ../..
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Tailwind v4 ships its default palette in oklch(). Browsers that predate it
// (Chrome/Edge < 111, Firefox < 113 — e.g. Chrome 109, the last build for
// Windows 7/8.1) treat a `var(--color-*)` holding oklch() as invalid at
// computed-value time, so the property silently falls back to its initial
// value: a fill disappears while white ink still applies and the element goes
// invisible (the reported "missing" submit button). globals.css re-declares
// the families the app uses as sRGB hex; this suite fails when a palette
// utility is used without a hex-backed override.
const PALETTE_FAMILIES = [
	'slate',
	'gray',
	'zinc',
	'neutral',
	'stone',
	'red',
	'orange',
	'amber',
	'yellow',
	'lime',
	'green',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'blue',
	'indigo',
	'violet',
	'purple',
	'fuchsia',
	'pink',
	'rose',
];

// Utility stems whose argument is a palette colour (Tailwind's `-<color>`
// slots). Compound stems like `border-x` or `ring-offset` start with one of
// these.
const COLOR_UTILITY_STEMS = [
	'bg',
	'text',
	'border',
	'outline',
	'ring',
	'fill',
	'stroke',
	'from',
	'to',
	'via',
	'decoration',
	'divide',
	'accent',
	'caret',
	'placeholder',
	'shadow',
];

function listSourceFiles(dir) {
	const files = [];
	for (const name of readdirSync(dir)) {
		const filePath = join(dir, name);
		if (statSync(filePath).isDirectory()) {
			files.push(...listSourceFiles(filePath));
		} else if (/\.(js|svelte|css)$/.test(name) && !name.endsWith('.test.js')) {
			files.push(filePath);
		}
	}
	return files;
}

function isColorUtility(utility) {
	return COLOR_UTILITY_STEMS.some((stem) => utility === stem || utility.startsWith(`${stem}-`));
}

/**
 * Collects every `(variant:)*<utility>-<family>-<shade>[/opacity]` occurrence
 * and returns a Map of token (`family-shade`) -> first file that uses it.
 */
function collectUsedPaletteTokens() {
	const used = new Map();
	const familyGroup = PALETTE_FAMILIES.join('|');
	const pattern = new RegExp(
		`(?:^|[^a-zA-Z0-9_-])([a-zA-Z:-]+)-(${familyGroup})-(\\d{2,3})(?![0-9a-zA-Z_-])`,
		'g'
	);
	for (const file of listSourceFiles(SRC_ROOT)) {
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(pattern)) {
			const candidates = match[1].split(':');
			const utility = candidates[candidates.length - 1];
			if (!isColorUtility(utility)) {
				continue;
			}
			const token = `${match[2]}-${match[3]}`;
			if (!used.has(token)) {
				used.set(token, file.replace(`${SRC_ROOT}/`, 'src/'));
			}
		}
	}
	return used;
}

function collectSrgbOverrides() {
	const source = readFileSync(join(SRC_ROOT, 'lib', 'styles', 'globals.css'), 'utf8');
	const overrides = new Map();
	for (const match of source.matchAll(/--color-([a-z]+-\d{2,3}):\s*([^;]+);/g)) {
		if (overrides.has(match[1])) {
			continue;
		}
		overrides.set(match[1], match[2].trim());
	}
	return overrides;
}

describe('Tailwind palette sRGB fallback', () => {
	const used = collectUsedPaletteTokens();
	const overrides = collectSrgbOverrides();

	it('backs every default-palette utility with an sRGB hex override', () => {
		const missing = [...used.entries()]
			.filter(([token]) => !overrides.has(token))
			.map(([token, file]) => `${token} (used in ${file})`);
		expect(missing).toEqual([]);
	});

	it('declares every colour override as plain sRGB hex', () => {
		const nonHex = [...overrides.entries()]
			.filter(([, value]) => !/^#[0-9a-f]{3,8}$/i.test(value))
			.map(([token, value]) => `${token}: ${value}`);
		expect(nonHex).toEqual([]);
	});
});
