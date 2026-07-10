# Repository Guide

## Scope and workflow

These instructions apply to the entire repository.

- Gather context before editing and keep responses concise.
- Prefer minimal, complete changes over broad refactors.
- Avoid unnecessary comments and dependencies.
- Leave changes uncommitted for manual testing unless asked to continue.
- Do not commit, push, or open a pull request unless explicitly requested.

## Project

This is a dependency-free static Roblox portfolio deployed directly from the repository root.

- `index.html`: page structure, card template, game modal, SEO metadata, and accessibility markup
- `styles.css`: design tokens, components, responsive layout, and reduced-motion behavior
- `script.js`: browser rendering, live data loading, interactions, animations, and canvas effects
- `data/portfolio.json`: editable profile and curated game configuration
- `og-image.png` and `roblox-mark.svg`: source image assets
- `CNAME`: production custom domain

At runtime, `script.js` imports the portfolio JSON, fetches live game details and images through RoProxy, merges the results, sorts games by concurrent players, and refreshes statistics every 90 seconds. There is no backend, database, environment file, or credential setup.

## Development

No install or build step is required. Serve the repository over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Do not use `file://`; the application uses an ES module JSON import.

There is no configured test, lint, or typecheck suite. Run these lightweight checks after relevant edits:

```bash
node --check script.js
python3 -m json.tool data/portfolio.json >/dev/null
```

## Conventions

- Use 2-space indentation.
- Follow the existing JavaScript style: browser-native APIs, `const`, arrow functions, double quotes, and semicolons.
- Keep profile content and game IDs in `data/portfolio.json`; do not duplicate them in JavaScript or HTML.
- Reuse the CSS custom properties in `:root` and the existing responsive and reduced-motion patterns.
- Keep HTML IDs/classes synchronized with JavaScript selectors and CSS rules.
- Preserve semantic HTML, keyboard behavior, focus styles, ARIA attributes, and safe external-link attributes.
- Prefer the current plain HTML/CSS/JavaScript architecture. Do not add a framework, package manager, or build tooling without an explicit need.

## Guardrails

- Treat `CNAME` and the canonical/Open Graph URLs in `index.html` as production configuration.
- RoProxy is an external browser-CORS dependency. Distinguish a service/network failure from a local regression before changing request logic.
- Preserve usable loading, stale-data, and error states when changing the refresh flow.
- The repository root is the deployable artifact; do not add generated build output.
- Modify image assets and `.claude/` configuration only when the task requires it.

## Manual verification

After UI or behavior changes, preview the site and check the affected flow. When applicable, verify:

- desktop and narrow/mobile layouts
- live statistics, loading states, and browser console errors
- game-card mouse, keyboard, carousel, and swipe behavior
- modal open/close, Escape handling, focus behavior, copy-link action, and external links
- reduced-motion behavior

RoProxy data can change or be temporarily unavailable, so report external-data limitations separately from code validation.
