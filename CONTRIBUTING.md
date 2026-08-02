# Contributing to Selftest-lite

Thanks for contributing! This is a private repository, so please coordinate with the maintainer before starting large changes.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY (and DATABASE_URL if needed)
npm run dev
```

## Before you submit

1. Run `npm run lint` — ESLint must pass (semicolons required, single quotes preferred).
2. Run `npm run check` — SvelteKit sync + production build must succeed.
3. Run `npm run test` — existing vitest unit tests must pass.
4. Add or update unit tests for any server-side pure logic you touch (`src/lib/server/*`, `src/lib/shared/*`).
5. If you add or change user-facing UI text, provide it in **both English and Hindi** in `src/lib/locales/english.json` and `src/lib/locales/hindi.json` — do not hardcode strings in components.
6. Verify mobile behavior (320px+) and respect the low-end Android / slow-network baseline described in `AGENTS.md`.

## Pull requests

- Branch from `main` and open a PR with a short, focused description of the change and how it was verified.
- Keep PRs small; one logical change per PR.
- If you changed an API, note the new endpoint or behavior in the PR description.

## Bug reports

Include the topic/options used, the error code returned (e.g. `GENERATION_FAILED`, `RATE_LIMIT_EXCEEDED`), and whether it happens on mobile or desktop.
