# SEO baseline & Search Console runbook

Read-only playbook for measuring selftest.in in Google Search Console (GSC).
The site currently has no GSC property, so this is step zero for every future
SEO decision. Nothing here changes code.

## 1. Claim the property (owner task, ~10 minutes)

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
- Expected state: ~96 URLs in English today; the Hindi `/hi` set doubles this
  once the Hindi URL work ships.

## 3. Request indexing (optional)

Sitemap submission is enough for most pages. If a specific page must appear
fast, use URL Inspection → Request Indexing. Do not batch-request all 96
URLs; it adds no value over the sitemap.

## 4. Day-0 baseline (fill in after GSC has data, 2–3 days)

| Field | Value |
| --- | --- |
| Date recorded | |
| Indexed pages | |
| Not indexed: "Discovered – currently not indexed" | |
| Not indexed: "Crawled – currently not indexed" | |
| Not indexed: other / errors | |
| Total impressions (last 28 days) | |
| Total clicks (last 28 days) | |
| Top 5 queries (query, clicks, impressions) | |
| Top 5 pages | |

## 5. Day-14 review

Re-record the table above and compare. Specifically check:

- Did the previously SSV/CSR-only content (blog) start indexing?
- Are exam pages indexed? Any coverage errors pointing at canonical mistakes?
- Do impressions appear for Hindi queries? (Hindi URLs ship separately; if
  Hindi queries show up before that, it confirms demand for the `/hi` work.)
- Which queries have impressions but poor CTR? Those pages need better titles
  or descriptions before new page types are built.

Use this data to pick the next workstream from the spec's out-of-scope list:
exam × subject pages, glossary, tools/converters, comparison pages.

## Notes

- Canonical domain is `https://www.selftest.in`; the apex `selftest.in` should
  301 to `www` (verify once in GSC's URL Inspection, not in this repo).
- Never delete or rename indexed URLs without a redirect; the sitemap and
  canonicals are generated from registries so renames show up automatically in
  the sitemap but still need the redirect entry.
- GSC data is delayed and sampled; treat day-to-day wiggles as noise and
  compare 28-day windows.
