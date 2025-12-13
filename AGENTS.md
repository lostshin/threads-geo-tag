# Repository Guidelines

## Project Structure & Module Organization

- `chrome-extension/` contains all extension code and assets.
  - `manifest.json` (Manifest V3) defines permissions, scripts, and UI entrypoints.
  - `background.js` is the service worker (ES module) coordinating tabs, cache, and messaging.
  - `content.js` injects into `threads.com` pages to scan users and render tags.
  - `queryManager.js` centralizes queueing, caching, and concurrent query control.
  - `injected.js` intercepts Threads API responses to capture user region data.
  - `popup.html`, `popup.js`, `popup.css` implement the popup UI with queue status display.
  - `sidepanel.html`, `sidepanel.js`, `sidepanel.css`, and `sidepanel-loader.js` implement the Side Panel UI.
  - `icons/` holds extension icons.
- No separate build or test directories; the extension runs directly from source.

## Key Features (v1.0.5)

### Query Methods
- **關閉 (Off)**: Manual query only via label buttons
- **API**: Fast method using intercepted API data (<1s)
- **開分頁 (Tab)**: Opens profile page to scrape "Based in" field (3-5s)

### New User Marking 🆕
- Users who joined within **2 months** are marked with a red `[新]` tag
- Hover over the tag to see the exact join date
- Uses `dateUtils.js` for multi-language date parsing (EN/ZH/JA/KO)
- Join date is cached alongside region data

### Duplicate Query Prevention (Multi-layer)
1. **Cache Check**: Skip if region data already cached
2. **URL Cooldown (60s)**: Prevent same user query within 60 seconds
3. **pendingQueries Set**: Track users currently being queried
4. **Queue Check**: Prevent duplicate entries in queue
5. **chrome.tabs.query**: Reuse existing profile tabs

### Region Label Handling
- Users with "Based in" field → Display actual region (colored label)
- Users without "Based in" field → Display "未揭露" (gray label)
- Cache "未揭露" to prevent repeated queries

### Queue Status Display
- Real-time queue length and active count in popup
- Log of recent query activities with timestamps
- Color-coded status: pending (yellow), success (green), error (red)

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
  - Test "未揭露" handling with users who haven't set a location.
  - Verify queue status display updates in real-time in popup.

## Commit & Pull Request Guidelines

- Commits in this repo are short, descriptive, and often written in Chinese; keep the same clarity and scope.
- Prefer one logical change per commit (e.g., “修正 AI 回傳資料處理機制”).
- PRs should include:
  - A brief description of the problem and solution.
  - Steps to manually verify.
  - Screenshots/GIFs for Side Panel or label UI changes.
  - Linked issues if applicable.

## Developer Preferences

Based on the project owner's coding habits:

### Language & Localization
- UI text and comments use **繁體中文（台灣用語）**
- Error messages and logs can be in Chinese for user-facing content
- Code variable names remain in English

### Development Workflow
- **Incremental testing**: Test after each small change, report specific bugs
- **Version updates**: AI 應在每次修復後自動更新 `popup.html` 中的版本號（格式: v1.0.x）
- **Targeted fixes**: Prefer focused, minimal changes over large refactors
- **No unnecessary docs**: Avoid creating redundant documentation files

### UI/UX Preferences
- Use **emoji** in UI elements (e.g., 🏷️ 小黃標, 📊 隊列狀態)
- Provide **real-time feedback** to users (queue status, progress logs)
- Dark theme with modern styling (glassmorphism, gradients)
- Console logs with clear prefixes like `[Threads]`, `[QueryManager]`, `[Cache]`

### Code Style
- Add Chinese comments for complex logic sections
- Use descriptive log messages that explain what's happening
- Prefer async/await over callbacks
- Group related code with section comments like `// ==================== 區塊標題 ====================`

### Debugging Habits
- Rich console logging with context (username, counts, timing)
- Visual feedback in UI for debugging (queue status display)
- Prefer fixing root causes over adding workarounds
