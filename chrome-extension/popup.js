// ==================== Popup 核心邏輯 ====================
// 非 ES Module 版本，相容 dia 瀏覽器

// 獲取 DOM 元素
var keepTabCheckbox = document.getElementById('keepTabCheckbox');
var keepTabFilterContainer = document.getElementById('keepTabFilterContainer');
var keepTabFilterInput = document.getElementById('keepTabFilterInput');
var autoQueryVisibleCheckbox = document.getElementById('autoQueryVisibleCheckbox');
var maxConcurrentInput = document.getElementById('maxConcurrentInput');
var maxConcurrentContainer = document.getElementById('maxConcurrentContainer');
var llmProfileAnalysisCheckbox = document.getElementById('llmProfileAnalysisCheckbox');
var statusBar = document.getElementById('statusBar');
var cacheCount = document.getElementById('cacheCount');
var profileCacheCount = document.getElementById('profileCacheCount');
var showCacheBtn = document.getElementById('showCacheBtn');
var clearCacheBtn = document.getElementById('clearCacheBtn');
var showProfileCacheBtn = document.getElementById('showProfileCacheBtn');
var clearProfileCacheBtn = document.getElementById('clearProfileCacheBtn');
var openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
var apiKeyStatus = document.getElementById('apiKeyStatus');
var apiKeySetIndicator = document.getElementById('apiKeySetIndicator');
var apiKeyInputContainer = document.getElementById('apiKeyInputContainer');
var apiKeySection = document.getElementById('apiKeySection');
var editApiKeyBtn = document.getElementById('editApiKeyBtn');
var clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
var contentOutput = document.getElementById('contentOutput');
var outputSection = document.getElementById('outputSection');

// 全局變數
var currentGetUserListArray = [];
var isAutoQuerying = false;
var shouldStopAutoQuery = false;
var popupPort = null;

// ==================== 初始化 ====================

// 建立持久連接
function initPopupConnection() {
  popupPort = chrome.runtime.connect({ name: 'popup' });
  popupPort.onDisconnect.addListener(function() {
    console.log('[Popup] 連接已斷開');
  });
}

// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', function() {
  initPopupConnection();
  loadSettings();
  updateCacheStats();
  updateProfileCacheStats();
  notifySidepanelOpened();
});

// 通知 content script popup 已開啟
async function notifySidepanelOpened() {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('threads.com')) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'sidepanelOpened' });
      updateStatus('已連接到 Threads 頁面', 'success');
    } else {
      updateStatus('請在 Threads 頁面使用此擴充功能', 'info');
    }
  } catch (error) {
    console.log('[Popup] 通知失敗:', error.message);
    updateStatus('就緒', 'info');
  }
}

// ==================== 輔助函數 ====================

function updateStatus(message, type) {
  type = type || 'info';
  statusBar.textContent = message;
  statusBar.className = 'status-bar ' + type;
}

function updateCacheStats() {
  chrome.runtime.sendMessage({ action: 'getCacheStats' }, function(response) {
    if (response && response.success && response.stats) {
      cacheCount.textContent = response.stats.validCount || 0;
    }
  });
}

function updateProfileCacheStats() {
  chrome.runtime.sendMessage({ action: 'getProfileCacheStats' }, function(response) {
    if (response && response.success && response.stats) {
      profileCacheCount.textContent = response.stats.validCount || 0;
    }
  });
}

// ==================== 設定載入與儲存 ====================

async function loadSettings() {
  try {
    var result = await chrome.storage.local.get([
      'keepTabAfterQuery',
      'keepTabFilter',
      'autoQueryVisible',
      'maxConcurrentQueries',
      'llmProfileAnalysis',
      'openaiApiKey'
    ]);

    // 保留分頁設定
    keepTabCheckbox.checked = result.keepTabAfterQuery || false;
    keepTabFilterContainer.style.display = keepTabCheckbox.checked ? 'flex' : 'none';
    keepTabFilterInput.value = result.keepTabFilter || 'Taiwan';

    // 自動查詢設定
    autoQueryVisibleCheckbox.checked = result.autoQueryVisible || false;
    maxConcurrentContainer.style.display = autoQueryVisibleCheckbox.checked ? 'flex' : 'none';
    maxConcurrentInput.value = result.maxConcurrentQueries || 3;

    // LLM 分析設定
    llmProfileAnalysisCheckbox.checked = result.llmProfileAnalysis || false;
    apiKeySection.style.display = llmProfileAnalysisCheckbox.checked ? 'block' : 'none';

    // API Key 狀態
    if (result.openaiApiKey) {
      apiKeySetIndicator.style.display = 'inline';
      apiKeyInputContainer.style.display = 'none';
    } else {
      apiKeySetIndicator.style.display = 'none';
      apiKeyInputContainer.style.display = 'inline';
    }

  } catch (error) {
    console.error('[Popup] 載入設定失敗:', error);
  }
}

async function saveSetting(key, value) {
  try {
    var obj = {};
    obj[key] = value;
    await chrome.storage.local.set(obj);
  } catch (error) {
    console.error('[Popup] 儲存設定失敗:', error);
  }
}

// ==================== 事件監聽器 ====================

// 保留分頁設定
keepTabCheckbox.addEventListener('change', function() {
  var checked = keepTabCheckbox.checked;
  saveSetting('keepTabAfterQuery', checked);
  keepTabFilterContainer.style.display = checked ? 'flex' : 'none';
});

keepTabFilterInput.addEventListener('change', function() {
  saveSetting('keepTabFilter', keepTabFilterInput.value);
});

// 自動查詢設定
autoQueryVisibleCheckbox.addEventListener('change', function() {
  var checked = autoQueryVisibleCheckbox.checked;
  saveSetting('autoQueryVisible', checked);
  maxConcurrentContainer.style.display = checked ? 'flex' : 'none';

  if (checked) {
    startAutoQuery();
  } else {
    stopAutoQuery();
  }
});

maxConcurrentInput.addEventListener('change', function() {
  var value = parseInt(maxConcurrentInput.value, 10);
  value = Math.max(1, Math.min(10, value || 3));
  maxConcurrentInput.value = value;
  saveSetting('maxConcurrentQueries', value);
  chrome.runtime.sendMessage({ action: 'updateMaxConcurrent', value: value });
});

// LLM 分析設定
llmProfileAnalysisCheckbox.addEventListener('change', function() {
  var checked = llmProfileAnalysisCheckbox.checked;
  saveSetting('llmProfileAnalysis', checked);
  apiKeySection.style.display = checked ? 'block' : 'none';
});

// API Key 管理
openaiApiKeyInput.addEventListener('change', function() {
  var apiKey = openaiApiKeyInput.value.trim();
  if (apiKey) {
    saveSetting('openaiApiKey', apiKey);
    apiKeyStatus.textContent = '已儲存';
    apiKeyStatus.className = 'api-key-status valid';
    // 顯示已設定指示器
    setTimeout(function() {
      apiKeySetIndicator.style.display = 'inline';
      apiKeyInputContainer.style.display = 'none';
      apiKeyStatus.textContent = '';
    }, 1500);
  }
});

if (editApiKeyBtn) {
  editApiKeyBtn.addEventListener('click', function() {
    apiKeySetIndicator.style.display = 'none';
    apiKeyInputContainer.style.display = 'inline';
    openaiApiKeyInput.value = '';
    openaiApiKeyInput.focus();
  });
}

if (clearApiKeyBtn) {
  clearApiKeyBtn.addEventListener('click', function() {
    chrome.storage.local.remove(['openaiApiKey']);
    openaiApiKeyInput.value = '';
    apiKeyStatus.textContent = '已清除';
    apiKeyStatus.className = 'api-key-status';
    apiKeySetIndicator.style.display = 'none';
    apiKeyInputContainer.style.display = 'inline';
  });
}

// 快取操作
showCacheBtn.addEventListener('click', async function() {
  try {
    updateStatus('正在讀取快取...', 'info');
    var response = await chrome.runtime.sendMessage({ action: 'getAllCachedRegions' });

    if (response && response.success) {
      var cache = response.cache || {};
      var entries = Object.keys(cache);

      if (entries.length === 0) {
        contentOutput.value = '（無儲存的資料）';
      } else {
        var output = '共 ' + entries.length + ' 筆資料：\n\n';
        entries.forEach(function(username) {
          var data = cache[username];
          output += '@' + username + ': ' + data.region + '\n';
        });
        contentOutput.value = output;
      }

      outputSection.style.display = 'block';
      updateStatus('已載入 ' + entries.length + ' 筆快取', 'success');
    } else {
      contentOutput.value = '讀取失敗: ' + ((response && response.error) || '未知錯誤');
      updateStatus('讀取失敗', 'error');
    }
  } catch (error) {
    contentOutput.value = '錯誤: ' + error.message;
    updateStatus('讀取失敗', 'error');
  }
});

clearCacheBtn.addEventListener('click', async function() {
  if (confirm('確定要清除所有地區快取嗎？')) {
    try {
      var response = await chrome.runtime.sendMessage({ action: 'clearCache' });
      if (response && response.success) {
        updateCacheStats();
        updateStatus('已清除所有快取', 'success');
      }
    } catch (error) {
      updateStatus('清除失敗: ' + error.message, 'error');
    }
  }
});

showProfileCacheBtn.addEventListener('click', async function() {
  try {
    updateStatus('正在讀取側寫快取...', 'info');
    var response = await chrome.runtime.sendMessage({ action: 'getAllCachedProfiles' });

    if (response && response.success) {
      var cache = response.cache || {};
      var entries = Object.keys(cache);

      if (entries.length === 0) {
        contentOutput.value = '（無儲存的側寫資料）';
      } else {
        var output = '共 ' + entries.length + ' 筆側寫：\n\n';
        entries.forEach(function(username) {
          var data = cache[username];
          output += '@' + username + ': ' + data.profile + '\n';
        });
        contentOutput.value = output;
      }

      outputSection.style.display = 'block';
      updateStatus('已載入 ' + entries.length + ' 筆側寫', 'success');
    } else {
      contentOutput.value = '讀取失敗: ' + ((response && response.error) || '未知錯誤');
      updateStatus('讀取失敗', 'error');
    }
  } catch (error) {
    contentOutput.value = '錯誤: ' + error.message;
    updateStatus('讀取失敗', 'error');
  }
});

clearProfileCacheBtn.addEventListener('click', async function() {
  if (confirm('確定要清除所有側寫快取嗎？')) {
    try {
      var response = await chrome.runtime.sendMessage({ action: 'clearProfileCache' });
      if (response && response.success) {
        updateProfileCacheStats();
        updateStatus('已清除所有側寫快取', 'success');
      }
    } catch (error) {
      updateStatus('清除失敗: ' + error.message, 'error');
    }
  }
});

// ==================== 自動查詢 ====================

function startAutoQuery() {
  isAutoQuerying = true;
  shouldStopAutoQuery = false;
  updateStatus('自動查詢已啟用', 'success');
}

function stopAutoQuery() {
  isAutoQuerying = false;
  shouldStopAutoQuery = true;
  updateStatus('自動查詢已停止', 'info');
}

// ==================== 顯示標籤 ====================

async function showRegionLabels() {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0] || !tabs[0].url || !tabs[0].url.includes('threads.com')) {
      updateStatus('請在 Threads 頁面使用', 'error');
      return;
    }

    var regionData = {};
    currentGetUserListArray.forEach(function(user) {
      if (user.region) {
        regionData[user.account] = {
          region: user.region,
          profile: user.profile || null
        };
      }
    });

    var response = await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'showRegionLabels',
      regionData: regionData
    });

    if (response && response.success) {
      console.log('[Popup] 已顯示 ' + response.addedCount + ' 個標籤');
    } else {
      updateStatus('顯示標籤失敗: ' + ((response && response.error) || '未知錯誤'), 'error');
    }
  } catch (error) {
    console.error('[Popup] 顯示標籤錯誤:', error);
  }
}

// ==================== 監聽來自 background 的消息 ====================

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // 處理頁面滾動事件
  if (request.action === 'pageScrolled') {
    console.log('[Popup] 收到頁面滾動通知');
    // 使用 async IIFE 確保 updateUserList 完成後再執行 showRegionLabels
    (async function() {
      updateUserList(request.users || []);
      await showRegionLabels();
      sendResponse({ success: true });
    })();
    return true; // 保持消息通道開啟以進行異步響應
  }

  // 處理狀態更新
  if (request.action === 'updateStatus') {
    updateStatus(request.message, request.type || 'info');
    sendResponse({ success: true });
    return true;
  }

  // 處理用戶地區查詢結果更新
  if (request.action === 'updateUserRegion') {
    var account = request.account;
    var region = request.region;
    console.log('[Popup] 收到查詢結果更新: ' + account + ' - ' + region);

    var updated = false;
    currentGetUserListArray.forEach(function(user) {
      if (user.account === account || user.account === '@' + account) {
        user.region = region;
        updated = true;
      }
    });

    if (updated) {
      showRegionLabels();
      updateCacheStats();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: '找不到用戶' });
    }
    return true;
  }

  // 處理 LLM 分析請求
  if (request.action === 'processProfileAnalysis') {
    var profileData = request.profileData;
    var analysisAccount = request.account;

    if (profileData && profileData.needAnalysis) {
      processLLMAnalysis(analysisAccount, profileData.userPostContent, profileData.userReplyContent);
    } else if (profileData && profileData.fromCache) {
      // 使用快取結果更新
      currentGetUserListArray.forEach(function(user) {
        if (user.account === analysisAccount || user.account === '@' + analysisAccount) {
          user.profile = profileData.profile;
        }
      });
      showRegionLabels();
    }

    sendResponse({ success: true });
    return true;
  }

  return true;
});

// ==================== LLM 分析 ====================

async function processLLMAnalysis(account, postContent, replyContent) {
  try {
    updateStatus('正在分析 @' + account + ' 的社群行為...', 'info');

    // 呼叫 OpenAI API 進行分析
    var result = await callOpenAIForAnalysis(postContent, replyContent);

    if (result.success) {
      // 更新用戶資料
      currentGetUserListArray.forEach(function(user) {
        if (user.account === account || user.account === '@' + account) {
          user.profile = result.tags;
        }
      });

      // 儲存到快取
      var cleanUsername = account.startsWith('@') ? account.slice(1) : account;
      chrome.runtime.sendMessage({
        action: 'saveCachedProfile',
        username: cleanUsername,
        profile: result.tags
      });

      updateProfileCacheStats();
      showRegionLabels();
      updateStatus('已完成 @' + account + ' 的分析', 'success');
    } else {
      updateStatus('分析失敗: ' + result.error, 'error');
    }
  } catch (error) {
    updateStatus('分析錯誤: ' + error.message, 'error');
  }
}

async function callOpenAIForAnalysis(postContent, replyContent) {
  var storageResult = await chrome.storage.local.get(['openaiApiKey']);
  var apiKey = storageResult.openaiApiKey;

  if (!apiKey) {
    return { success: false, error: 'OpenAI API Key 未設定' };
  }

  var TAG_SAMPLE = "生活帳,生活日常,情緒宣洩,憤世抱怨,攻擊發言,酸言酸語,政治帳,立場鮮明,易怒,惡意嘲諷,人身攻擊,溫暖陪伴,真誠分享,情感支持,理性討論,仇恨言論,觀點交流,社會關懷,同理傾聽,價值探索,個人成長";
  var UF_KEYWORD = "憨鳥,萊爾賴,萊爾校長,綠共,青鳥真是腦殘,賴皮寮,氫鳥,賴清德戒嚴,賴清德獨裁,賴喪,冥禁黨,賴功德";

  var socialContent = '';
  if (postContent) {
    socialContent += '\n\n作者本人貼文:\n' + postContent.substring(0, 4096);
  }
  if (replyContent) {
    socialContent += '\n\n作者回覆他人的貼文:\n' + replyContent.substring(0, 4096);
  }

  if (!socialContent) {
    return { success: false, error: '沒有內容可分析' };
  }

  var systemPrompt = '會依照用戶過去的社群回覆與發文，產出用戶profile標籤的分析程式';
  var userPrompt = '請參考以下所提供的貼文與回覆, 依內容數量排序, 提供五個最貼切描述該用戶社群帳號展現出的風格的標籤 (舉例但不限這些: ' + TAG_SAMPLE + '..). ' +
    '只有當標註「人身攻擊、仇恨言論、統戰言論」，這三個標注，要提供完整的理由。如果有大量使用到統戰用語（' + UF_KEYWORD + '），請標注「統戰言論」。' +
    '\n 重要：請直接輸出 JSON 格式，不要加任何前綴文字或 markdown 標記。格式為：{"tags":[{"tag":"標籤名","reason":"理由"}]}。只能用繁體中文，每個標籤2-5個字。' +
    '\n\n' + socialContent;

  try {
    var response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 2048
      })
    });

    if (!response.ok) {
      var errorData = await response.json().catch(function() { return {}; });
      var errorMessage = (errorData.error && errorData.error.message) || response.statusText;
      throw new Error('OpenAI API 錯誤: ' + response.status + ' - ' + errorMessage);
    }

    var data = await response.json();
    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!content) {
      throw new Error('OpenAI API 回應格式錯誤');
    }

    // 解析 JSON 回應
    var tagEntries = [];
    try {
      var jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      var parsed = JSON.parse(jsonStr);
      if (parsed.tags && Array.isArray(parsed.tags)) {
        parsed.tags.forEach(function(item) {
          var tag = (item.tag || '').trim();
          var reason = (item.reason || '').trim();
          if (tag.length > 0 && tag.length < 6) {
            tagEntries.push({ tag: tag, reason: reason });
          }
        });
        tagEntries = tagEntries.slice(0, 5);
      }
    } catch (jsonError) {
      console.warn('[Popup] JSON 解析失敗，嘗試舊格式:', jsonError);
      content.trim().split(',').forEach(function(entry) {
        var trimmed = entry.trim();
        if (trimmed.length > 0 && trimmed.length < 6) {
          tagEntries.push({ tag: trimmed, reason: '' });
        }
      });
      tagEntries = tagEntries.slice(0, 5);
    }

    var processedTags = tagEntries.map(function(entry) {
      return entry.reason ? entry.tag + ':' + entry.reason : entry.tag;
    }).join(',');

    return { success: true, tags: processedTags };

  } catch (error) {
    console.error('[Popup] OpenAI API 錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ==================== 更新用戶列表 ====================

function updateUserList(users) {
  if (!users || users.length === 0) return;

  var existingDataMap = {};
  currentGetUserListArray.forEach(function(user) {
    existingDataMap[user.account] = user;
  });

  var newArray = [];
  users.forEach(function(user) {
    var account = user.account;
    if (existingDataMap[account]) {
      newArray.push(existingDataMap[account]);
    } else {
      newArray.push({
        account: account,
        region: null,
        profile: null
      });
    }
  });

  currentGetUserListArray = newArray;
  console.log('[Popup] 用戶列表已更新，共 ' + currentGetUserListArray.length + ' 位用戶');
}

console.log('[Popup] 已載入');
