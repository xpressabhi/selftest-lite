# AGENTS.md - Agent Onboarding & Technical Guide

Welcome, Agent! This guide is designed to help you quickly understand the **Selftest-lite** codebase and contribute effectively.

## 🚀 Project Overview
**Selftest-lite** is an AI-powered quiz generation platform built with Next.js (App Router), leveraging the Google Gemini API for content generation and Neon PostgreSQL for persistence.

### Tech Stack Highlights:
- **Framework**: Next.js 16 (App Router)
- **AI**: Google Gemini 3 Flash (via `@google/genai`)
- **Database**: Neon PostgreSQL (via `@neondatabase/serverless`)
- **UI**: React Bootstrap + Custom CSS (Mobile-first)
- **PWA**: `next-pwa` with custom service worker logic

---

## 🏗 Architecture & Key Patterns

### 1. The "Mobile-First" Layout
The entire app is wrapped in `src/app/components/MobileOptimizedLayout.js`.
- **TopNav**: Static desktop-style nav.
- **BottomNav**: Mobile bottom-tab navigation.
- **PWA Features**: Service worker registration, offline/slow-connection banners, and pull-to-refresh are handled here.
- **Toasts**: A global toast system is managed via `MobileOptimizedLayout`.

### 2. AI Quiz Generation (`/api/generate`)
Quizzes are generated via complex prompts in `src/app/api/utils/prompt.js`.
- **Pattern**: The prompt uses structured output (JSON mode) with Zod validation.
- **Thinking**: We use Gemini's `thinkingConfig` (minimal level) to ensure high-quality, non-repetitive questions.
- **Deduplication**: We pass `previousQuestions` to the prompt to avoid duplicate questions for a user.

### 3. Data Persistence
- **Remote**: Every generated test is stored in the `ai_test` table in Neon PostgreSQL.
- **Local**: Test history and user answers are cached in `localStorage` using the `useLocalStorage` hook.

### 4. Styling System
- **Bootstrap**: Loaded via CDN in `layout.js` for performance.
- **Custom CSS**: Unified variables in `src/app/globals.css`. Use CSS variables for colors to support light/dark modes.
- **Animations**: Prefer subtle transforms and transitions for a "premium" feel. Use `shouldReduceAnimations` from `useDataSaver` for low-end devices.

---

## 📱 Performance & Device Support Principles

### 1. Mobile-First, Desktop-Ready
- **Always** design for mobile screens (320px+) first.
- Use `src/app/components/BottomNav.js` for mobile navigation and `TopNav.js` for desktop.
- Ensure all interactive elements have a minimum tap target of **44x44px**. 

### 2. High-End vs. Low-End Devices
- **High-End (iPhone/Pixel)**: Utilize `TouchOption.js` for fluid selections and ensure iOS safe-area-insets are respected in CSS.
- **Low-End (Budget Android)**: 
  - Minimize heavy JS execution.
  - Use `OptimizedSkeleton.js` instead of complex spinners.
  - Respect the `.data-saver` class on `document.documentElement` to disable heavy animations.
  - **Default optimization target**: Assume low-end Android is the baseline device for all new features and refactors.

### 3. Network Resilience (Slow Internet)
- Use `useDataSaver()` hook to detect slow connections (`isSlowConnection`).
- **Optimization Strategy**:
  - Reduce the default number of questions in `GenerateTestForm.js` if data saver is active.
  - Use `HeavyMarkdownRenderer.js` only when necessary; prioritize the lighter `MarkdownRenderer.js`.
  - Display `OfflineIndicator.js` or `slow-banner` from `MobileOptimizedLayout.js` when connectivity drops.
  - Avoid unnecessary client fetches and duplicate API calls; prefer cached/local-first UX when safe.
- **Image Handling**: Always use `loading="lazy"` for non-critical images.

### 4. Output Rendering Fidelity (Generate/Explain APIs)
- **Always** render the full range of output returned by `/api/generate` and `/api/explain` without breaking low-end performance.
- Required support includes:
  - Markdown (lists, emphasis, code blocks)
  - Math/science notation via KaTeX/MathML (`remark-math` + `rehype-katex`)
  - Physics/chemistry symbols and unicode characters (Ω, μ, θ, CO₂, H₂SO₄)
  - Diagrams when present (use a safe renderer and lazy-load heavy diagram libraries)
- Security rule: do not render unsanitized raw HTML from model output.
- Performance rule: diagram/math rendering must degrade gracefully in data-saver mode and on slow devices.


## 🛠 Coding Standards for Agents

- **File Naming**: PascalCase for components (`MyComponent.js`), camelCase for everything else.
- **Semicolons**: **Required**. Use `eslint` to verify (Next.js 16 defaults).
- **Single Quotes**: Preferred.
- **Client/Server Boundary**: 
  - Default to Server Components.
  - Use `"use client"` for components using hooks (`useState`, `useEffect`, `useContext`) or browser APIs.
- **CSS-in-JS**: Use `styled-jsx` within components for component-specific styles when `globals.css` isn't enough.
- **Localization (Mandatory)**:
  - Any new or changed user-facing UI text must be provided in **both English and Hindi**.
  - Store UI strings in `src/app/locales/english.json` and `src/app/locales/hindi.json`; do not hardcode text in components.

---

## 📝 Common Tasks

### Adding a New Page:
1. Create a folder in `src/app/[pagename]/page.js`.
2. Ensure it uses `Container` from `react-bootstrap` for consistent padding.
3. Update `PROJECT_SUMMARY.md` after adding the route.

### Modifying the Prompt:
1. Edit `src/app/api/utils/prompt.js`.
2. Ensure any schema changes are also reflected in the Zod schema in `src/app/api/generate/route.js`.

### Adding a Component:
1. Place it in `src/app/components/`.
2. Use the `Icon.js` component for all SVG icons.
3. If it needs state, mark it as `"use client"`.

---

## 🔐 Environment Variables
Required for local development:
- `GEMINI_API_KEY`: For quiz generation.
- `DATABASE_URL`: Neon PostgreSQL connection string.

---

## 🚦 Verification Checklist
Before submitting a change:
1. [ ] Run `npm run lint`.
2. [ ] Verify mobile responsiveness (check Safari/Chrome mobile view).
3. [ ] Test with "Slow 3G" throttling in DevTools to ensure `DataSaver` triggers.
4. [ ] Verify safe areas on iOS (no content hidden behind notches or home indicators).
5. [ ] If adding an API, check rate limiting in `src/app/api/utils/rateLimiter.js`.
6. [ ] Ensure Google Adsense (`ADSENSE.md`) or PWA features aren't broken.
7. [ ] Validate quiz/explanation rendering for markdown + math/symbol-heavy content.
8. [ ] Validate behavior on low-end Android profile + slow internet (no blocking jank).

---

*Generated by Antigravity - Last Updated: Feb 2026*
