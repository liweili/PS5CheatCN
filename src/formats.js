'use strict';
/**
 * 三种 PS 金手指格式的解析 / 序列化
 *
 *  MC4  = Base64( AES-256-CBC( XML ) )     密钥见下方（来自 bucanero/save-decrypters 权威实现）
 *  SHN  = 明文 XML（Trainer / Cheat / Cheatline）
 *  JSON = 明文 JSON（name / id / version / process / mods[].memory[]）
 *
 * 设计要点：解析出「统一模型」，保存时回到「原始文本」做定点替换，
 * 只改动名称字段，其余字节（缩进、换行、Genres、Items 等）原样保留。
 */

const crypto = require('crypto');

// bucanero/save-decrypters 的 mc4-cheat-decrypter 权威密钥
const MC4_KEY = Buffer.from('304c6528f659c766110239a51cl5dd9c', 'ascii');
const MC4_IV  = Buffer.from('u@}kzW2u[u(8DWar', 'ascii');

// ---------------------------------------------------------------- 通用工具

/** 去掉连字符并转大写：90-90-90 → 909090 */
function normHex(s) {
  return String(s == null ? '' : s).replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

/** 按目标格式格式化 hex：SHN 用 90-90-90，JSON 用 909090 */
function fmtHex(hex, dashed) {
  const h = normHex(hex);
  if (!dashed) return h;
  return (h.match(/.{2}/g) || []).join('-');
}

/** XML 文本转义 */
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** XML 实体反转义：&amp; → &，用于把原文读回成真实名字 */
function unescXml(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/** JSON 字符串转义（用于拼接，不走 JSON.stringify 以保持原风格） */
function escJson(s) {
  return JSON.stringify(String(s == null ? '' : s));
}

// ---------------------------------------------------------------- MC4 加解密

function mc4Decrypt(text) {
  const b64 = String(text).replace(/\s+/g, '');
  const raw = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-cbc', MC4_KEY, MC4_IV);
  d.setAutoPadding(false);
  const out = Buffer.concat([d.update(raw), d.final()]);
  return out.toString('utf8');
}

function mc4Encrypt(plainText) {
  const data = Buffer.from(plainText, 'utf8');
  const e = crypto.createCipheriv('aes-256-cbc', MC4_KEY, MC4_IV);
  e.setAutoPadding(false);
  const enc = Buffer.concat([e.update(data), e.final()]);
  return enc.toString('base64');
}

/** 明文长度需为 16 字节对齐（AES 分组），原文件用空白字符补齐 */
function padTo16(text) {
  const buf = Buffer.from(text, 'utf8');
  const rem = buf.length % 16;
  if (rem === 0) return text;
  return text + ' '.repeat(16 - rem);
}

// ---------------------------------------------------------------- 格式识别

function detectFormat(filePath, text) {
  const ext = (filePath || '').toLowerCase();
  if (ext.endsWith('.mc4')) return 'mc4';
  if (ext.endsWith('.shn')) return 'shn';
  if (ext.endsWith('.json')) return 'json';

  const t = String(text || '').trim();
  if (/^<\?xml/i.test(t) || /<Trainer[\s>]/.test(t)) return 'shn';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  // 无扩展名时试解 MC4
  try {
    const p = mc4Decrypt(t);
    if (/<Trainer[\s>]/.test(p)) return 'mc4';
  } catch (e) { /* ignore */ }
  return 'unknown';
}

// ---------------------------------------------------------------- SHN 解析

/**
 * SHN 结构：
 *   <Trainer Game=".." Moder=".." Cusa=".." Version=".." Process="..">
 *     <Genres Name=".." />
 *     <Items />
 *     <Cheat Text="..">
 *       <Cheatline>
 *         <Offset>..</Offset><Section>..</Section>
 *         <ValueOn>..</ValueOn><ValueOff>..</ValueOff>
 *       </Cheatline>
 *     </Cheat>
 */
function parseShn(xml) {
  const meta = {
    game: '', cusa: '', version: '', process: '', author: '', genres: [],
  };

  const trainer = /<Trainer\b([^>]*)>/i.exec(xml);
  if (trainer) {
    const attrs = trainer[1];
    const pick = (n) => {
      const m = new RegExp(n + '="([^"]*)"', 'i').exec(attrs);
      return m ? m[1] : '';
    };
    meta.game = pick('Game');
    meta.cusa = pick('Cusa');
    meta.version = pick('Version');
    meta.process = pick('Process');
    meta.author = pick('Moder') || pick('Creator') || pick('Author');
  }

  const genres = [];
  const gre = /<Genres\s+Name="([^"]*)"\s*\/?>/gi;
  let m;
  while ((m = gre.exec(xml)) !== null) genres.push(m[1]);
  meta.genres = genres;

  // 逐个 <Cheat> 块。
  // 注意：<Cheat> 标签可能带额外属性（Control="Toggel" / Description="" 等），
  // Text 不一定是第一个属性，所以用属性通配匹配。
  const mods = [];
  const cre = /<Cheat\b([^>]*)>([\s\S]*?)<\/Cheat>/gi;
  while ((m = cre.exec(xml)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const tm = /\bText="([^"]*)"/i.exec(attrs);
    const name = tm ? unescXml(tm[1]) : '';
    // 额外属性
    const extra = {};
    const are = /(\w+)="([^"]*)"/g;
    let am;
    while ((am = are.exec(attrs)) !== null) {
      if (am[1].toLowerCase() !== 'text') extra[am[1]] = am[2];
    }
    const lines = [];
    const lre = /<Cheatline\b[^>]*>([\s\S]*?)<\/Cheatline>/gi;
    let lm;
    while ((lm = lre.exec(body)) !== null) {
      const lb = lm[1];
      const g = (tag) => {
        const x = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(lb);
        return x ? x[1].trim() : '';
      };
      lines.push({
        offset: g('Offset'),
        section: g('Section') || '0',
        on: normHex(g('ValueOn')),
        off: normHex(g('ValueOff')),
      });
    }
    mods.push({ name, lines, extra });
  }

  return { format: 'shn', meta, mods, raw: xml };
}

// ---------------------------------------------------------------- JSON 解析

function parseJsonCheat(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON 解析失败：' + e.message);
  }
  const meta = {
    game: obj.name || '',
    cusa: obj.id || '',
    version: obj.version || '',
    process: obj.process || '',
    author: Array.isArray(obj.credits) ? obj.credits.join(', ') : (obj.credits || ''),
    genres: [],
  };
  const mods = [];
  const arr = Array.isArray(obj.mods) ? obj.mods : [];
  for (const m of arr) {
    const mem = Array.isArray(m.memory) ? m.memory : [];
    mods.push({
      name: m.name || '',
      type: m.type || 'checkbox',
      lines: mem.map((x) => ({
        offset: x.offset || '',
        section: x.section != null ? String(x.section) : '0',
        on: normHex(x.on),
        off: normHex(x.off),
      })),
    });
  }
  return { format: 'json', meta, mods, raw: text };
}

// ---------------------------------------------------------------- 统一入口

/**
 * 打开任意格式，返回统一模型
 * @returns {{format, meta, mods, raw, sourceFormat}}
 */
function parseCheatFile(filePath, text) {
  const fmt = detectFormat(filePath, text);
  if (fmt === 'unknown') throw new Error('无法识别的文件格式');

  if (fmt === 'mc4') {
    const plain = mc4Decrypt(text);
    const m = parseShn(plain);
    m.format = 'mc4';
    m.sourceFormat = 'mc4';
    m.plainXml = plain;
    return m;
  }
  if (fmt === 'shn') {
    const m = parseShn(text);
    m.sourceFormat = 'shn';
    return m;
  }
  const m = parseJsonCheat(text);
  m.sourceFormat = 'json';
  return m;
}

// ---------------------------------------------------------------- 保存：SHN

/**
 * 在原始 SHN/XML 文本中定点替换每个 <Cheat Text="..."> 的值。
 * 返回 { text, changed } —— 未命中的条目保持原样。
 */
function writeShn(model, originalXml) {
  let out = originalXml;
  let changed = 0;
  const names = model.mods.map((m) => m.name);

  // 逐个 <Cheat> 开标签，按出现顺序替换 Text 属性值。
  // 必须与解析阶段用同样的匹配方式（Text 不一定是第一个属性），
  // 否则条目会错位，把名字写到别的 Cheat 上。
  const re = /(<Cheat\b[^>]*?\bText=")([^"]*)("[^>]*>)/gi;
  let idx = 0;
  out = out.replace(re, (m0, p1, oldText, p3) => {
    if (idx >= names.length) return m0;
    const newName = names[idx++];
    // oldText 是 XML 实体形式，新名是原始文本，比较前先反转义
    if (newName === unescXml(oldText)) return m0;
    changed++;
    return p1 + escXml(newName) + p3;
  });

  return { text: out, changed };
}

/** 在 XML 的 </Trainer> 前插入一个署名条目 */
function appendShnSignature(xml, sigText) {
  if (!sigText) return xml;
  const idx = xml.lastIndexOf('</Trainer>');
  if (idx < 0) return xml;
  const block = `  <Cheat Text="${escXml(sigText)}">\r\n    <Cheatline>\r\n      <Offset>0</Offset>\r\n      <Section>0</Section>\r\n      <ValueOn>00</ValueOn>\r\n      <ValueOff>00</ValueOff>\r\n    </Cheatline>\r\n  </Cheat>\r\n`;
  return xml.slice(0, idx) + block + xml.slice(idx);
}

// ---------------------------------------------------------------- 保存：JSON

/**
 * JSON 保存：优先保留原始格式风格。
 * 若能定位到各 mod 的 "name" 字段则做定点替换；否则整体序列化。
 */
function writeJson(model, originalText) {
  const names = model.mods.map((m) => m.name);
  let changed = 0;
  let out = null;

  // 空条目时直接走整体重建（定点替换无从下手）
  if (names.length === 0) {
    const obj = JSON.parse(originalText);
    obj.mods = [];
    return { text: JSON.stringify(obj, null, 2) + '\n', changed: 0 };
  }

  // 定点替换：找到 mods 数组内每个对象的 name
  const modsStart = originalText.indexOf('"mods"');
  let ok = false;
  if (modsStart >= 0) {
    // 逐个匹配 "name": "..."，只处理 mods 段之后的
    const re = /("name"\s*:\s*)"((?:[^"\\]|\\.)*)"/g;
    re.lastIndex = modsStart;
    let m;
    let idx = 0;
    let result = originalText.slice(0, modsStart);
    let last = modsStart;
    const hits = [];
    while ((m = re.exec(originalText)) !== null) {
      hits.push(m);
    }
    for (const h of hits) {
      if (idx >= names.length) break;
      const newName = names[idx++];
      if (newName !== h[2]) changed++;
      result += originalText.slice(last, h.index) + h[1] + escJson(newName);
      last = h.index + h[0].length;
    }
    if (idx === names.length) {
      result += originalText.slice(last);
      out = result;
      ok = true;
    }
  }

  if (!ok) {
    // 兜底：整体重建
    const obj = JSON.parse(originalText);
    obj.name = model.meta.game || obj.name;
    obj.id = model.meta.cusa || obj.id;
    obj.version = model.meta.version || obj.version;
    obj.process = model.meta.process || obj.process;
    obj.mods = model.mods.map((m) => ({
      name: m.name,
      type: m.type || 'checkbox',
      memory: m.lines.map((l) => ({
        offset: l.offset,
        on: fmtHex(l.on, false),
        off: fmtHex(l.off, false),
      })),
    }));
    return { text: JSON.stringify(obj, null, 2) + '\n', changed: names.length };
  }
  return { text: out, changed };
}

// ---------------------------------------------------------------- 格式转换

/**
 * 将统一模型转换为目标格式并序列化
 * @param {string} target 'json' | 'shn' | 'mc4'
 */
function convertModel(model, target) {
  if (target === 'json') {
    const obj = {
      name: model.meta.game || '',
      id: model.meta.cusa || '',
      version: model.meta.version || '',
      process: model.meta.process || '',
      mods: model.mods.map((m) => ({
        name: m.name,
        type: m.type || 'checkbox',
        memory: m.lines.map((l) => ({
          offset: l.offset,
          on: fmtHex(l.on, false),
          off: fmtHex(l.off, false),
        })),
      })),
      credits: model.meta.author
        ? String(model.meta.author).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : [],
    };
    return JSON.stringify(obj, null, 2) + '\n';
  }

  // shn / mc4 都用 SHN 的 XML 结构
  const attrs = [
    `Game="${escXml(model.meta.game || '')}"`,
    `Moder="${escXml(model.meta.author || '')}"`,
    `Cusa="${escXml(model.meta.cusa || '')}"`,
    `Version="${escXml(model.meta.version || '')}"`,
    `Process="${escXml(model.meta.process || '')}"`,
  ].join(' ');
  const genres = (model.meta.genres || []).map((g) => `  <Genres Name="${escXml(g)}" />`).join('\r\n');
  const cheats = model.mods.map((m) => {
    const lines = m.lines.map((l) => [
      '    <Cheatline>',
      `      <Offset>${escXml(l.offset)}</Offset>`,
      `      <Section>${escXml(l.section || '0')}</Section>`,
      `      <ValueOn>${fmtHex(l.on, true)}</ValueOn>`,
      `      <ValueOff>${fmtHex(l.off, true)}</ValueOff>`,
      '    </Cheatline>',
    ].join('\r\n')).join('\r\n');
    const body = lines ? `\r\n${lines}\r\n  ` : '';
    return `  <Cheat Text="${escXml(m.name)}">${body}</Cheat>`;
  }).join('\r\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>\r\n<Trainer xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${attrs}>\r\n${genres}\r\n  <Items />\r\n${cheats}\r\n</Trainer>\r\n`;

  if (target === 'mc4') {
    return mc4Encrypt(padTo16(xml));
  }
  return xml;
}

/**
 * 保存：保持原格式
 * @param {object} model 统一模型
 * @param {object} opts  { signature, signatureMode }
 */
function serialize(model, opts = {}) {
  const sig = opts.signature || '';
  const mode = opts.signatureMode || 'entry'; // entry | suffix | none

  if (model.sourceFormat === 'json') {
    let r = writeJson(model, model.raw);
    let text = r.text;
    if (sig && mode === 'entry') {
      // JSON 用 credits 承载署名
      try {
        const obj = JSON.parse(text);
        if (!Array.isArray(obj.credits)) obj.credits = [];
        if (!obj.credits.includes(sig)) obj.credits.push(sig);
        text = JSON.stringify(obj, null, 2) + '\n';
      } catch (e) { /* 保持原样 */ }
    } else if (sig && mode === 'suffix') {
      const names = model.mods.map((m) => m.name + ' ' + sig);
      const m2 = Object.assign({}, model, { mods: model.mods.map((m, i) => ({ ...m, name: names[i] })) });
      text = writeJson(m2, model.raw).text;
    }
    return { text, changed: r.changed };
  }

  // shn / mc4
  let xml = model.sourceFormat === 'mc4' ? model.plainXml : model.raw;
  if (sig && mode === 'suffix') {
    const m2 = Object.assign({}, model, {
      mods: model.mods.map((m) => ({ ...m, name: m.name + ' ' + sig })),
    });
    xml = writeShn(m2, xml).text;
  } else {
    xml = writeShn(model, xml).text;
  }
  if (sig && mode === 'entry') {
    xml = appendShnSignature(xml, sig);
  }
  if (model.sourceFormat === 'mc4') {
    return { text: mc4Encrypt(padTo16(xml)), changed: 0, encrypted: true };
  }
  return { text: xml, changed: 0 };
}

module.exports = {
  detectFormat,
  parseCheatFile,
  parseShn,
  parseJsonCheat,
  serialize,
  convertModel,
  mc4Decrypt,
  mc4Encrypt,
  normHex,
  fmtHex,
  escXml,
};
