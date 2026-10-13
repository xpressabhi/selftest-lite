# Conformance record

## Outcome

The Android app footprint is fully removed: **61 files deleted** (54-file Gradle project,
committed APK, asset links, native-only modules/endpoint, config, script) and **17 files
modified** (runtime branches, telemetry, locales, scripts/deps, Vercel/gitignore/env docs).
A repo-wide grep for `Capacitor`, `@capgo`, `assetlinks`, `/apk/`, `apk:download`,
`app:open`, `app:deep-link`, `handleAuthRedirect`, `isNativeApp`, `deepLink`, `nativeShell`
finds **zero remaining references in code** — only dated historical records
(`.intent/changes/CHG-0009`, `docs/superpowers/specs/**`), which are intentionally kept.
The lockfile has zero `@capacitor` entries; the built output shrank from 198 to 191 chunks.

Change `CHG-0019` revision 1, proposal digest
`sha256:fec3eb593fca55fd43f8f5a0431442ed285f912dc60e0144a56875d901fef5a8`.

## Verification

| Command                 | Result                                              |
| ----------------------- | --------------------------------------------------- |
| `npm run lint`          | pass                                                |
| `npm run locales:unused` | exit 0 (no `androidAppDownload`)                   |
| `npm run test`          | **992 passed / 79 files**                           |
| `npm run check`         | `check-build-mode: OK — 191 chunks`                 |
| `npm run verify:vercel` | `OK — 236 sitemap URLs, 232 prerendered pages, SSR function present` |
| `npx playwright test`   | **199 passed** (1.6m)                               |
| `grep` reference sweep  | 0 code references remaining                         |
| `package-lock.json`     | 0 `@capacitor` references                           |

## Test changes

- `src/lib/client/deviceProfile.test.js` — the declared modification is confirmed: the
  native-shell branch of the standalone test was removed and the test renamed; the
  `Capacitor` stubs were deleted. No other test file was modified, skipped, or deleted.

## Deviations and decisions

- **History not rewritten**: the APK and `android/` remain in past git commits; removing them
  from history would require a force-push and was out of scope.
- **Historical records kept**: `CHG-0009` and the dated design specs still mention the
  Capacitor app; they are records of the state at their time.
- **Installed APKs degrade after deploy** (accepted by the operator): in-app Google
  sign-in routing, deep links and native haptics/keep-awake fall back to web behaviour.
- **Left untouched**: the untracked local `.env` comment block, and PWA/first-run Android
  material (`installGuideAndroid*` strings, low-end-Android guidance).

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the operator explicitly
chose the full-removal scope.
