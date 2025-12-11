import { getCachedRegion, getAllCachedRegions, clearCache, getCacheStats, getCachedProfile, saveCachedProfile } from './queryManager.js';
import { checkLLMAvailability, analyzeUserProfile } from './llmAnalyzer.js';

// 將需要的函數掛載到 window 供 sidepanel.js 使用
window.getCachedRegion = getCachedRegion;
window.getAllCachedRegions = getAllCachedRegions;
window.clearCache = clearCache;
window.getCacheStats = getCacheStats;
window.checkLLMAvailability = checkLLMAvailability;
window.analyzeUserProfile = analyzeUserProfile;
window.getCachedProfile = getCachedProfile;
window.saveCachedProfile = saveCachedProfile;

// 動態載入 sidepanel.js，確保 queryManager 已載入
const script = document.createElement('script');
script.src = 'sidepanel.js';
document.body.appendChild(script);
