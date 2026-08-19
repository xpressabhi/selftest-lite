# Generate Paper Form Redesign

**Goal**: Redesign the generate form to be intuitive, informative, and confidence-inspiring for users aged 12 to professionals — using a unified, AI-assisted flow.

## Design Principles

1. **Remove hesitation** — Smart defaults, reassurance, no wrong choices
2. **Make it fast** — One primary action, type intent and go
3. **Make it beautiful** — Warm & playful tone (Duolingo meets Notion)
4. **Free-form AGI tool** — Works for any learning scenario: exams, interviews, coding, languages, trivia — anything

## Core Concept: The Smart Canvas

The form is reimagined as a **preview**, not a configuration panel. The user types natural language intent. AI parses it into structured params displayed as a live preview card. Every param is an editable chip.

**Unified flow**: No Quiz/Full Exam mode toggle. The system figures out the mode from user intent + context.

---

## Components

### 1. Smart Intent Input

- Large pill-shaped input with gradient border, sparkle icon prefix
- Rotating placeholder examples (5-6 cycling phrases)
- Clickable example chips below the input
- Press Enter or click arrow to parse intent via `/api/parse-intent`
- Shimmer animation while parsing

### 2. Preview Card

- Appears after intent parsing or manual configuration
- Shows topic as heading, subtopic as muted text
- Parameter chips: Questions, Format, Difficulty, Language, Exam (if applicable)
- Tapping a chip opens an inline popover picker
- Generate button with estimated time
- Reassurance text: "You can regenerate anytime if it's not quite right"
- Empty state: friendly "Your test preview will appear here ✨"

### 3. First-Time Welcome Block

- Appears when history is empty (first visit)
- 3-step visual: Type → Preview → Generate
- Example phrases (clickable)
- "Show me an example" button that fills the preview card with demo data
- Dismissible (stored in localStorage)
- After dismissal: tiny `[?]` icon to reopen as tooltip
- Contextual placeholder cycling and microcopy always present

### 4. Quick Start Section

- Shows bookmarked exams and presets as colorful chips
- Quick, tappable shortcuts for returning users
- Same behaviour as current bookmarked section but visually refreshed

### 5. Manual Configuration (below preview card)

- Topic browser with categories (collapsible)
- Exam browser with search/filter/group (collapsible, same data)
- Both accessible for users who prefer manual configuration
- Changing anything here updates the Preview Card chips

---

## Data Flow

```
User types intent
    │
    ▼
POST /api/parse-intent { intent: string }
    │
    ▼
Response: { topic, testType, difficulty, numQuestions, examId?, isFullExam, language, confidence }
    │
    ▼
Preview Card populates with chips
    │
    ▼
User can adjust chips or click Generate
    │
    ▼
POST /api/generate (existing endpoint, same payload)
```

### New API: `POST /api/parse-intent`

- Input: `{ intent: string }`
- Uses Gemini Flash Lite with structured JSON output
- Returns parsed form params + confidence score
- On failure/low confidence: returns defaults, user adjusts manually
- Rate-limited

---

## Implementation Plan

### Step 1: Create reusable components

- `SmartIntentInput.svelte` — the pill input with cycling placeholders
- `PreviewCard.svelte` — the dynamic preview with editable chips
- `WelcomeBlock.svelte` — first-time orientation
- `QuickStart.svelte` — bookmark chips (refreshed)
- `TopicBrowser.svelte` — collapsed manual topic picker
- `ExamBrowser.svelte` — collapsed manual exam picker

### Step 2: Add `/api/parse-intent` endpoint

### Step 3: Rewrite `+page.svelte` to compose new components

### Step 4: Add new locale strings

### Step 5: Polish animations, responsive, data-saver

### Step 6: Test: lint, check, test suite, mobile responsive
