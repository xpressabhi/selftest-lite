# Selftest-lite - Project Summary

## Overview

**Selftest-lite** is a Next.js web application that generates AI-powered multiple-choice quizzes on any topic using the Google Gemini API. Users can describe the topic they want to learn about, and the app generates a customized test with instant feedback, answer review, and AI-generated explanations.

**Live URL:** https://selftest.in

---

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16.1.6 (App Router) |
| Frontend | React 19.2.4 |
| UI Library | React Bootstrap 2.10.10 |
| Styling | Bootstrap 5.3.8 (CDN) + Custom CSS |
| AI/ML | Google Gemini API (`@google/genai` 1.39.0) |
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
└── utils/
    ├── prompt.js          # Gemini prompt templates
    └── rateLimiter.js     # Rate limiting utility
```

---

## Key Features

### 1. Quiz Generation (`/api/generate`)
- Accepts topic, difficulty, question count, and language
- Uses Google Gemini 3 Flash model (preview) with structured JSON output
- Utilizes `thinkingConfig` (minimal level) for improved question quality
- Zod schema validation for response structure
- Rate limiting (10 requests per window)
- Automatic retry logic (up to 3 attempts)
- Stores tests in Neon PostgreSQL database (`ai_test` table)

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
- AI-powered explanations for each question
- Retry wrong answers feature
- Generate similar quiz feature
- Social sharing and printing options

### 4. History & Persistence
- Local storage for test history
- Favorites/bookmarks system
- Test ID-based sharing
- Offline support indicator

### 5. Multi-language Support
- English, Hindi, Spanish language options
- UI language switching via LanguageContext
- Quiz generation in selected language

### 6. PWA & UX Enhancements
- Service worker for offline functionality
- Web app manifest
- Icons for iOS/Android home screen
- Pull-to-refresh on mobile devices
- Toast notification system for feedback
- Data saver mode for slow connections
- Offline and slow connection indicators

---

## Component Architecture

### Core Components

| Component | Purpose |
|-----------|---------|
| `GenerateTestForm` | Quiz creation form with advanced options |
| `TestHistory` | Previous tests listing with favorites |
| `StatsDashboard` | User statistics display |
| `TopNav` | Desktop-friendly top navigation |
| `BottomNav` | Mobile-optimized bottom navigation |
| `MobileOptimizedLayout` | Layout wrapper with PWA/mobile features |
| `MarkdownRenderer` | Renders questions with math/code support |
| `TouchOption` | Mobile-friendly quiz option buttons |
| `PullToRefresh` | Mobile pull-to-refresh interaction |
| `Toast` | Global notification system |
| `Share` | Social sharing functionality |
| `Print` | Print-friendly test export |
| `UnsubmittedTestAlert` | Prompt for unfinished quizzes |
| `OfflineIndicator` | Network status indicator |

### Context Providers

| Context | Purpose |
|---------|---------|
| `LanguageContext` | UI language management |
| `ThemeContext` | Light/dark theme switching |
| `DataSaverContext` | Slow connection optimizations |

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useLocalStorage` | Persist state to localStorage |
| `useBookmarks` | Manage bookmarked questions |
| `useNetworkStatus` | Monitor connection speed/status |
| `useRequestCache` | Cache API requests |

---

## Database Schema

Tests are stored in Neon PostgreSQL with the following structure:

```sql
CREATE TABLE ai_test (
  id SERIAL PRIMARY KEY,
  test JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

The `test` JSONB column contains:
- `topic`: Test topic name
- `questions[]`: Array of question objects
  - `question`: Question text (markdown supported)
  - `options[]`: Answer choices
  - `answer`: Correct answer
  - `explanation`: Optional AI explanation

---

## Environment Variables

```bash
# Required
GEMINI_API_KEY=your_gemini_api_key

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
- Sticky navigation elements
- Responsive layouts with Bootstrap grid
- Bottom sheet navigation on mobile
- Viewport-optimized scaling

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
