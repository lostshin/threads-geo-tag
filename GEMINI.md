---
description: 小黃標 Chrome Extension 開發規則
activation: always
---

# 🏷️ 小黃標 (Threads Geo-Tag) 工作區規則

## 語言與本地化

- UI 文字與程式註解使用 **繁體中文（台灣用語）**
- 錯誤訊息及 log 可使用中文
- 程式碼變數名稱保持英文
- AI 回答請使用繁體中文

## 開發流程

- **增量測試**: 每次小改動後測試，回報具體 bug
- **版本更新**: AI 每次修復後自動更新 `popup.html` 中的版本號（格式: v1.0.x）
- **針對性修復**: 偏好聚焦、最小化的變更，避免大規模重構
- **不寫多餘文件**: 避免建立多餘的文件

## MCP 工具使用

- **Context7**: 當需要程式碼生成、設定步驟或函式庫/API 文件時，自動使用 Context7 MCP 工具來取得文件，無需用戶明確要求
- 使用流程：先呼叫 `resolve-library-id` 取得正確的 library ID，再呼叫 `get-library-docs` 取得文件

## UI/UX 偏好

- 使用 **emoji** 於 UI 元素（如：🏷️ 小黃標, 📊 隊列狀態）
- 提供 **即時回饋** 給用戶（隊列狀態、進度 log）
- 深色主題搭配現代風格（glassmorphism、漸層）
- Console log 使用清晰前綴：`[Threads]`、`[QueryManager]`、`[Cache]`

## 程式碼風格

- 複雜邏輯區段加入中文註解
- Log 訊息要描述正在發生什麼事
- 偏好 async/await 而非 callback
- 區塊註解格式：`// ==================== 區塊標題 ====================`
- 縮排：2 空格，不用 tab
- 使用分號和單引號

## 命名慣例

- 變數/函數：`camelCase`
- 類別：`PascalCase`
- 常數：`UPPER_SNAKE_CASE`

## 除錯習慣

- 豐富的 console log（帳號、數量、時間）
- UI 視覺回饋方便除錯（隊列狀態顯示）
- 修正根本原因，避免 workaround

## 專案結構

主要檔案位於 `chrome-extension/`:
- `manifest.json` - MV3 設定
- `background.js` - Service worker
- `content.js` - 注入 threads.com 頁面
- `queryManager.js` - 隊列、快取、並發控制
- `injected.js` - API 攔截
- `dateUtils.js` - 日期解析與新用戶判斷
- `popup.html/js/css` - Popup UI（含隊列狀態）
- `sidepanel.*` - Side Panel UI

## 測試方式

無自動化測試，使用手動 QA：
1. 驗證標籤插入/移除
2. 檢查快取行為（Side Panel 顯示/清除快取）
3. 確認自動查詢遵守並發限制
4. 測試「未揭露」處理
5. 驗證隊列狀態即時更新
6. 驗證新用戶 [新] 標籤顯示（2 個月內加入）

## Commit 慣例

- 簡短描述，常用中文
- 一個邏輯變更一個 commit（如："修正 AI 回傳資料處理機制"）
