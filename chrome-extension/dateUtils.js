// ==================== 日期解析工具 ====================
// 用於解析用戶加入日期並判斷是否為新用戶

/**
 * 多語言月份對照表
 */
const monthMap = {
  // 英文
  'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
  'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
  'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
  // 日文
  '1月': 0, '2月': 1, '3月': 2, '4月': 3, '5月': 4, '6月': 5,
  '7月': 6, '8月': 7, '9月': 8, '10月': 9, '11月': 10, '12月': 11,
  // 韓文
  '1월': 0, '2월': 1, '3월': 2, '4월': 3, '5월': 4, '6월': 5,
  '7월': 6, '8월': 7, '9월': 8, '10월': 9, '11월': 10, '12월': 11,
};

/**
 * 解析加入日期字串
 * 支援格式: "2024年1月", "January 2024", "2024년 1월", "Dec 2024"
 * @param {string} joinedStr - 加入日期字串
 * @returns {Date|null} 日期對象或 null（解析失敗）
 */
function parseJoinedDate(joinedStr) {
  if (!joinedStr) return null;

  // 提取年份（4 位數字）
  const yearMatch = joinedStr.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  // 嘗試提取月份
  let month = null;

  // 檢查 CJK 月份格式（例如: "1月", "12월"）
  const cjkMonthMatch = joinedStr.match(/(\d{1,2})[月월]/);
  if (cjkMonthMatch) {
    month = parseInt(cjkMonthMatch[1], 10) - 1; // 0-indexed
  } else {
    // 檢查英文月份名稱
    const lowerStr = joinedStr.toLowerCase();
    for (const [name, idx] of Object.entries(monthMap)) {
      if (lowerStr.includes(name)) {
        month = idx;
        break;
      }
    }
  }

  if (month === null) return null;

  return new Date(year, month, 1);
}

/**
 * 判斷用戶是否為新用戶
 * 預設: 2 個月內加入視為新用戶
 * @param {string} joinedStr - 加入日期字串
 * @param {number} monthsThreshold - 月份門檻（預設 2）
 * @param {Date} referenceDate - 參考日期（預設為今天）
 * @returns {boolean} 是否為新用戶
 */
function isNewUser(joinedStr, monthsThreshold = 2, referenceDate = new Date()) {
  const joinedDate = parseJoinedDate(joinedStr);
  if (!joinedDate) return false;

  // 計算門檻日期（往前推 N 個月）
  const thresholdDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() - monthsThreshold,
    1
  );

  return joinedDate >= thresholdDate;
}

// 匯出給其他模組使用（如果在 content script 中直接使用）
if (typeof window !== 'undefined') {
  window.DateUtils = {
    parseJoinedDate,
    isNewUser
  };
}
