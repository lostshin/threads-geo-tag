/**
 * 地區名稱對照表 - 統一不同語言的地區名稱
 * 將各語言地區名稱正規化為英文格式
 */

// 地區名稱對照表（各語言 → 英文）
const REGION_MAP = {
  // 台灣
  '台灣': 'Taiwan',
  '臺灣': 'Taiwan',
  '타이완': 'Taiwan',

  // 日本
  '日本': 'Japan',
  '일본': 'Japan',

  // 中國
  '中國': 'China',
  '中国': 'China',
  '중국': 'China',

  // 香港
  '香港': 'Hong Kong',
  '홍콩': 'Hong Kong',

  // 韓國
  '韓國': 'South Korea',
  '한국': 'South Korea',
  '大韓民國': 'South Korea',

  // 美國
  '美國': 'United States',
  '미국': 'United States',
  'アメリカ': 'United States',

  // 英國
  '英國': 'United Kingdom',
  '영국': 'United Kingdom',
  'イギリス': 'United Kingdom',

  // 新加坡
  '新加坡': 'Singapore',
  '싱가포르': 'Singapore',
  'シンガポール': 'Singapore',

  // 馬來西亞
  '馬來西亞': 'Malaysia',
  '马来西亚': 'Malaysia',
  '말레이시아': 'Malaysia',

  // 泰國
  '泰國': 'Thailand',
  '태국': 'Thailand',
  'タイ': 'Thailand',

  // 越南
  '越南': 'Vietnam',
  '베트남': 'Vietnam',
  'ベトナム': 'Vietnam',

  // 印尼
  '印尼': 'Indonesia',
  '印度尼西亞': 'Indonesia',
  '인도네시아': 'Indonesia',

  // 菲律賓
  '菲律賓': 'Philippines',
  '필리핀': 'Philippines',
  'フィリピン': 'Philippines',

  // 澳洲
  '澳洲': 'Australia',
  '澳大利亞': 'Australia',
  '호주': 'Australia',
  'オーストラリア': 'Australia',

  // 加拿大
  '加拿大': 'Canada',
  '캐나다': 'Canada',
  'カナダ': 'Canada',

  // 德國
  '德國': 'Germany',
  '독일': 'Germany',
  'ドイツ': 'Germany',

  // 法國
  '法國': 'France',
  '프랑스': 'France',
  'フランス': 'France',

  // 義大利
  '義大利': 'Italy',
  '意大利': 'Italy',
  '이탈리아': 'Italy',
  'イタリア': 'Italy',

  // 西班牙
  '西班牙': 'Spain',
  '스페인': 'Spain',
  'スペイン': 'Spain',

  // 荷蘭
  '荷蘭': 'Netherlands',
  '네덜란드': 'Netherlands',
  'オランダ': 'Netherlands',

  // 印度
  '印度': 'India',
  '인도': 'India',
  'インド': 'India',

  // 巴西
  '巴西': 'Brazil',
  '브라질': 'Brazil',
  'ブラジル': 'Brazil',

  // 墨西哥
  '墨西哥': 'Mexico',
  '멕시코': 'Mexico',
  'メキシコ': 'Mexico'
};

/**
 * 正規化地區名稱
 * 將各語言的地區名稱統一轉換為英文
 * @param {string} region - 原始地區名稱
 * @returns {string} 正規化後的地區名稱（英文或原始值）
 */
function normalizeRegion(region) {
  if (!region || region === '未揭露') {
    return region;
  }

  // 去除前後空白
  const trimmedRegion = region.trim();

  // 檢查是否在對照表中
  if (REGION_MAP[trimmedRegion]) {
    console.log(`[RegionMap] 轉換地區: "${trimmedRegion}" → "${REGION_MAP[trimmedRegion]}"`);
    return REGION_MAP[trimmedRegion];
  }

  // 不在對照表中，返回原始值
  return trimmedRegion;
}

// 暴露給全域（供 content.js 使用）
window.RegionUtils = {
  normalizeRegion: normalizeRegion,
  REGION_MAP: REGION_MAP
};
