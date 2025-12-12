// ==================== 查詢管理器載入 ====================
// 使用 importScripts 載入 queryManager.js（非 ES Module 方式）
importScripts('queryManager.js');

// 當擴展安裝時執行初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('小黃標 Extension 已安裝');
});

// 初始化時從 storage 讀取最大並行查詢數設定
(async () => {
  try {
    const result = await chrome.storage.local.get(['maxConcurrentQueries']);
    if (result.maxConcurrentQueries !== undefined) {
      QueryManager.updateMaxConcurrent(result.maxConcurrentQueries);
      console.log('[Background] 從 storage 載入最大並行查詢數:', result.maxConcurrentQueries);
    }
  } catch (error) {
    console.error('[Background] 讀取最大並行查詢數設定失敗:', error);
  }
})();

// 監聽 popup 的持久連接（僅用於偵測 popup 狀態，不再自動移除標籤）
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    console.log('[Background] Popup 已連接');

    // 當連接斷開時（popup 關閉），只記錄日誌，不再移除標籤
    // 標籤應該持續顯示，不受 popup 狀態影響
    port.onDisconnect.addListener(() => {
      console.log('[Background] Popup 連接已斷開（標籤保持顯示）');
    });
  }
});


// 監聽來自 content script 或 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] 收到消息:', request.action, sender.tab ? 'from tab ' + sender.tab.id : 'from extension');

  // 處理頁面捲動事件（從 content script 轉發給 popup）
  if (request.action === 'pageScrolled') {
    console.log('[Background] 收到頁面捲動通知，準備建立用戶列表並顯示標籤');

    // 同時直接向發送滾動通知的分頁發送請求
    if (sender.tab && sender.tab.id) {
      (async () => {
        try {
          // 1. 先發送 listAllUsers 請求，讓 content script 建立用戶列表
          const usersResponse = await chrome.tabs.sendMessage(sender.tab.id, {
            action: 'listAllUsers'
          });

          if (usersResponse && usersResponse.success) {
            console.log('[Background] listAllUsers 成功，找到 ' + usersResponse.count + ' 個用戶');

            // 2. 讀取快取的地區和側寫資料
            const regionCache = await QueryManager.getAllCachedRegions();
            const profileCache = await QueryManager.getAllCachedProfiles();

            // 3. 組合 regionData
            const regionData = {};
            for (const username in regionCache) {
              const regionInfo = regionCache[username];
              const profileInfo = profileCache[username];
              regionData['@' + username] = {
                region: regionInfo ? regionInfo.region : null,
                profile: profileInfo ? profileInfo.profile : null
              };
            }

            // 4. 發送顯示標籤請求到 content script
            await chrome.tabs.sendMessage(sender.tab.id, {
              action: 'showRegionLabels',
              regionData: regionData
            });

            console.log('[Background] 已發送顯示標籤請求到 tab ' + sender.tab.id);
          } else {
            console.log('[Background] listAllUsers 失敗或返回空');
          }
        } catch (error) {
          console.log('[Background] 處理 pageScrolled 失敗:', error.message);
        }
      })();
    }

    // 向 popup 轉發訊息
    chrome.runtime.sendMessage({
      action: 'pageScrolled',
      users: request.users || []
    }).catch(function(err) {
      // popup 可能未開啟，忽略錯誤
      console.log('[Background] 轉發到 popup 失敗（popup 可能未開啟）:', err.message);
    });

    sendResponse({ success: true });
    return true;
  }


  // 處理手動查詢地區（從標籤上的 [查詢] 按鈕觸發）
  if (request.action === 'manualQueryRegion') {
    const account = request.account;

    (async () => {
      try {
        console.log('[Background] 開始手動查詢: ' + account);

        // 讀取設定
        const storageResult = await chrome.storage.local.get([
          'keepTabAfterQuery',
          'keepTabFilter',
          'llmProfileAnalysis'
        ]);
        const shouldKeepTab = storageResult.keepTabAfterQuery || false;
        const keepTabFilter = storageResult.keepTabFilter || '';
        const enableProfileAnalysis = storageResult.llmProfileAnalysis || false;

        console.log('[Background] 查詢設定: keepTab=' + shouldKeepTab + ', filter="' + keepTabFilter + '", profile=' + enableProfileAnalysis);

        // 使用隊列機制執行整合查詢
        const queueResult = QueryManager.addToIntegratedQueryQueue(
          account,
          enableProfileAnalysis,
          shouldKeepTab,
          keepTabFilter,
          // 當側寫內容準備好時的回調
          function(profileData) {
            console.log('[Background] 側寫內容準備好，通知 popup 進行 LLM 分析');
            // 通知 popup 進行 LLM 分析
            chrome.runtime.sendMessage({
              action: 'processProfileAnalysis',
              account: account,
              profileData: profileData
            }).catch(function(err) {
              console.log('[Background] 通知 popup 進行 LLM 分析失敗:', err.message);
            });
          }
        );

        // 如果無法加入隊列（隊列已滿或已存在），返回失敗
        if (queueResult === null) {
          sendResponse({
            success: false,
            error: '隊列已滿或該用戶已在查詢中'
          });
          return;
        }

        // 等待查詢完成並返回結果
        const result = await queueResult;
        sendResponse(result);
      } catch (error) {
        console.error('[Background] 手動查詢錯誤:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();

    return true; // 保持消息通道打開
  }

  // 處理來自 popup 的查詢請求
  if (request.action === 'queryUserRegion') {
    const username = request.username;
    const shouldKeepTab = request.shouldKeepTab;

    (async () => {
      try {
        console.log('[Background] 收到查詢請求: ' + username);

        // 使用查詢管理器執行查詢
        const result = await QueryManager.queryUserRegion(username, shouldKeepTab);

        // 返回結果
        sendResponse(result);
      } catch (error) {
        console.error('[Background] 查詢錯誤:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();

    return true; // 保持消息通道打開
  }

  // 獲取隊列狀態（用於調試）
  if (request.action === 'getQueueStatus') {
    const status = QueryManager.getQueueStatus();
    sendResponse(status);
    return true;
  }

  // 獲取緩存中的用戶地區
  if (request.action === 'getCachedRegion') {
    const username = request.username;

    (async () => {
      try {
        const region = await QueryManager.getCachedRegion(username);
        sendResponse({ success: true, region: region });
      } catch (error) {
        console.error('[Background] 獲取緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 清除所有緩存
  if (request.action === 'clearCache') {
    (async () => {
      try {
        await QueryManager.clearCache();
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] 清除緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 移除單一用戶的緩存（地區和側寫）
  if (request.action === 'removeUserCache') {
    const account = request.account;
    (async () => {
      try {
        const removedRegion = await QueryManager.removeUserCache(account);
        const removedProfile = await QueryManager.removeUserProfileCache(account);
        console.log('[Background] 移除用戶緩存: @' + account + ', 地區: ' + removedRegion + ', 側寫: ' + removedProfile);
        sendResponse({ success: true, removedRegion: removedRegion, removedProfile: removedProfile });
      } catch (error) {
        console.error('[Background] 移除用戶緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 獲取緩存統計信息
  if (request.action === 'getCacheStats') {
    (async () => {
      try {
        const stats = await QueryManager.getCacheStats();
        sendResponse({ success: true, stats: stats });
      } catch (error) {
        console.error('[Background] 獲取緩存統計失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 更新最大並行查詢數
  if (request.action === 'updateMaxConcurrent') {
    const value = request.value;
    QueryManager.updateMaxConcurrent(value);
    console.log('[Background] 已更新最大並行查詢數:', value);
    sendResponse({ success: true });
    return true;
  }

  // 處理 Popup 關閉事件
  if (request.action === 'popupClosed') {
    console.log('[Background] 收到 Popup 關閉通知，準備移除所有標籤');

    (async () => {
      try {
        // 獲取所有標籤頁
        const tabs = await chrome.tabs.query({});
        let removedCount = 0;
        let failedCount = 0;

        // 向所有 threads.com 頁面發送移除標籤的請求
        for (const tab of tabs) {
          if (tab.url && tab.url.includes('threads.com')) {
            try {
              const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'removeRegionLabels'
              });

              if (response && response.success) {
                removedCount += response.removedCount || 0;
                console.log('[Background] Tab ' + tab.id + ' 已移除 ' + (response.removedCount || 0) + ' 個標籤');
              }
            } catch (error) {
              // 忽略無法連接的標籤頁
              failedCount++;
              console.log('[Background] 無法連接到 tab ' + tab.id + ':', error.message);
            }
          }
        }

        console.log('[Background] 標籤移除完成，成功: ' + removedCount + ' 個，失敗: ' + failedCount + ' 個');

        sendResponse({
          success: true,
          removedCount: removedCount,
          failedCount: failedCount
        });
      } catch (error) {
        console.error('[Background] 移除標籤時發生錯誤:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();

    return true;
  }

  // 獲取所有緩存的用戶地區資料
  if (request.action === 'getAllCachedRegions') {
    (async () => {
      try {
        const cache = await QueryManager.getAllCachedRegions();
        sendResponse({ success: true, cache: cache });
      } catch (error) {
        console.error('[Background] 獲取所有緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 獲取緩存中的用戶側寫
  if (request.action === 'getCachedProfile') {
    const username = request.username;

    (async () => {
      try {
        const cachedData = await QueryManager.getCachedProfile(username);
        if (cachedData) {
          sendResponse({
            success: true,
            profile: cachedData.profile
          });
        } else {
          sendResponse({ success: true, profile: null });
        }
      } catch (error) {
        console.error('[Background] 獲取側寫緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 保存用戶側寫到緩存
  if (request.action === 'saveCachedProfile') {
    const username = request.username;
    const profile = request.profile;

    (async () => {
      try {
        await QueryManager.saveCachedProfile(username, profile);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] 保存側寫緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 獲取所有緩存的用戶側寫資料
  if (request.action === 'getAllCachedProfiles') {
    (async () => {
      try {
        const cache = await QueryManager.getAllCachedProfiles();
        sendResponse({ success: true, cache: cache });
      } catch (error) {
        console.error('[Background] 獲取所有側寫緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 清除所有側寫緩存
  if (request.action === 'clearProfileCache') {
    (async () => {
      try {
        await QueryManager.clearProfileCache();
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] 清除側寫緩存失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 獲取側寫緩存統計信息
  if (request.action === 'getProfileCacheStats') {
    (async () => {
      try {
        const stats = await QueryManager.getProfileCacheStats();
        sendResponse({ success: true, stats: stats });
      } catch (error) {
        console.error('[Background] 獲取側寫緩存統計失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  return true;
});
