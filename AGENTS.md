# AGENTS.md

This repo is a Next.js app using the App Router. This document gives onboarding/setup steps, code-style and architectural notes, and recommendations for agents working on the project.

## Quick setup
- Install dependencies

	```bash
	npm install
	```

- Start dev server

	```bash
	npm run dev
	```

- Run tests (if present)

	```bash
	npm test
	```

## Recommended environment
- Node.js: 18.x or 20.x (match project's engines if set)
- NPM (or pnpm/yarn if you prefer, but update scripts accordingly)

## Project scripts (common)
- `npm run dev` – start Next.js dev server
- `npm run build` – production build
- `npm run start` – start built app
- `npm run lint` – run ESLint

Check `package.json` for exact script names.

## Code style and conventions
- JavaScript (ES2020+) and React functional components
- Use single quotes and no semicolons (project lint enforces this)
- Keep components small and stateless where possible; prefer hooks for state
- Add JSDoc or inline comments for non-obvious logic

## Next.js / App Router guidance
- The app uses the App Router (`src/app`). Prefer server components by default and mark components with `"use client"` only when they need browser APIs, state, or event handlers.
- Server components must not pass event handler props to client components. If you need to attach DOM event handlers (for example, onload handlers for a link element), either:
	- use a small client component that handles the DOM interaction, or
	- use a safe inline script in the `<head>` (carefully) to setup client-only behavior

- Layouts and pages should export metadata where possible (see `src/app/layout.js`). Avoid heavy client-only libraries in server components.

## CSS & third-party CSS (Bootstrap)
- To avoid shipping large CSS inside client bundles, the project loads Bootstrap from a CDN.
- To prevent Lighthouse render-blocking warnings, use a non-blocking pattern:
	- Preferred: create the preload+onload link from client-side JS (or a tiny Client Component) so you don't pass event handler props from a Server Component.
	- Fallback: include a `<noscript>` stylesheet link so users without JS still get styles.

Example (pattern used in this project):
- Inline script that creates a `link[rel=preload][as=style]`, sets `onload` to swap `rel` to `stylesheet`, and appends it to `document.head`.
- Keep a `<noscript><link rel="stylesheet" href="..."></noscript>` fallback.

## Service worker / PWA notes
- Service worker registration is done from the client (see `src/app/layout.js`). Keep registration in client code or inside a `useEffect` in a client component so it's only executed in the browser.

## Accessibility & performance
- Ensure interactive controls have accessible labels and keyboard support.
- Lazy-load non-critical components (e.g., analytics, heavy charts) using dynamic imports
- Use Next.js image optimizations where possible (or `<img loading="lazy">` for static images)

## Testing & validation
- Run `npm run lint` regularly
- Add unit tests for critical utilities and components
- Consider adding a lightweight Lighthouse audit in CI to catch performance regressions

## Troubleshooting
- "Event handlers cannot be passed to Client Component props" — this occurs when trying to pass an inline handler (like `onLoad`) from a server component to an element that expects a client-side handler. Fix by moving that logic into a Client Component or an inline client-side script.
- If Bootstrap/CSS shows FOUC or delayed styles: verify the preload script is correct and the `<noscript>` fallback exists

## Local development tips
- Use `next dev` to run the local server. If you make changes to server components or the routing, the dev server will hot-reload but sometimes full restart helps.
- When testing PWA or service worker behavior, use an Incognito window to avoid cached SW registrations.

## Deployment
- Build with `npm run build` and deploy the `.next` output on Vercel, Netlify, or your preferred host. For Vercel, default settings for Next.js App Router work out-of-the-box.

---
If you'd like, I can also add a short CONTRIBUTING.md with contributor guidelines, or add a tiny Client Component to centralize the Bootstrap preload logic for clarity. Tell me which you'd prefer and I'll implement it.