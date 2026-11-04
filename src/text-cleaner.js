'use strict';
/**
 * 文本清理：修正乱码、异常符号、冗余空白。
 *
 * 真实数据中常见的问题：
 *   - 编码损坏的中文变成连续问号： "HP? ?????" / "???? ??"
 *   - UTF-8 解码失败的替换符 U+FFFD（�）
 *   - 控制字符（0x00-0x1F）混入
 *   - 全角/半角符号混用
 *   - 多余空格、重复标点
 *   - 括号不配对、全角括号混用
 *
 * 设计原则：**只清理明显是噪声的部分，不动有意义的字符。**
 * 例如 "x99" "999" "L3+R2" "MC" 这类必须原样保留。
 */

/** 明显是乱码残留的问号串（连续 2 个以上，且不在句首句尾单独出现） */
const GARBLED_QUESTIONS = /\?{2,}/g;

/** 单个孤立问号：只有当整串里没有任何字母数字时才认为是噪声 */
const LONE_QUESTION = /\?/;

/** UTF-8 解码失败产生的替换符 */
const REPLACEMENT_CHAR = /\uFFFD/g;

/** 控制字符（保留 \t \n \r） */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** 零宽字符（BOM 中间段、零宽空格等） */
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/** 全角符号 → 半角的映射 */
const FULLWIDTH_MAP = {
  '！': '!', '？': '?', '：': ':', '；': ';', '，': ',', '。': '.',
  '（': '(', '）': ')', '［': '[', '］': ']', '｛': '{', '｝': '}',
  '％': '%', '＃': '#', '＆': '&', '＊': '*', '＋': '+', '－': '-',
  '＝': '=', '＠': '@', '／': '/', '＼': '\\', '｜': '|', '～': '~',
  '＂': '"', '＇': "'", '＜': '<', '＞': '>', '＜': '<', '＞': '>',
  '　': ' ', '…': '...', '—': '-', '–': '-', '‐': '-', '‑': '-',
};

/**
 * 清理文本中的乱码与异常符号。
 * @param {string} input
 * @returns {{text:string, changed:boolean, fixes:string[]}}
 */
function cleanText(input) {
  const src = String(input == null ? '' : input);
  const fixes = [];
  let out = src;

  // 1) 去掉零宽字符
  if (ZERO_WIDTH.test(out)) {
    ZERO_WIDTH.lastIndex = 0;
    out = out.replace(ZERO_WIDTH, '');
    fixes.push('移除零宽字符');
  }
  ZERO_WIDTH.lastIndex = 0;

  // 2) 去掉控制字符
  if (CONTROL_CHARS.test(out)) {
    CONTROL_CHARS.lastIndex = 0;
    out = out.replace(CONTROL_CHARS, '');
    fixes.push('移除控制字符');
  }
  CONTROL_CHARS.lastIndex = 0;

  // 3) 替换符 U+FFFD（解码失败的字符）
  if (REPLACEMENT_CHAR.test(out)) {
    REPLACEMENT_CHAR.lastIndex = 0;
    out = out.replace(REPLACEMENT_CHAR, '');
    fixes.push('移除乱码替换符');
  }
  REPLACEMENT_CHAR.lastIndex = 0;

  // 4) 连续问号（编码损坏的中文残留）
  if (GARBLED_QUESTIONS.test(out)) {
    GARBLED_QUESTIONS.lastIndex = 0;
    out = out.replace(GARBLED_QUESTIONS, '');
    fixes.push('清理乱码问号串');
  }
  GARBLED_QUESTIONS.lastIndex = 0;

  // 5) 孤立问号：编码损坏的中文常变成单个 ? 跟在词后（如 "HP? ????"）
  //    判据：问号紧跟在字母/数字后面，且后面不再跟字母 → 判定为乱码残留
  //    这样 "What's up?" / "ok?" 不会被误删
  if (out.includes('?')) {
    const before = out;
    out = out.replace(/([A-Za-z0-9\u4e00-\u9fa5])\?(?![A-Za-z])/g, '$1');
    // 整串都是问号和符号时也清掉
    if (/[A-Za-z0-9\u4e00-\u9fa5]/.test(out) === false) {
      out = out.replace(/\?/g, '');
    }
    if (out !== before) fixes.push('清理孤立问号');
  }

  // 6) 全角符号转半角（但保留全角标点在中文语境的价值 → 只转无意义的）
  //    中文正文里的，。！？是正常标点，不动。这里只转那些明显是「符号类」的
  const beforeFull = out;
  out = out.replace(/[！％＃＆＊＋－＝＠／＼｜～＂＇＜＞]/g, (c) => FULLWIDTH_MAP[c] || c);
  if (out !== beforeFull) fixes.push('全角符号转半角');

  // 7) 全角括号转半角（XML/文本里半角更通用），中文正文括号保留
  out = out.replace(/[（）［］｛｝]/g, (c) => FULLWIDTH_MAP[c] || c);

  // 8) 括号配对修正：右括号多于左括号时，补左括号
  const openP = (out.match(/\(/g) || []).length;
  const closeP = (out.match(/\)/g) || []).length;
  if (closeP > openP) {
    out = '('.repeat(closeP - openP) + out;
    fixes.push('补全左括号');
  } else if (openP > closeP) {
    out = out.replace(/\)$/, '');
    fixes.push('移除多余右括号');
  }

  // 9) 清理多余空格（保留单个空格分隔英文单词）
  const beforeSpace = out;
  out = out.replace(/[ \t]{2,}/g, ' ');
  // 中文标点前后不该有空格
  out = out.replace(/ +([，。、；：！？）】」》])/g, '$1');
  out = out.replace(/([（【「《]) +/g, '$1');
  if (out !== beforeSpace) fixes.push('清理多余空格');

  // 10) 清理重复标点（!!! → !，但保留 ... 省略号）
  const beforePunc = out;
  out = out.replace(/([!?。])\1{1,}/g, '$1');
  out = out.replace(/，{2,}/g, '，');
  if (out !== beforePunc) fixes.push('合并重复标点');

  // 11) 去掉首尾空白与残留的孤立分隔符
  out = out.replace(/^[\s\-–—_~|]+/, '').replace(/[\s\-–—_~|]+$/, '').trim();

  // 12) 收尾：去掉悬空的斜杠/加号（清洗后常留下）
  out = out.replace(/\s*[/+]\s*$/, '').trim();

  return { text: out, changed: out !== src, fixes };
}

/**
 * 清理后是否还有「疑似乱码」的痕迹。
 * 用于界面提示用户「已修正 N 处乱码」。
 */
function detectGarbage(input) {
  const s = String(input == null ? '' : input);
  const marks = [];
  if (/\uFFFD/.test(s)) marks.push('替换符');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) marks.push('控制字符');
  if (/\?{2,}/.test(s)) marks.push('乱码问号');
  if (/[\u200B-\u200D\uFEFF]/.test(s)) marks.push('零宽字符');
  return marks;
}

module.exports = { cleanText, detectGarbage, FULLWIDTH_MAP };
