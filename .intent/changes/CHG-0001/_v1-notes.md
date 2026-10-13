## scope.included

- One-time welcome tour for visitors with no test history, home page only.
- Language step that persists the choice and continues the tour in the chosen language.
- Spotlight steps for composer, example rows, and Daily 5; skip via button, Escape, or backdrop.
- Fill-an-example completion through the existing example-tap path.

## scope.excluded

- API, schema, dependency, and background-job changes.
- Changes to the header language toggle or the paper-language control.

## preserved

- Welcome gallery contract for returning users and tap-to-fill behavior.
- Composer, gradient ring, and planner flows unchanged.
- No pre-existing test is modified, skipped, or deleted.

## decisions

- Spotlight overlay tour chosen over passive animation or coach marks.
- Tour shows once per device; finish, skip, Escape, and backdrop tap all write the flag.
- Language step reuses setLanguage plus twin-URL navigation; module state survives it.
- Test suites are shielded from the overlay via a global storage-state fixture.

