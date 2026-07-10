# SvelteKit Migration Roadmap

This document outlines the remaining tasks required to complete the migration from Next.js to SvelteKit, ensuring full visual and functional parity with the original application.

## 🔴 High Priority

### 1. Localization Wiring (English & Hindi)
- **Goal**: Ensure all UI text is pulled from locale files rather than hardcoded strings.
- **Files involved**: `src/app/locales/english.json`, `src/app/locales/hindi.json`.
- **Tasks**:
  - Identify all hardcoded strings in the new Svelte components (Home, Test, Results, History).
  - Map these to keys in the locale files.
  - Implement a `<% i18n.t('key') %>` style helper if not already present to handle switching.

### 2. PWA & Offline Behavior
- **Goal**: Fully functional Progressive Web App experience.
- **Tasks**:
  - Configure `vite-plugin-pwa` for service worker registration.
  - Implement the "Install" prompt (triggered only after `beforeinstallprompt` event).
  - Create logic to detect offline status and show the standard offline banner from `MobileOptimizedLayout`.
  - Ensure the app shell loads while browsing other tabs/offline (Cache-First strategy for assets).

### 4. API & Database Migration
- **Goal**: Port Next.js API routes and ensure DB connectivity.
- **Tasks**:
  - Migrate `/api/generate` and `/api/explain` logic to SvelteKit server routes (`+server.js`).
  - Verify `@neondatabase/serverless` connection remains stable in the new environment.



### 4. Navigation & Layout Parity
- **Goal**: Port the "Mobile-First" design system exactly.
- **Tasks**:
  - **TopNav & BottomNav**: Ensure they match the React Bootstrap styling (Fixed positioning, bottom placement for mobile).
  - **Tap Targets**: Verify all interactive elements meet the 44x44px minimum target.
  - **MobileOptimizedLayout**: Ensure the layout handles PWA/Toast/Navigation integration correctly.

### 5. Placeholder Pages & Blog Support
- **Goal**: Migrate static content and SEO-critical pages.
- **Pages to port**:
  - `/bookmarks`, `/about`, `/contact`, `/privacy`, `/terms`, `/faq`.
  - `/blog` (List view) and `/blog/[slug]` (Detail view).
- **Tasks**:
  - Ensure all links are preserved to maintain SEO.
  - Port the metadata/link structure from the original React components.

### 6. Toast System & Connection Banners
- **Goal**: Global communication UI.
- **Tasks**:
  - Migrate the global toast state management for success/error/info messages.
  - Add a "Slow Connection" banner that appears when `isSlowConnection` is true (via `useDataSaver` logic).

### 7. Bookmark & Print Helpers
- **Goal**: Utility features.
- **Tasks**:
  - Create the UI for saving specific tests to bookmarks.
  - Implement printing/sharing helpers (Print CSS, Web Share API).

### 8. Mermaid & Diagram Rendering
- **Goal**: Complex content rendering.
- **Tasks**:
  - Integrate `mermaid` rendering within the `MarkdownRenderer`.
  - Ensure it is lazy-loaded to protect performance on low-end devices.

---

## 🟢 Low Priority / Polish

### 9. Achievement & Streak Systems
- **Goal**: Gamification elements.
- **Tasks**:
  - Verify logic for tracking consecutive test completions.
  - UI display for streaks and achievements during the results review.

### 10. Adsense & Analytics
- **Goal**: Traffic monitoring and monetization.
- **Tasks**:
  - Re-inject AdSense scripts into `+layout.svelte`.
  - Replace Next.js `Analytics` (speed insights) with a SvelteKit equivalent or manual tracking tags.

---

## ✅ Verification Checklist
*(Perform after each major task)*
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Verify 320px, 375px, 414px breakpoints on mobile viewports.
- [ ] Verify local-first history, bookmarks, preferences, and attempts persist across reloads.
- [ ] Validate DataSaver (Slow 3G) behavior.
