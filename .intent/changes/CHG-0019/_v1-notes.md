## scope.included

- Deleted the 54-file android/ Gradle project, capacitor.config.json, scripts/generate-android-assets.mjs, static/apk/selftest.apk, static/.well-known/assetlinks.json.
- Deleted the Capacitor-only server endpoint src/routes/auth/redirect/+server.js and the native-only modules deepLink.js and nativeShell.js.
- Removed Capacitor code paths from haptics.js, screenWake.js, deviceProfile.js, auth.js, GoogleSignInButton.svelte, HomePage.svelte and +layout.svelte.
- Removed telemetry events apk:download, app:open, app:deep-link and the androidAppDownload locale key (EN + HI).
- Removed cap:*, apk:* and assets:android npm scripts and all @capacitor/* and @capgo/* dependencies; lockfile regenerated.
- Removed the /apk/(.*) Vercel cache header, the Android .gitignore entries and the .env.example redirect-URI instructions.

## scope.excluded

- No git-history rewrite; the APK and android/ remain in past commits.
- Dated historical records (.intent/changes/CHG-0009, docs/superpowers/specs) keep their references; editing them would falsify history.
- PWA Android install-guide strings and low-end-Android performance guidance are web/PWA material and stay.

## preserved

- Browser behaviour is unchanged: every removed branch was gated on window.Capacitor, undefined in browsers, and web fallbacks stay.

## decisions

- Operator chose full removal over keeping an installed-APK compatibility layer (question answered 2026-10-13); already-installed APKs degrade after deploy.
- The Capacitor-only /auth/redirect endpoint was deleted with its client trigger; Google Cloud Console URI cleanup is external.

