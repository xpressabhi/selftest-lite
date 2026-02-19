# Selftest-lite - Project Summary

## Overview

**Selftest-lite** is a Next.js web application that generates AI-powered objective test papers and quizzes using the Google Gemini API. Users can create full exam-style objective papers or quiz-practice tests, attempt them, and review results with on-demand AI explanations.

**Live URL:** https://selftest.in

---

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16.1.6 (App Router) |
| Frontend | React 19.2.4 |
| UI Library | React Bootstrap 2.10.10 |
| Styling | Bootstrap 5.3.8 (CDN) + Custom CSS |
| AI/ML | Google Gemini API (`@google/genai` 1.41.0) |
| Database | Neon PostgreSQL (`@neondatabase/serverless`) |
| State Management | React Context + Local Storage |
| Validation | Zod 4.3.6 |
| Analytics | Vercel Analytics & Speed Insights |
| Markdown | react-markdown + rehype-katex + remark-gfm |
| PWA | next-pwa with service worker |

---

## Architecture

### App Router Structure (Next.js 16)
The application uses the Next.js App Router with the following structure:

```
src/app/
├── layout.js              # Root layout with providers
├── page.js                # Home page (test generator)
├── globals.css            # Global styles
├── test/page.js           # Quiz taking interface
├── results/page.js        # Results & review page
├── history/page.js        # Test history listing
├── bookmarks/page.js      # Bookmarked questions
├── blog/page.js           # Blog listing
├── blog/[slug]/page.js    # Blog post detail
├── about/page.js          # About page
├── contact/page.js        # Contact page
├── faq/page.js            # FAQ page
├── privacy/page.js        # Privacy policy
├── terms/page.js          # Terms of service
```

### API Routes

```
src/app/api/
├── generate/route.js      # POST: Generate quiz via Gemini API
├── explain/route.js       # POST: Generate AI explanations
├── test/route.js          # GET/POST: Test CRUD operations
├── auth/google/route.js   # POST: Google credential sign-in
├── auth/me/route.js       # GET: Resolve active session user
├── auth/logout/route.js   # POST: Logout and clear session
├── user/state/route.js    # GET/POST: User local-state + attempts sync
└── utils/
    ├── prompt.js          # Gemini prompt templates
    └── rateLimiter.js     # Rate limiting utility
```

---

## Key Features

### 1. Quiz Generation (`/api/generate`)
- Accepts topic, difficulty, question count, test mode, and language
- Supports full exam mode (objective-only papers) and quiz-practice mode
- Uses Google Gemini 3 Flash model (`gemini-3-flash`) with structured JSON output
- Utilizes `thinkingConfig` (minimal level) for improved question quality
- Zod schema validation for response structure
- Rate limiting (10 requests per window)
- Automatic retry logic (up to 3 attempts) for transient failures
- No auto-retry when API limits are exceeded
- End-to-end hard timeout at 180 seconds (client + server)
- Stores tests in Neon PostgreSQL database (`ai_test` table)
- Guided create flow on home: `Test ID -> bookmarks -> Create New Test -> mode selection -> configuration`

### 2. Test Taking (`/test`)
- Question-by-question navigation with swipe gestures
- Progress bar and timer
- Answer selection with visual feedback
- Bookmark questions for later review
- Responsive mobile-first design with sticky footer and bottom navigation
- Unsubmitted test preservation and alerts

### 3. Results & Review (`/results`)
- Score display with performance feedback
- Correct/incorrect answer breakdown
- On-demand AI explanations (`/api/explain`, `gemini-2.5-flash-lite`)
- Retry wrong answers feature
- Generate similar quiz feature
- Social sharing and printing options

### 4. History & Persistence
- Local storage for test history
- Favorites/bookmarks system
- Test ID-based sharing
- Offline support indicator
- Hydration-safe localStorage sync to avoid SSR/CSR mismatch issues
- Signed-in state sync to DB for bookmarks, preferences, and history backup
- User attempt sync so results can be restored across sessions/devices

### 5. Multi-language Support
- English and Hindi UI language options
- UI language switching via LanguageContext
- Paper language selection (English/Hindi) for test generation
- Localized new-flow and theme labels in both English and Hindi locale JSON files

### 6. PWA & UX Enhancements
- Service worker for offline functionality
- Web app manifest
- Icons for iOS/Android home screen
- Pull-to-refresh on mobile devices
- Toast notification system for feedback
- Data saver mode for slow connections
- Offline and slow connection indicators
- Top-nav light/dark theme switch (persisted with `ThemeContext`)

### 7. Gamification & Engagement (New)
- **Daily Streak System**: Tracks consecutive days of activity with freeze protection
- **Achievement Badges**: 16 unlockable milestones (First Quiz, Speed Demon, etc.)
- **Performance Analytics**: SVG-based score trend charts and topic breakdown
- **Speed Challenge Mode**: Time-attack mode with countdown timer
- **Celebration Effects**: Confetti, trophy bursts, and sound effects for high scores

### 8. Google Authentication (New)
- Sign in with Google from top navigation account modal
- Server-side verification of Google ID credential before session creation
- Secure HTTP-only session cookie (`selftest_session`)
- Session-backed user identity for generated test ownership (`created_by_user_id`)

---

## Component Architecture

### Core Components

| Component | Purpose |
|-----------|---------|
| `GenerateTestForm` | Quiz creation form with advanced options |
| `TestHistory` | Previous tests listing with favorites |
| `StatsDashboard` | User statistics display |
| `StreakBanner` | Daily streak and activity tracking |
| `AchievementShowcase` | Badges and milestones display |
| `PerformanceChart` | Score trends and analysis |
| `TopNav` | Desktop-friendly top navigation |
| `BottomNav` | Mobile-optimized bottom navigation |
| `MobileOptimizedLayout` | Layout wrapper with PWA/mobile features |
| `UserDataSyncManager` | Syncs localStorage + test attempts to DB for signed-in users |
| `GoogleSignInButton` | Google Identity Services sign-in button wrapper |
| `MarkdownRenderer` | Renders questions with math/code support |
| `TouchOption` | Mobile-friendly quiz option buttons |
| `PullToRefresh` | Mobile pull-to-refresh interaction |
| `Toast` | Global notification system |
| `Share` | Social sharing functionality |
| `Print` | Print-friendly test export |
| `UnsubmittedTestAlert` | Prompt for unfinished quizzes |
| `OfflineIndicator` | Network status indicator |
| `Confetti` | Celebration animations |

### Context Providers

| Context | Purpose |
|---------|---------|
| `LanguageContext` | UI language management |
| `ThemeContext` | Light/dark theme switching |
| `DataSaverContext` | Slow connection optimizations |
| `AuthContext` | Google auth session state |

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useLocalStorage` | Persist state to localStorage |
| `useBookmarks` | Manage bookmarked questions |
| `useNetworkStatus` | Monitor connection speed/status |
| `useRequestCache` | Cache API requests |
| `useStreak` | Manage daily streaks and freezes |
| `useAchievements` | Track and unlock badges |
| `useSoundEffects` | Play audio feedback |

---

## Database Schema

Primary storage uses Neon PostgreSQL with operational tables for tests, auth, sync, and telemetry:

```sql
CREATE TABLE ai_test (
  id BIGSERIAL PRIMARY KEY,
  test JSONB NOT NULL,
  topic TEXT,
  test_type TEXT,
  difficulty TEXT,
  language TEXT,
  num_questions INTEGER,
  created_by_user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user (
  id BIGSERIAL PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture_url TEXT,
  locale TEXT,
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user_session (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user_state (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  storage JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user_test_attempt (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  test_id BIGINT NOT NULL REFERENCES ai_test(id) ON DELETE CASCADE,
  user_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER,
  total_questions INTEGER,
  time_taken INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, test_id)
);

CREATE TABLE api_rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL,
  route TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_request_events (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  action TEXT,
  client_key TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Notes:
- `ai_test.test` keeps full generated quiz payload (topic/questions/options/answer/explanation).
- `ai_test` metadata columns make filtering and analytics cheaper than JSON scans.
- `ai_test.created_by_user_id` links generated papers to authenticated Google users.
- `app_user` stores normalized Google account profile metadata.
- `app_user_session` stores hashed session tokens for HTTP-only cookie auth.
- `app_user_state` stores synchronized local app state (history, bookmarks, preferences) as JSON.
- `app_user_test_attempt` stores user-specific test submissions/results per test ID.
- `api_rate_limit_events` powers DB-backed sliding-window rate limiting across instances.
- `api_request_events` stores API latency/error telemetry for production debugging.

---

## Environment Variables

```bash
# Required
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id_here

# Database (Neon PostgreSQL)
DATABASE_URL=postgres://...
```

---

## File Structure

```
selftest-lite/
├── public/
│   ├── icons/              # PWA icons (192, 512px)
│   ├── manifest.json       # PWA manifest
│   ├── sw.js              # Service worker
│   ├── robots.txt
│   └── sitemap.xml
├── src/
│   └── app/
│       ├── api/           # API routes
│       ├── components/    # React components
│       ├── context/       # React contexts
│       ├── hooks/         # Custom hooks
│       ├── about/         # About page
│       ├── blog/          # Blog pages
│       ├── bookmarks/     # Bookmarks page
│       ├── contact/       # Contact page
│       ├── faq/           # FAQ page
│       ├── history/       # History page
│       ├── privacy/       # Privacy page
│       ├── terms/         # Terms page
│       ├── test/          # Test taking page
│       ├── results/       # Results page
│       ├── constants.js   # App constants
│       ├── globals.css    # Global styles
│       ├── layout.js      # Root layout
│       └── page.js        # Home page
├── .env.example
├── .env.local             # Local secrets (gitignored)
├── eslint.config.mjs
├── jsconfig.json
├── next.config.mjs        # Next.js config with PWA
└── package.json
```

---

## Key Implementation Details

### AI Prompt Engineering
The `prompt.js` utility creates sophisticated prompts for Gemini that include:
- Difficulty-specific instructions
- Question type formatting (multiple-choice, true-false, coding)
- Previous question deduplication
- Language-specific output instructions
- Markdown and LaTeX formatting guidelines

### Performance Optimizations
- Bootstrap loaded from CDN (not bundled)
- Dynamic imports for heavy components
- Lazy loading for MarkdownRenderer
- Data saver mode for slow connections
- Reduced question counts on mobile/slow networks

### Mobile-First Design
- Touch gesture support (swipe between questions)
- Sticky navigation elements (`TopNav`, `BottomNav`)
- Responsive layouts with Bootstrap grid and `clamp()` typography
- Bottom sheet navigation with safe area support
- Enhanced touch targets (min 44px)
- Visual data representation (Icon-based stats, SVG charts)
- Viewport-optimized scaling
- Fluid container spacing

### Security Measures
- Rate limiting on API routes
- Input validation with Zod
- Environment variable isolation
- No sensitive data in client bundles

---

## Development Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev          # Runs on localhost:3000 with Turbopack

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint

# Bundle analysis
npm run analyze      # ANALYZE=true next build
```

---

## Deployment

The application is optimized for deployment on Vercel:
- Serverless functions for API routes
- Edge runtime compatible
- PostgreSQL connection via Neon
- Analytics and Speed Insights integrated

---

## License

MIT License
