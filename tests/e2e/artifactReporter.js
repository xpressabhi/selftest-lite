// Writes a deterministic e2e artifact after every run so results can be
// verified (tied to a git revision) and repeated (same revision + same code
// produces the same file). Tests may attach `evidence` JSON, which is folded
// into the artifact for the feature under test.
//
// Output: test-results/e2e-artifact.json (gitignored; produced per run).

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function gitSha() {
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

function readEvidence(attachments = []) {
	const evidence = [];
	for (const attachment of attachments) {
		if (attachment?.name !== 'evidence') continue;
		try {
			const raw = attachment.body
				? String(attachment.body)
				: attachment.path
					? readFileSync(attachment.path, 'utf8')
					: '';
			if (raw) evidence.push(JSON.parse(raw));
		} catch {
			// Non-JSON evidence is skipped so the artifact stays parseable.
		}
	}
	return evidence;
}

export default class E2eArtifactReporter {
	constructor(options = {}) {
		this.outputFile = resolve(options.outputFile || 'test-results/e2e-artifact.json');
		this.tests = [];
	}

	onTestEnd(test, result) {
		this.tests.push({
			title: test.titlePath().filter(Boolean).join(' > '),
			status: result.status,
			evidence: readEvidence(result.attachments),
		});
	}

	onEnd() {
		const tests = [...this.tests].sort((a, b) => a.title.localeCompare(b.title));
		const artifact = {
			suite: 'selftest-lite e2e',
			gitSha: gitSha(),
			total: tests.length,
			passed: tests.filter((test) => test.status === 'passed').length,
			failed: tests.filter((test) => test.status !== 'passed').length,
			tests,
		};
		mkdirSync(dirname(this.outputFile), { recursive: true });
		writeFileSync(this.outputFile, `${JSON.stringify(artifact, null, 2)}\n`);
	}
}
