# Change intent

## Request and outcome

"cleanup android related setup and apk and related thing from this repo" (operator), with the
scope question answered as **Full removal**.

The repo no longer contains any Android app footprint: the Capacitor project, its config and
asset scripts, the committed APK and App Links verification file, the Capacitor-only web
runtime paths (WebView Google redirect sign-in, deep links, native haptics/keep-awake, APK
download banner, native telemetry), the npm build scripts, the Capacitor dependencies, and
the Vercel header. Browser behaviour is unchanged: every removed branch was gated on
`window.Capacitor`, which is undefined in browsers, and its web fallback (already in use) stays.

## Context

- The Android app was a Capacitor WebView wrapper (`com.selftest.app`) loading
  `https://www.selftest.in`; the repo held the full `android/` Gradle project (54 files),
  `capacitor.config.json`, the committed distribution APK (`static/apk/selftest.apk`, 3.3MB)
  and `static/.well-known/assetlinks.json` for Android App Links.
- Runtime integration lived in the web code: deep-link routing, hardware back-button
  handling, native haptics/keep-awake, a Capacitor-only Google sign-in redirect endpoint
  (`/auth/redirect`) with a redirect-mode trigger in the sign-in button, an APK download
  banner shown to Android browsers, and telemetry events (`apk:download`, `app:open`,
  `app:deep-link`).
- The passkeys design doc (2026-10-09) counted ~5 live Android WebView identities. The
  operator accepted that already-installed APKs degrade after deploy (in-app Google sign-in
  routing, deep links, native haptics/wake behaviours) in exchange for removing the footprint.
- `.intent/config.yaml` lists `**/*.test.*` as protected; the one modified unit test is
  declared under "Test changes".

## Scope

### Included

- Deleted: `android/**` (54 files), `capacitor.config.json`,
  `scripts/generate-android-assets.mjs`, `static/apk/selftest.apk`,
  `static/.well-known/assetlinks.json`, `src/routes/auth/redirect/+server.js`,
  `src/lib/client/deepLink.js`, `src/lib/client/nativeShell.js`.
- Removed Capacitor code paths: `haptics.js` (native Haptics branch), `screenWake.js`
  (native keep-awake), `deviceProfile.js` (native standalone detection), `auth.js`
  (`isNativeApp`, `handleAuthRedirect`), `GoogleSignInButton.svelte` (redirect-mode
  `login_uri`), `HomePage.svelte` (APK banner + Android/native state), `+layout.svelte`
  (deep-link / native-shell / redirect init calls).
- Removed telemetry events `apk:download`, `app:open`, `app:deep-link` (emitters and
  allowlist entries) and the locale key `androidAppDownload` (English + Hindi).
- `package.json`: removed `cap:sync`, `cap:open`, `apk:debug`, `apk:release`,
  `assets:android`; removed dependencies `@capacitor/app`, `@capacitor/core`,
  `@capacitor/haptics`, `@capacitor/keyboard`, `@capgo/capacitor-keep-awake` and
  devDependencies `@capacitor/android`, `@capacitor/cli`; lockfile regenerated.
- `vercel.json`: removed the `/apk/(.*)` cache header. `.gitignore`: removed `/android`,
  `/dist`, `/www` (Capacitor entries). `.env.example`: removed the Android redirect-URI
  instructions.

### Excluded

- No git-history rewrite; the APK and `android/` remain reachable in past commits.
- Dated historical records keep their references: git history, `.intent/changes/CHG-0009/**`,
  `docs/superpowers/specs/2026-10-09-passkeys-design.md`,
  `docs/superpowers/specs/2026-09-24-device-network-telemetry-design.md`; editing them would
  falsify history.
- Web/PWA Android behaviour kept: `installGuideAndroid*` locale strings (PWA "add to home
  screen") and low-end-Android performance guidance (AGENTS.md, `.intent/PROJECT.md`).
- The local, untracked `.env` still carries the stale redirect-URI comment; left untouched.

## Preserved behavior

- Browser behaviour is unchanged; all removed code only ran inside the native shell.
- All 992 unit tests and 199 e2e tests pass; `npm run check` builds with no dangling imports.

## Test changes

- `src/lib/client/deviceProfile.test.js` — **modified**: the native-shell case was dropped
  from "marks standalone when installed or running in the native shell" (renamed to "marks
  standalone when installed as a PWA") and the now-unused `Capacitor` stubs were removed.
  No other test file changed; no test skipped or deleted.

## Decisions and constraints

- Operator chose full removal over keeping an installed-APK compatibility layer (2026-10-13).
- The Capacitor-only server endpoint `/auth/redirect` was deleted together with its client
  trigger; Google and passkey sign-in for the web are untouched.
- Google Cloud Console may still list the redirect URI; external cleanup is the operator's.

## Verification

- `npm run lint` clean; `npm run locales:unused` exit 0; `npm run test` 992/992 (79 files);
  `npm run check` — `check-build-mode: OK — 191 chunks`; `npx playwright test` 199/199.
  Details in `conformance.md`.
