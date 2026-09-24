# Device & Network Telemetry (Design)

Date: 2026-09-24
Status: approved (approach A — client profile events + report-side session join)
Scope: capture anonymous device-capability and connection-quality data per session, correlate it
with generation outcomes, and surface a supported-floor recommendation. No API contract change,
no new dependencies.

## 1. Objective

We do not know which devices or connection speeds our users actually run. `app:open` records only
`platform: 'android'`, and the connection signal is a single binary data-saver flag
(`preferences.js` reads `effectiveType`/`saveData` and discards the rest). Decisions like "how
light must the test page be" or "is 3G support worth it" are guesses.

This design records, per session, an anonymous device profile (tier, RAM, cores, model, Android
version, screen class) and the connection quality over time (effective type, downlink, RTT), joins
those to generation failures/latency in the report, and prints a concrete supported-floor line.

Success criteria:

- Every app session emits one `device:profile` event with the fields in §4.
- Connection-quality changes within a session are recorded as `net:change`, debounced and capped.
- `npm run telemetry:report` gains a "Device & network" section: device mix per identity, top
  low-tier models, network mix per session, generate outcomes by downlink bucket, and a supported
  floor line (p10 downlink / p90 RTT across sessions + failure rate at or below it).
- A coverage quality gate fails the strict run if `device:profile` coverage drops below 80% of
  sessions that emitted `page:view`.
- `/admin` gains a read-only "Device & network" card.
- Data-saver users are tracked exactly like everyone else (they are the population of interest).
- Privacy copy (en + hi) mentions anonymous device-capability and connection-quality data.

## 2. Constraints

- No DB schema change beyond one idempotent index (`feature_events (session_id, created_at DESC)`)
  needed by the report's lateral join.
- Telemetry stays anonymous: no raw user agent, no IP, no cookies stored with these events. The
  model string is sanitized, capped at 40 chars, and is a mass-market device name, not a person.
- Must never throw or delay first paint: collection is synchronous, the only async step
  (UA-CH model lookup) is raced against a 400 ms timeout.
- `track()` remains a no-op on localhost; the module takes an optional `emit` callback so tests can
  spy without changing production behaviour.

## 3. Architecture

```
+layout.svelte onMount
  initializePreferences(); startTelemetry(); startDeviceProfileTracking();
                                                    │
              ┌─────────────────────────────────────┘
              ▼
  src/lib/client/deviceProfile.js
    collectDeviceProfile()            once/session ──► track('device:profile', {...})
    collectNetworkSnapshot()          ┐
    connection.onchange / visibility  ┘ debounced 1.5s, bucket-compare,
                                        cap 10/session ──► track('net:change', {...})
              │
              ▼
  existing pipeline: queue → POST /api/telemetry → feature_events (props JSONB, session_id)
              │
              ├── scripts/telemetry-report.mjs → "Device & network" section + coverage gate
              └── GET /api/admin/device-network → /admin "Device & network" card
```

No server ingestion changes: both events are plain allowlisted names with small props. The server
already persists `props` JSONB and `session_id`, which is the join key for correlation.

## 4. Device profile

`collectDeviceProfile()` returns an object with every field guaranteed present (never throws):

| field        | values                                                          | source                                                     |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `tier`       | `low` / `mid` / `high` / `unknown`                              | derived (§4.1)                                             |
| `ramGb`      | `0.25`, `0.5`, `1`, `2`, `4`, `8`, `unknown`                    | `navigator.deviceMemory` (Chrome rounds down to a power of 2, caps at 8) |
| `cores`      | `2`, `3-4`, `5-6`, `7-8`, `8+`, `unknown`                       | `navigator.hardwareConcurrency`                            |
| `model`      | sanitized lowercase string ≤ 40 chars, `unknown`                | UA-CH `model`, UA fallback                                 |
| `android`    | major version string, e.g. `13`, `unknown`                      | UA-CH `platformVersion`, UA fallback                       |
| `screen`     | `compact` (<360px), `regular` (360–419), `large` (≥420)         | `screen.width` in CSS px                                   |
| `dpr`        | `1`, `1.5`, `2`, `3+`, `unknown`                                | `devicePixelRatio`                                         |
| `platform`   | `android` / `ios` / `web` / `unknown`                           | UA-CH `platform` or UA                                     |
| `standalone` | boolean                                                         | `display-mode: standalone` or Capacitor native             |
| net fields   | §5                                                              | `navigator.connection`                                     |

### 4.1 Tier rule (RAM-primary, deterministic)

- RAM known: `≤ 2` → `low`; `= 4` → `mid`; `= 8` → `high`.
- RAM unknown, cores known: `≤ 4` → `low`; `≥ 5` → `mid`.
- Otherwise → `unknown`. Cores alone never yields `high` (budget MediaTek SoCs report 8 cores).

### 4.2 Model capture

Chrome's UA reduction replaces the Android device model with `"K"`, so the UA string is only a
fallback. Primary path:

```js
Promise.race([
  navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']),
  timeout(400),
]);
```

The single `device:profile` event is emitted after the race settles (≤ 400 ms), so it always
carries the best available model/version. Fallback UA regex: `/Android\s+([\d.]+);\s*([^;)]+)/i`,
rejecting `K`, `wv`, locale-like tokens, and `Build/...`. Sanitize: lowercase, keep
`[a-z0-9 ._-]`, collapse whitespace, slice to 40 chars.

## 5. Network capture

`collectNetworkSnapshot()` uses `navigator.connection || mozConnection || webkitConnection`; with no
API, all fields are `unknown`/omitted (iOS Safari, Firefox) and the event is still emitted.

| field  | values                                                                        |
| ------ | ----------------------------------------------------------------------------- |
| `type` | `slow-2g` / `2g` / `3g` / `4g` / `unknown` (from `effectiveType`)             |
| `down` | `lt025`, `025-05`, `05-1`, `1-2`, `2-5`, `5-10`, `10p`, `unknown` (Mbps)      |
| `rtt`  | `lt100`, `100-200`, `200-400`, `400-800`, `800-1500`, `1500p`, `unknown` (ms) |
| `save` | boolean; omitted when the API is unavailable                                   |
| `wifi` | `wifi` / `cellular` / `unknown` (from `connection.type` where supported)      |

Downlink is quantized to 25 kbps and capped at 10 Mbps by the browser; RTT is quantized to 25 ms
and capped at 3000 ms. The report presents buckets, never raw values, and documents the cap.

### 5.1 Emission lifecycle

`startDeviceProfileTracking(emit = track)`:

1. Guard on `window`/`navigator` and a module-level `started` flag; safe to call once per session.
2. Emit exactly one `device:profile` (device fields + current net snapshot, flat props).
3. Subscribe to `connection.onchange`; also re-check on `visibilitychange` → visible.
4. Each check is debounced 1.5 s and emits `net:change` only when the tuple
   `(type, down, rtt, save)` differs from the last emitted snapshot.
5. Cap `net:change` at 10 per session; after the cap, listeners are removed.

## 6. Reporting

New section in `scripts/telemetry-report.mjs`, windowed by `--days`, printed after the generation
sections:

1. **Device mix (per identity)** — `DISTINCT ON (COALESCE(user_id::text, client_id))` latest
   profile per identity, grouped by `tier` with percentages.
2. **Top low-tier models** — model × Android version among `tier = 'low'` identities, top 10.
3. **Network mix (worst observed per session)** — sessions bucketed by their worst `type`, worst
   `down` bucket, and worst `rtt` bucket across `device:profile` + `net:change` rows.
4. **Generate outcomes by downlink bucket** — lateral join to the nearest prior
   `device:profile`/`net:change` row in the same session for each `generate:success` /
   `generate:fail`: started, succeeded, failed, fail %, avg fail `elapsedSeconds`.
5. **Supported floor** — sessions sorted by worst downlink bucket: the bucket at the 10th
   percentile, plus the p90 RTT bucket and the failure rate at or below the downlink bucket,
   printed as one line:
   `Supported floor: downlink 0.5-1 Mbps · RTT <=400 ms — covers 90% of sessions; generate failure at or below: X%`
   (effective type stays in the network-mix table; the floor is expressed in bandwidth because
   that is the number the product must support).

### 6.1 Coverage quality gate (strict)

`device:profile` sessions ÷ `page:view` sessions in the window must be ≥ 80%; passes vacuously when
the window has no `page:view` sessions. This catches instrumentation breakage (e.g. a layout change
that stops the tracker) before the weekly automation reports silently wrong distributions.

## 7. Admin

- `getDeviceNetworkStats({ days })` in `storage.js` (parameterized read-only queries, `days` capped
  at 90 like `getFeatureUsageStats`) returns `{ identities, tiers, topLowModels, network, downlink,
  rtt, generateByDownlink, floor }`.
- `GET /api/admin/device-network?days=30` mirrors `/api/admin/feature-usage`: admin auth +
  rate limit, 500 on error.
- `/admin` card: tier table, network table, generate-by-downlink table, floor line. English-only
  per AGENTS.md.

## 8. Privacy, docs, i18n

- `privacyItemAnalyticsBody` in `english.json` and `hindi.json` extended to state that anonymous
  device-capability and connection-quality characteristics are collected to tune performance.
  No other copy changes.
- `docs/telemetry.md`: document both events (props table), the report section, the coverage gate
  (gates table), and add a weekly-checklist item ("Device & network — tier/network mix, coverage
  gate, failures by network").

## 9. Testing

Test-first (repo rule: enumerate failure modes, then write code):

- `src/lib/client/deviceProfile.test.js` (vitest, mirrors `telemetry.test.js` stubbing style):
  - missing `deviceMemory`/`hardwareConcurrency`/`connection` → `unknown`, no throw
  - RAM values `0.25…8` and >8 → correct buckets; tier table (`low`/`mid`/`high`/`unknown`)
  - downlink boundaries `0.24/0.25/0.5/1/2/5/10/12`, RTT boundaries `99/100/200/400/800/1500/3000`
  - UA fallback: Chrome-reduced `"K"` rejected; hostile UA strings sanitized, ≤ 40 chars
  - `getHighEntropyValues` rejects and hangs → UA fallback, still emitted within the timeout
  - lifecycle: one `device:profile` per start; unchanged buckets → no `net:change`; changed tuple →
    one event; debounce collapses flaps; 10-event cap then listeners removed
- `tests/e2e/device-profile.e2e.js` (Playwright, real Chrome, dev server):
  - `addInitScript` stubs (`deviceMemory: 1`, `hardwareConcurrency: 4`,
    `connection: { effectiveType: '3g', downlink: 0.7, rtt: 350, saveData: false }`); import the
    collector from the dev server and assert exact buckets (`tier: 'low'`, `type: '3g'`,
    `down: '05-1'`, `rtt: '200-400'`)
  - spy `emit` → one `device:profile`; flip `effectiveType` to `2g` and dispatch `change` →
    one `net:change` (the 10-event cap is unit-tested; driving it in a browser would need 15 s of
    debounce waits)
  - home page loads with the stub and zero console errors (wiring guard)
- Verification: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, then
  `npm run telemetry:report -- --days=30` (read-only; empty tables and a vacuous-pass gate are
  expected until real traffic arrives).

## 10. Files

| File                                             | Change                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `src/lib/client/deviceProfile.js`                | new — collectors + lifecycle                  |
| `src/lib/client/deviceProfile.test.js`           | new — test-first unit suite                   |
| `src/lib/shared/telemetryEvents.js`              | add `device:profile`, `net:change`            |
| `src/routes/+layout.svelte`                      | call `startDeviceProfileTracking()`           |
| `src/lib/server/storage.js`                      | session index + `getDeviceNetworkStats`       |
| `src/routes/api/admin/device-network/+server.js` | new — admin read endpoint                     |
| `src/routes/admin/+page.svelte`                  | "Device & network" card                       |
| `scripts/telemetry-report.mjs`                   | new section + coverage gate                   |
| `src/lib/locales/{english,hindi}.json`           | privacy analytics string                      |
| `docs/telemetry.md`                              | events, section, gate, checklist              |
| `tests/e2e/device-profile.e2e.js`                | new — browser-level suite                     |

## 11. Risks and mitigations

| Risk                                              | Impact | Mitigation                                                        |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| UA-CH unavailable (WebView, Firefox, Safari)      | Low    | Fallback UA parse; `unknown` fields; coverage gate catches breakage |
| Connection API absent (iOS)                       | Low    | `unknown` net fields; distribution reports them separately        |
| `net:change` flapping on weak signal              | Low    | 1.5 s debounce + bucket compare + 10/session cap                  |
| Lateral join slow on large tables                 | Med    | Windowed `event` + `created_at` filters; new `session_id` index   |
| Model string treated as PII                       | Low    | Mass-market device name, sanitized, capped; privacy copy updated  |
| Report math on buckets misread as exact speeds    | Med    | Print bucket ranges and a note that browsers quantize/cap values  |

## 12. Out of scope

- Automatic adaptation (auto data-saver, lighter payloads) based on tier/network — follow-up once
  the data exists.
- Server-side user-agent parsing or storing raw UA with these events.
- Changes to Vercel Analytics gating.
