AdSense readiness checklist and integration notes

This file lists steps completed to prepare the site for Google AdSense review and where to add ad code when ready.

Completed changes
- Added content pages: `/about`, `/privacy`, `/terms`, `/contact`, `/faq`, `/blog`, and a sample blog post.
- Added `public/robots.txt` and `public/sitemap.xml` for indexing.
- Updated navbar to link content pages for easy navigation.
- Added basic SEO meta tags in `src/app/layout.js` (viewport, keywords, canonical, favicon).

Next steps for AdSense approval (manual)
1. Verify live deployment over HTTPS with your custom domain (e.g., https://selftest.in).
2. Ensure Privacy Policy and Contact pages are accessible from the main navigation.
3. Wait until site has several content pages (we added initial pages). Add more substantive blog posts if possible.
4. Do NOT place any ads until AdSense gives you the code snippet. When ready, add the AdSense <script> to `src/app/layout.js` inside the <head> or as a top-level script tag.

How to add AdSense script (example)
1. After you get your AdSense code (the <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" data-ad-client="ca-pub-XXXXXXXXXXXX"></script>), add it to `src/app/layout.js` inside the <head> or in the returned JSX above the navbar. Keep it commented until you're ready to show ads.

Accessibility & content quality tips
- Ensure pages are easy to read and not thin on content. Aim for 500+ words on cornerstone pages if possible.
- Have clear navigation and internal linking to content pages.
- Avoid placeholder-only pages during the review.
