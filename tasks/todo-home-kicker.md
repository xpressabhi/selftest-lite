# Home kicker — task list

- [x] 1. E2E first: `tests/e2e/home-layout.e2e.js` (kicker one line, panel top, pitch placement, no shift on typing, /hi)
- [x] 2. HomePage: `.home-kicker` H1 + `p.home-pitch` after the Practice Exams nav; remove hero collapse state/effects/listeners/styles
- [x] 3. Dead tour cleanup: welcome* locale keys, `HOME_TOUR_COMPLETED`, `APP_EVENTS.OPEN_TOUR`
- [x] 4. Full gates: lint, test, check, test:e2e, verify:vercel
- [x] 5. Screenshots (en + hi, 390×844) + spec/tasks committed

Notes:
- Measured panel top 264 → 118; composer 713–777 → 566–630; page 1437 → 1365px.
- Kicker keeps the `homeH1` text so the H1 and Hindi `<title>` stay intact; `homeSeoIntro`
  is the pitch, reused rather than re-added.
