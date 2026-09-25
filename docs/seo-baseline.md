# SEO baseline & Search Console runbook

Read-only playbook for measuring selftest.in in Google Search Console (GSC).
The property is live (`sc-domain:selftest.in`, DNS-verified), so measurement is
current; sections 1–3 stay as reference for re-verifying or adding properties.
Nothing here changes code.

State as of 2026-09-25:

- Apex → `www` is a **permanent 308** domain redirect (Vercel). Before the 308
  it was a temporary 307, which kept apex and `http://` URLs in the index and
  split clicks between `selftest.in` and `www.selftest.in`. Expect the apex
  rows to consolidate onto `www` as URLs are recrawled.
- `sitemap.xml` was submitted but the first read failed ("Couldn't fetch"); the
  file fetches fine from the outside (200, `application/xml`, valid XML, 234
  URLs), so it was resubmitted on 2026-09-25. Recheck before drawing conclusions.
- `/favicon.ico` now serves the icon (it used to 404 and appeared as "Not found
  (404)" in Page indexing). The root copy is covered by `tests/e2e/seo.e2e.js`.
- HTTPS, Security issues and Manual actions report no issues.

## 1. Claim the property (done; keep for reference)

The live property is a Domain property verified by DNS TXT record, which covers
`selftest.in` and `www.selftest.in`. **Keep the apex a permanent redirect to
`www`** (Vercel → Project Settings → Domains → status code 308).

1. Open [Search Console](https://search.google.com/search-console) and add a
   property. Prefer a **Domain** property for `selftest.in`: it covers both
   `selftest.in` and `www.selftest.in` and verifies by DNS TXT record.
   - Alternative: URL-prefix property for `https://www.selftest.in` and verify
     with the HTML meta tag instead.
2. For the meta-tag route:
   - Copy the verification code from GSC → Settings → Verification → HTML tag.
   - Set `GOOGLE_SITE_VERIFICATION` in Vercel → Project → Settings →
     Environment Variables → **Production** (it is read at build time).
   - Redeploy. Prerendered pages bake the tag in during the build; a runtime
     env change alone will not appear.
   - Confirm the tag exists in the page source of
     `https://www.selftest.in/` and `https://www.selftest.in/practice/ssc-cgl`.
3. Click **Verify** in GSC.

## 2. Submit the sitemap

- Sitemaps → Add a new sitemap → `sitemap.xml` (or full URL
  `https://www.selftest.in/sitemap.xml`).
- `robots.txt` already points to it, so GSC usually discovers it on its own —
  submitting just speeds things up.
- Expected state: 234 URLs — every indexable page in English **and** Hindi, with
  reciprocal `hreflang` alternates (117 pages × 2 languages). Hindi pages live
  under `/hi/...` and are real, server-rendered Hindi.

## 3. Request indexing (optional)

Sitemap submission is enough for most pages. If a specific page must appear
fast, use URL Inspection → Request Indexing. Do not batch-request all 117
URLs; it adds no value over the sitemap.

## 4. Day-0 baseline (2026-09-25, GSC data through 2026-09-23)

| Field | Value |
| --- | --- |
| Date recorded | 2026-09-25 |
| Indexed pages | 12 |
| Not indexed: "Discovered – currently not indexed" | 0 |
| Not indexed: "Crawled – currently not indexed" | 1 |
| Not indexed: other / errors | 12 — Alternate page with proper canonical tag 6, Page with redirect 4, Not found (404) 1, Blocked by robots.txt 1 |
| Total impressions (last 28 days) | 432 |
| Total clicks (last 28 days) | 43 |
| Top 5 queries (query, clicks/impressions) | self test 9/57; selftest 7/68; self test quiz 1/1; passport seva 0/63; aadhar card 0/23 |
| Top 5 pages (page, clicks/impressions) | `selftest.in/` 29/193; `www.selftest.in/` 14/92; `http://selftest.in/` 0/158; `selftest.in/about` 0/18; `selftest.in/contact` 0/14 |

Read notes:

- Most top-page impressions sat on apex/`http` variants — the 308 should move
  them onto the `www` rows over the next few weeks.
- Mobile Core Web Vitals: home page only, CLS > 0.1 and LCP > 2.5 s
  (5 URLs need improvement, 0 poor). Desktop: not enough data.

## 5. Day-14 review

Re-record the table above and compare. Specifically check:

- Did the previously SSV/CSR-only content (blog) start indexing?
- Are exam pages indexed? Any coverage errors pointing at canonical mistakes?
- Do impressions appear for Hindi queries? The `/hi` URLs are live now; check
  both the English and Hindi page sets separately in the Pages report.
- Which queries have impressions but poor CTR? Those pages need better titles
  or descriptions before new page types are built.

Use this data to pick the next workstream from the spec's out-of-scope list:
exam × subject pages, glossary, tools/converters, comparison pages.

## Notes

- Canonical domain is `https://www.selftest.in`; the apex `selftest.in`
  permanently redirects (308) to `www` via Vercel domain settings. Keep it
  permanent: a temporary redirect keeps apex URLs in Google's index.
- Never delete or rename indexed URLs without a redirect; the sitemap and
  canonicals are generated from registries so renames show up automatically in
  the sitemap but still need the redirect entry.
- GSC data is delayed and sampled; treat day-to-day wiggles as noise and
  compare 28-day windows.
