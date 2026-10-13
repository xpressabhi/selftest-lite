## scope.included

- Results hero: share control removed from .hero-top and placed below the score cluster as a labeled secondary button.
- Styles: bordered pill (min-height 44px) and a sheet centered under the button.
- New resultsShareCta locale key in English and Hindi.

## scope.excluded

- Behavior changes to the share sheet, focus handling, dismissal or print hiding.
- Any other share surface (test page, streak card).
- Test changes.

## preserved

- Class names and the ARIA contract stay on the same roles, so existing share specs pass unchanged.

## decisions

- Keep classes/ids rather than restyling in place so the move is provably behavior-preserving.
- Label the button instead of enlarging the icon: discoverability was the problem.
- Secondary styling so the practice CTA stays the single primary action.

