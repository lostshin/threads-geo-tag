# Repository Guidelines

## Project Structure & Module Organization

- `chrome-extension/` contains all extension code and assets.
  - `manifest.json` (Manifest V3) defines permissions, scripts, and UI entrypoints.
  - `background.js` is the service worker (ES module) coordinating tabs, cache, and messaging.
  - `content.js` injects into `threads.com` pages to scan users and render tags.
  - `queryManager.js` centralizes queueing, caching, and concurrent query control.
  - `sidepanel.html`, `sidepanel.js`, `sidepanel.css`, and `sidepanel-loader.js` implement the Side Panel UI.
  - `icons/` holds extension icons.
- No separate build or test directories; the extension runs directly from source.

## Build, Test, and Development Commands

- Local development is “no-build”: edit files under `chrome-extension/`, then reload the unpacked extension.
  1. Open `chrome://extensions/` and enable Developer Mode.
  2. “Load unpacked” → select `chrome-extension/`.
  3. After changes, click “Reload” and refresh any `threads.com` tabs.
- To validate behavior, open `https://www.threads.com`, open the Side Panel, and confirm labels/query flow.

## Coding Style & Naming Conventions

- Language: plain JavaScript (ES modules), HTML, and CSS; keep MV3 compatibility.
- Indentation: 2 spaces, no tabs.
- Semicolons and single quotes are used throughout; follow existing patterns.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.
- Avoid introducing new tooling unless needed; keep dependencies at zero.

## Testing Guidelines

- There is no automated test suite. Use manual QA:
  - Verify label insertion/removal on user lists and profile pages.
  - Check cache behavior via Side Panel “Show/Clear local cache”.
  - Ensure auto-query respects concurrency limits and does not spam tabs.

## Commit & Pull Request Guidelines

- Commits in this repo are short, descriptive, and often written in Chinese; keep the same clarity and scope.
- Prefer one logical change per commit (e.g., “修正 AI 回傳資料處理機制”).
- PRs should include:
  - A brief description of the problem and solution.
  - Steps to manually verify.
  - Screenshots/GIFs for Side Panel or label UI changes.
  - Linked issues if applicable.

