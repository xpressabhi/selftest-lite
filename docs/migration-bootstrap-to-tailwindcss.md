# Migration Plan: Bootstrap to Tailwind CSS

This migration is complete: Selftest-lite uses Tailwind CSS in its SvelteKit application and no longer installs or loads Bootstrap.

## Why Tailwind CSS?
Tailwind provides a utility-first CSS framework that allows for rapid UI development while maintaining a small production footprint. Unlike Bootstrap, which comes with pre-designed components that can be heavy, Tailwind allows us to build custom, lightweight designs directly in our component files.

## Migration Strategy

### Phase 1: Environment Setup
- Install and configure `tailwindcss`, `postcss`, and `autoprefixer`.
- Ensure the content paths cover all source directories (e.g., `./src/**/*.{js,ts,jsx,tsx}`).
- Configure Tailwind's PostCSS integration for SvelteKit.

### Phase 2: Component Audit & Style Mapping
- Identify core Bootstrap components currently in use: `Container`, `Card`, `Button`, `Modal`, `Alert`, `Badge`, etc.
- Map these to Tailwind utility equivalents:
  - **Buttons**: `bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded ...`
  - **Cards**: `bg-white shadow-md rounded-lg p-4 border border-gray-200`
  - **Grids**: Use `grid`, `flex`, and `gap` utilities.

### Phase 3: Incremental Migration
We will migrate the application in stages to minimize regression risk:
1. **Low Impact Components**: Replace Buttons, Badges, and Icons.
2. **Layout Elements**: Convert `Container`, `Row`, and `Col` to Flex/Grid systems.
3. **Stateful Components**: Rewrite `Modal`, `Accordion`, and `Alert` using custom logic or Headless UI.

### Phase 4: Verification & Cleanup
- Run existing tests (Playwright) to ensure functionality remains unchanged.
- Perform a manual audit of mobile responsiveness and "Data Saver" behavior.
- Remove the `bootstrap` and `react-bootstrap` dependencies from `package.json`.
- Audit the SvelteKit routes and shared styles for any remaining external Bootstrap imports.

## Success Criteria
- Reduced CSS bundle size (measured via performance profiling).
- Consistent UI across all devices without breaking current layouts.
- Successful execution of all existing test cases.
