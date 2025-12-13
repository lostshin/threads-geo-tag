/**
 * 小黃標 - API 攔截模組
 * 直接從 Threads API 攔截並提取用戶位置資訊
 *
 * Based on Lee-Su-Threads implementation
 * https://github.com/meettomorrow/lee-su-threads
 */

'use strict';

// ========== 設定 ==========
const CONFIG = {
  DEBUG: false,  // 設為 true 可看到詳細日誌
  RATE_LIMIT_MS: 500,  // 每次 API 請求間隔（毫秒）= 每秒 2 次
  MAX_RETRIES: 2        // API 請求失敗時的重試次數
};

// ========== 日誌工具 ==========
function log(...args) {
  if (CONFIG.DEBUG) {
    console.log('%c[小黃標]', 'color: #fbbf24; font-weight: bold;', ...args);
  }
}

function logInfo(...args) {
  console.log('%c[小黃標]', 'color: #fbbf24; font-weight: bold;', ...args);
}

function logError(...args) {
  console.error('%c[小黃標]', 'color: #ef4444; font-weight: bold;', ...args);
}

// ========== Session Tokens 管理 ==========
let sessionTokens = null;

/**
 * 從 API 請求 body 中捕獲 session tokens
 */
function captureSessionTokens(bodyParsed) {
  if (bodyParsed && bodyParsed.fb_dtsg) {
    // 保留已有的 __user（如果新的是 '0'）
    const preservedUser = (bodyParsed.__user && bodyParsed.__user !== '0')
      ? bodyParsed.__user
      : (sessionTokens?.__user || '0');

    sessionTokens = {
      fb_dtsg: bodyParsed.fb_dtsg,
      lsd: bodyParsed.lsd,
      jazoest: bodyParsed.jazoest,
      __user: preservedUser,
      __a: bodyParsed.__a,
      __hs: bodyParsed.__hs,
      __dyn: bodyParsed.__dyn,
      __csr: bodyParsed.__csr,
      __comet_req: bodyParsed.__comet_req,
      __ccg: bodyParsed.__ccg,
      __rev: bodyParsed.__rev,
      __s: bodyParsed.__s,
      __hsi: bodyParsed.__hsi,
      __spin_r: bodyParsed.__spin_r,
      __spin_b: bodyParsed.__spin_b,
      __spin_t: bodyParsed.__spin_t,
      dpr: bodyParsed.dpr,
      __d: bodyParsed.__d
    };

    log('Session tokens 已捕獲！', sessionTokens.fb_dtsg?.substring(0, 20) + '...');

    // 通知 content script tokens 已準備好
    window.dispatchEvent(new CustomEvent('geo-tag-tokens-ready'));
  }
}

// ========== User ID 映射管理 ==========
const userIdMap = new Map();
let pendingNewUserIds = {};

// 從 content script 載入快取的 user IDs
window.addEventListener('message', (event) => {
  if (event.data?.type === 'geo-tag-load-userid-cache') {
    const cachedUserIds = event.data.data;
    let loadedCount = 0;
    for (const [username, userId] of Object.entries(cachedUserIds)) {
      if (!userIdMap.has(username)) {
        userIdMap.set(username, userId);
        loadedCount++;
      }
    }
    if (loadedCount > 0) {
      log(`從快取載入 ${loadedCount} 個 user IDs`);
    }
  }
});

// 廣播新發現的 user IDs（debounced）
let broadcastTimeout = null;
function broadcastNewUserIds() {
  if (broadcastTimeout) clearTimeout(broadcastTimeout);
  broadcastTimeout = setTimeout(() => {
    if (Object.keys(pendingNewUserIds).length > 0) {
      window.postMessage({ type: 'geo-tag-new-user-ids', data: pendingNewUserIds }, '*');
      pendingNewUserIds = {};
    }
  }, 1000);
}

/**
 * 添加 user ID 並排隊廣播
 */
function addUserId(username, userId, source = '') {
  if (!userIdMap.has(username)) {
    userIdMap.set(username, userId);
    pendingNewUserIds[username] = userId;
    broadcastNewUserIds();
    log(`發現用戶 (${source}): @${username} -> ${userId}`);
    return true;
  }
  return false;
}

/**
 * 從 API 回應中遞迴提取 user IDs
 */
function extractUserIds(obj, source = 'unknown') {
  if (!obj || typeof obj !== 'object') return;

  // 尋找含有 id 和 username 的物件
  if (obj.id && obj.username) {
    const userId = String(obj.id);
    const username = String(obj.username);
    if (userId.match(/^\d+$/) && username.match(/^[\w.]+$/)) {
      addUserId(username, userId, 'id');
    }
  }

  // 檢查 pk (primary key)
  if (obj.pk && obj.username) {
    const userId = String(obj.pk);
    const username = String(obj.username);
    if (userId.match(/^\d+$/) && username.match(/^[\w.]+$/)) {
      addUserId(username, userId, 'pk');
    }
  }

  // 檢查巢狀的 user 物件
  if (obj.user && typeof obj.user === 'object') {
    const user = obj.user;
    const userId = String(user.pk || user.id || '');
    const username = String(user.username || '');
    if (userId.match(/^\d+$/) && username.match(/^[\w.]+$/)) {
      addUserId(username, userId, 'nested');
    }
  }

  // 遞迴處理
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (Array.isArray(value)) {
      value.forEach(item => extractUserIds(item, source));
    } else if (typeof value === 'object' && value !== null) {
      extractUserIds(value, source);
    }
  }
}

// ========== Profile 回應解析 ==========

/**
 * 從物件中遞迴提取 profile 資訊
 */
function extractProfileInfo(obj, result = {}) {
  if (!obj || typeof obj !== 'object') return result;

  // 初始化 label-value pairs 收集器
  if (result._pairs === undefined) {
    result._pairs = [];
    result._currentLabel = null;
  }

  // 解析 bk.components.Text
  if (obj['bk.components.Text']) {
    const textComp = obj['bk.components.Text'];
    let text = textComp.text;
    const style = textComp.text_style;
    const onBind = textComp.on_bind;

    // 處理動態文字綁定（如位置隱私）
    if (!text && onBind && typeof onBind === 'string') {
      const match = onBind.match(/"([^"]+)"\s*,\s*"([^"]+)"/);
      if (match) {
        text = match[1];
        // 解碼 Unicode 轉義序列
        text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
      }
    }

    if (style === 'semibold' && text) {
      result._currentLabel = text;
    } else if (style === 'normal' && text && result._currentLabel) {
      result._pairs.push({ label: result._currentLabel, value: text });
      result._currentLabel = null;
    }
  }

  // 解析 bk.components.RichText
  if (obj['bk.components.RichText']) {
    const children = obj['bk.components.RichText'].children || [];
    let fullText = '';
    for (const child of children) {
      if (child['bk.components.TextSpan']) {
        fullText += child['bk.components.TextSpan'].text || '';
      }
    }

    // 嘗試多種模式提取 name/username
    let match = fullText.match(/^(.+?)\s*[（(]@([\w.]+)[)）]$/);
    if (!match) {
      match = fullText.match(/^(.+?)\s*[（(]@([\w.]+)/);
    }
    if (!match) {
      match = fullText.match(/@([\w.]+)/);
      if (match) {
        result.username = match[1];
        const nameMatch = fullText.match(/^(.+?)\s*[（(]@/);
        if (nameMatch) {
          result.displayName = nameMatch[1].trim();
        }
      }
    }
    if (match && match[2]) {
      result.displayName = match[1]?.trim();
      result.username = match[2];
    }
  }

  // 解析頭像
  if (obj['bk.components.Image']) {
    const url = obj['bk.components.Image'].url;
    if (url && url.includes('cdninstagram.com')) {
      result.profileImage = url;
    }
  }

  // 遞迴處理所有屬性
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        extractProfileInfo(item, result);
      }
    } else if (typeof value === 'object' && value !== null) {
      extractProfileInfo(value, result);
    }
  }

  return result;
}

/**
 * 解析 profile API 回應
 */
function parseProfileResponse(responseText) {
  try {
    let jsonStr = responseText;
    // 移除 Meta 的安全前綴
    if (jsonStr.startsWith('for (;;);')) {
      jsonStr = jsonStr.substring(9);
    }

    const data = JSON.parse(jsonStr);
    const profileInfo = extractProfileInfo(data);

    // 處理收集到的 pairs
    if (profileInfo._pairs && profileInfo._pairs.length > 0) {
      const pairs = profileInfo._pairs;

      // 多語言標籤定義
      const joinedLabels = ['Joined', '已加入', '参加日', '가입일', '가입 날짜'];
      const locationLabels = ['Based in', '所在地點', '所在地', '위치', '거주지'];
      const verifiedLabels = ['Verified by Meta', 'Meta 驗證', 'Meta 验证', 'Metaにより認証', 'Meta 인증'];
      const nameLabels = ['Name', '名稱', '名前', '이름'];
      const formerUsernameLabels = ['Former usernames', 'Previous usernames', '先前的用戶名稱', '先前的使用者名稱', '以前のユーザーネーム'];

      // 過濾掉 name 和 former username 欄位
      const relevantPairs = pairs.filter(p =>
        !nameLabels.includes(p.label) && !formerUsernameLabels.includes(p.label)
      );

      // 基於標籤匹配
      const joinedPair = relevantPairs.find(p => joinedLabels.includes(p.label));
      if (joinedPair) {
        profileInfo.joined = joinedPair.value.split(/\s*[·•]\s*/)[0].trim();
      }

      const locationPair = relevantPairs.find(p => locationLabels.includes(p.label));
      if (locationPair) {
        profileInfo.location = locationPair.value;
      }

      const verifiedPair = relevantPairs.find(p => verifiedLabels.includes(p.label));
      if (verifiedPair) {
        profileInfo.isVerified = true;
        profileInfo.verifiedDate = verifiedPair.value;
      }

      // 備用：基於位置匹配（如果標籤不匹配）
      if (!joinedPair && relevantPairs.length >= 1) {
        profileInfo.joined = relevantPairs[0].value.split(/\s*[·•]\s*/)[0].trim();
      }

      if (!locationPair && relevantPairs.length >= 2) {
        const secondPair = relevantPairs[1];
        if (!verifiedLabels.includes(secondPair.label)) {
          profileInfo.location = secondPair.value;
        }
      }
    }

    // 清理內部屬性
    delete profileInfo._pairs;
    delete profileInfo._currentLabel;

    return profileInfo;
  } catch (e) {
    logError('解析 profile 回應失敗:', e);
    return null;
  }
}

// ========== Fetch 攔截 ==========
const originalFetch = window.fetch;

window.fetch = async function(...args) {
  const url = args[0]?.url || args[0];
  const options = args[1] || {};

  // 捕獲 session tokens
  if (options.body) {
    try {
      let bodyParsed = null;
      if (options.body instanceof URLSearchParams) {
        bodyParsed = Object.fromEntries(options.body.entries());
      } else if (typeof options.body === 'string' && !options.body.startsWith('{')) {
        bodyParsed = Object.fromEntries(new URLSearchParams(options.body).entries());
      }
      if (bodyParsed) {
        captureSessionTokens(bodyParsed);
      }
    } catch (e) { /* ignore */ }
  }

  // 執行原始 fetch
  const response = await originalFetch.apply(this, args);

  // 處理 API 回應
  if (typeof url === 'string') {
    try {
      const clone = response.clone();
      const text = await clone.text();
      let jsonStr = text;
      if (jsonStr.startsWith('for (;;);')) {
        jsonStr = jsonStr.substring(9);
      }
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        const data = JSON.parse(jsonStr);

        // 處理 bulk-route-definitions（user ID 寶庫！）
        if (url.includes('bulk-route-definitions')) {
          log('攔截到 bulk-route-definitions！');
          if (data.payload?.payloads) {
            const beforeCount = userIdMap.size;
            for (const [routeKey, routeData] of Object.entries(data.payload.payloads)) {
              let decodedKey = routeKey;
              try {
                decodedKey = JSON.parse(`"${routeKey}"`);
              } catch (e) {}

              const usernameMatch = decodedKey.match(/^\/@([\w.]+)/);
              if (usernameMatch) {
                const username = usernameMatch[1];
                const userId = routeData.result?.exports?.rootView?.props?.user_id
                            || routeData.result?.exports?.hostableView?.props?.user_id;
                if (userId) {
                  addUserId(username, String(userId), 'route');
                }
              }
            }
            const afterCount = userIdMap.size;
            if (afterCount > beforeCount) {
              logInfo(`發現 ${afterCount - beforeCount} 個新用戶！`);
            }
          }
        }

        // 從其他回應中提取 user IDs
        const beforeCount = userIdMap.size;
        extractUserIds(data, url);
        const afterCount = userIdMap.size;
        if (afterCount > beforeCount) {
          log(`從 API 回應中發現 ${afterCount - beforeCount} 個新用戶`);
        }
      }
    } catch (e) { /* not JSON */ }
  }

  // 處理 about_this_profile API 回應
  if (typeof url === 'string' && url.includes('about_this_profile_async_action')) {
    try {
      const clone = response.clone();
      const text = await clone.text();
      const profileInfo = parseProfileResponse(text);
      if (profileInfo && (profileInfo.username || profileInfo.location)) {
        log('提取到 profile 資訊:', profileInfo);
        window.dispatchEvent(new CustomEvent('geo-tag-profile-extracted', { detail: profileInfo }));
      }
    } catch (e) {
      logError('處理 profile 回應錯誤:', e);
    }
  }

  return response;
};

// ========== XHR 攔截 ==========
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._geoTagUrl = url;
  this._geoTagMethod = method;
  this._geoTagHeaders = {};
  return originalXHROpen.apply(this, [method, url, ...rest]);
};

XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  if (this._geoTagHeaders) {
    this._geoTagHeaders[name] = value;
  }
  return originalXHRSetRequestHeader.apply(this, [name, value]);
};

XMLHttpRequest.prototype.send = function(...args) {
  const xhrUrl = this._geoTagUrl;
  const requestBody = args[0];

  // 處理 bulk-route-definitions
  if (xhrUrl && xhrUrl.includes('bulk-route-definitions')) {
    this.addEventListener('load', function() {
      try {
        log('攔截到 bulk-route-definitions (XHR)！');
        let jsonStr = this.responseText;
        if (jsonStr.startsWith('for (;;);')) {
          jsonStr = jsonStr.substring(9);
        }
        const data = JSON.parse(jsonStr);
        if (data.payload?.payloads) {
          const beforeCount = userIdMap.size;
          for (const [routeKey, routeData] of Object.entries(data.payload.payloads)) {
            let decodedKey = routeKey;
            try {
              decodedKey = JSON.parse(`"${routeKey}"`);
            } catch (e) {}

            const usernameMatch = decodedKey.match(/^\/@([\w.]+)/);
            if (usernameMatch) {
              const username = usernameMatch[1];
              const userId = routeData.result?.exports?.rootView?.props?.user_id
                          || routeData.result?.exports?.hostableView?.props?.user_id;
              if (userId) {
                addUserId(username, String(userId), 'route-xhr');
              }
            }
          }
          const afterCount = userIdMap.size;
          if (afterCount > beforeCount) {
            logInfo(`(XHR) 發現 ${afterCount - beforeCount} 個新用戶！`);
          }
        }
      } catch (e) {
        logError('處理 bulk-route-definitions 錯誤:', e);
      }
    });
  }

  // 處理 about_this_profile
  if (xhrUrl && xhrUrl.includes('about_this_profile_async_action')) {
    this.addEventListener('load', function() {
      try {
        const profileInfo = parseProfileResponse(this.responseText);
        if (profileInfo && (profileInfo.username || profileInfo.location)) {
          log('(XHR) 提取到 profile 資訊:', profileInfo);
          window.dispatchEvent(new CustomEvent('geo-tag-profile-extracted', { detail: profileInfo }));
        }
      } catch (e) {
        logError('處理 XHR profile 回應錯誤:', e);
      }
    });
  }

  return originalXHRSend.apply(this, args);
};

// ========== 主動查詢 Profile API ==========

// Rate limiting
let lastRequestTime = 0;

/**
 * 查詢指定用戶的 profile 資訊
 * @param {string} targetUserId - 用戶 ID
 * @returns {Promise<object|null>} Profile 資訊
 */
async function fetchProfileInfo(targetUserId) {
  if (!sessionTokens) {
    logError('尚未捕獲 session tokens，請先瀏覽動態。');
    return null;
  }

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < CONFIG.RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const url = '/async/wbloks/fetch/?appid=com.bloks.www.text_post_app.about_this_profile_async_action&type=app&__bkv=22713cafbb647b89c4e9c1acdea97d89c8c2046e2f4b18729760e9b1ae0724f7';

  const params = new URLSearchParams();
  params.append('__user', '0');
  params.append('__a', sessionTokens.__a || '1');
  params.append('__req', 'ext_' + Math.random().toString(36).substring(7));
  params.append('__hs', sessionTokens.__hs || '');
  params.append('dpr', sessionTokens.dpr || '2');
  params.append('__ccg', sessionTokens.__ccg || 'UNKNOWN');
  params.append('__rev', sessionTokens.__rev || '');
  params.append('__s', sessionTokens.__s || '');
  params.append('__hsi', sessionTokens.__hsi || '');
  params.append('__dyn', sessionTokens.__dyn || '');
  params.append('__csr', sessionTokens.__csr || '');
  params.append('__comet_req', sessionTokens.__comet_req || '29');
  params.append('fb_dtsg', sessionTokens.fb_dtsg || '');
  params.append('jazoest', sessionTokens.jazoest || '');
  params.append('lsd', sessionTokens.lsd || '');
  params.append('__spin_r', sessionTokens.__spin_r || '');
  params.append('__spin_b', sessionTokens.__spin_b || 'trunk');
  params.append('__spin_t', sessionTokens.__spin_t || '');
  params.append('params', JSON.stringify({
    atpTriggerSessionID: crypto.randomUUID(),
    referer_type: 'TextPostAppProfileOverflow',
    target_user_id: String(targetUserId)
  }));
  params.append('__d', sessionTokens.__d || 'www');

  log('查詢 profile, user ID:', targetUserId);

  try {
    const response = await originalFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-FB-Friendly-Name': 'BarcelonaProfileAboutThisProfileAsyncActionQuery'
      },
      body: params,
      credentials: 'include'
    });

    // 檢查 rate limiting
    if (response.status === 429) {
      logInfo('⚠️ 被 Threads 限制請求頻率！');
      window.dispatchEvent(new CustomEvent('geo-tag-rate-limited'));
      return { _rateLimited: true };
    }

    const text = await response.text();
    const profileInfo = parseProfileResponse(text);

    // 如果沒有 username，從 map 中查找
    if (profileInfo && !profileInfo.username) {
      for (const [uname, uid] of userIdMap.entries()) {
        if (uid === String(targetUserId)) {
          profileInfo.username = uname;
          log(`從 map 解析 username: @${uname}`);
          break;
        }
      }
    }

    if (profileInfo && (profileInfo.username || profileInfo.joined || profileInfo.location)) {
      if (!profileInfo.username) {
        profileInfo.username = `user_${targetUserId}`;
        profileInfo._userIdOnly = true;
      }
      log('已取得 profile 資訊:', profileInfo);
      window.dispatchEvent(new CustomEvent('geo-tag-profile-extracted', { detail: profileInfo }));
      return profileInfo;
    } else {
      log('無法從回應中提取 profile 資訊');
    }
  } catch (e) {
    logError('查詢 profile 失敗:', e);
  }

  return null;
}

// ========== 頁面掃描功能 ==========

/**
 * 掃描頁面腳本中的 session tokens
 */
function scanPageForSessionTokens() {
  log('掃描頁面中的 session tokens...');

  const patterns = {
    fb_dtsg: [
      /"fb_dtsg"\s*:\s*"([^"]+)"/,
      /name="fb_dtsg"\s+value="([^"]+)"/,
      /"DTSGInitialData"[^}]*"token"\s*:\s*"([^"]+)"/,
      /\["DTSGInitData",\[\],\{"token":"([^"]+)"/
    ],
    lsd: [
      /"lsd"\s*:\s*"([^"]+)"/,
      /name="lsd"\s+value="([^"]+)"/
    ],
    jazoest: [
      /"jazoest"\s*:\s*"?(\d+)"?/,
      /name="jazoest"\s+value="(\d+)"/
    ],
    __user: [
      /"viewer"\s*:\s*\{[^}]*"id"\s*:\s*"(\d{10,})"/,
      /"__user"\s*:\s*"?(\d{10,})"?/,
      /"USER_ID"\s*:\s*"(\d{10,})"/
    ]
  };

  const foundTokens = {};

  // 檢查 input 欄位
  const inputs = document.querySelectorAll('input[name="fb_dtsg"], input[name="lsd"], input[name="jazoest"]');
  inputs.forEach((input) => {
    const name = input.getAttribute('name');
    const value = input.getAttribute('value');
    if (value && !foundTokens[name]) {
      foundTokens[name] = value;
      log(`從 input 找到 ${name}`);
    }
  });

  // 檢查 script 標籤
  const scripts = document.querySelectorAll('script:not([src])');
  scripts.forEach((script) => {
    const content = script.textContent || '';
    for (const [tokenName, regexList] of Object.entries(patterns)) {
      if (foundTokens[tokenName]) continue;
      for (const regex of regexList) {
        const match = content.match(regex);
        if (match) {
          foundTokens[tokenName] = match[1];
          log(`從腳本找到 ${tokenName}`);
          break;
        }
      }
    }
  });

  if (foundTokens.fb_dtsg) {
    sessionTokens = {
      ...sessionTokens,
      fb_dtsg: foundTokens.fb_dtsg,
      lsd: foundTokens.lsd || sessionTokens?.lsd || '',
      jazoest: foundTokens.jazoest || sessionTokens?.jazoest || '',
      __user: foundTokens.__user || sessionTokens?.__user || '0',
      __a: sessionTokens?.__a || '1',
      __comet_req: sessionTokens?.__comet_req || '29',
      __d: sessionTokens?.__d || 'www'
    };
    logInfo('✅ 從頁面掃描更新 session tokens！');
    window.dispatchEvent(new CustomEvent('geo-tag-tokens-ready'));
  }

  return foundTokens;
}

/**
 * 掃描頁面中嵌入的 user IDs
 */
function scanPageForUserIds() {
  log('掃描頁面中的 user IDs...');
  const beforeCount = userIdMap.size;

  const jsonScripts = document.querySelectorAll('script[type="application/json"]');
  jsonScripts.forEach((script, i) => {
    const content = script.textContent || '';
    if (content.includes('"pk"') || content.includes('"username"') || content.includes('"user"')) {
      try {
        const data = JSON.parse(content);
        extractUserIds(data, `json-script#${i}`);
      } catch (e) {
        // Regex fallback
        const pkMatches = [...content.matchAll(/"pk"\s*:\s*"(\d+)"/g)];
        const usernameMatches = [...content.matchAll(/"username"\s*:\s*"([\w.]+)"/g)];
        for (const pkMatch of pkMatches) {
          const pk = pkMatch[1];
          const pkIndex = pkMatch.index;
          for (const userMatch of usernameMatches) {
            const username = userMatch[1];
            const userIndex = userMatch.index;
            if (Math.abs(userIndex - pkIndex) < 500) {
              addUserId(username, pk, 'regex');
              break;
            }
          }
        }
      }
    }
  });

  const afterCount = userIdMap.size;
  if (afterCount > beforeCount) {
    logInfo(`掃描發現 ${afterCount - beforeCount} 個新用戶`);
  }
  return Object.fromEntries(userIdMap);
}

// ========== 訊息處理（與 content script 通訊）==========
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  // Handle user ID lookup
  if (event.data?.type === 'geo-tag-userid-request') {
    const { requestId, username } = event.data;
    const userId = userIdMap.get(username) || null;
    log(`查詢 @${username} 的 user ID: ${userId}`);
    window.postMessage({
      type: 'geo-tag-userid-response',
      requestId: requestId,
      userId: userId
    }, '*');
  }

  // Handle profile fetch request
  if (event.data?.type === 'geo-tag-fetch-request') {
    const { requestId, userId } = event.data;
    log(`收到 profile 查詢請求, user ID: ${userId}`);
    const result = await fetchProfileInfo(userId);
    window.postMessage({
      type: 'geo-tag-fetch-response',
      requestId: requestId,
      result: result
    }, '*');
  }

  // Handle tokens status check
  if (event.data?.type === 'geo-tag-check-tokens') {
    window.postMessage({
      type: 'geo-tag-tokens-status',
      hasTokens: !!sessionTokens,
      userIdMapSize: userIdMap.size
    }, '*');
  }

  // Handle scan request
  if (event.data?.type === 'geo-tag-scan-request') {
    scanPageForSessionTokens();
    scanPageForUserIds();
  }
});

// ========== 暴露全域函數（用於調試）==========
window.__geoTagFetchProfileInfo = fetchProfileInfo;
window.__geoTagGetUserIdMap = () => Object.fromEntries(userIdMap);
window.__geoTagGetSessionTokens = () => sessionTokens;
window.__geoTagScanPage = () => {
  scanPageForSessionTokens();
  return scanPageForUserIds();
};

// ========== 初始化 ==========
logInfo('✅ 小黃標 API 攔截器已載入');

// 初始掃描
setTimeout(() => {
  scanPageForSessionTokens();
  scanPageForUserIds();
}, 2000);
