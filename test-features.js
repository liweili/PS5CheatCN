'use strict';
/**
 * v1.1 新功能测试：游戏术语表、乱码符号修正、格式转换署名。
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const T = require('./src/translator');
const C = require('./src/text-cleaner');
const G = require('./src/game-terms');
const F = require('./src/formats');

let pass = 0, fail = 0;
function ok(c, m, e) { if (c) { pass++; console.log('  [PASS] ' + m); } else { fail++; console.log('  [FAIL] ' + m + (e ? '  -> ' + e : '')); } }

console.log('========== 1. 游戏术语表 ==========');
{
  // 用户明确要求：Combo 应译「连招」或「连续技」
  ok(T.translate('Combo').text === '连招', 'Combo → ' + T.translate('Combo').text);
  ok(T.translate('Max Combo').text.includes('连招'), 'Max Combo → ' + T.translate('Max Combo').text);
  ok(T.translate('Combo Meter').text === '连招槽', 'Combo Meter → ' + T.translate('Combo Meter').text);
  ok(T.translate('Special Combo').text === '必杀连招', 'Special Combo → ' + T.translate('Special Combo').text);
  ok(T.translate('Combo Damage').text === '连招伤害', 'Combo Damage → ' + T.translate('Combo Damage').text);
  ok(T.translate('Ultimate Combo').text === '终极连招', 'Ultimate Combo → ' + T.translate('Ultimate Combo').text);

  // 术语表里不能有「连段」（旧译法）
  const seg = Object.entries(G.GAME_TERMS).filter(([k, v]) => String(v).includes('连段'));
  ok(seg.length === 0, '术语表中无残留「连段」译法', seg.map(x => x[0]).join(','));

  // 常见游戏术语
  const expect = {
    'Melee': '近战', 'Ranged': '远程', 'Checkpoint': '检查点', 'Respawn': '重生',
    'Save Point': '存档点', 'Chakra': '查克拉', 'Ninjutsu': '忍术',
    'Skill Points': '技能点', 'Max Level': '满级', 'One Hit Kill': '一击必杀',
    'Godmode': '无敌', 'Bullet Time': '子弹时间', 'Slow Motion': '慢动作',
    'Fast Travel': '快速旅行', 'Health': '生命值', 'Stamina': '体力',
    'Focus': '专注', 'Super Meter': '超能槽', 'Rage': '狂怒', 'Fury': '怒火',
    'Shards': '碎片', 'Lums': '卢姆', 'Canteen': '水壶', 'Scrap': '废料',
    'Melee Attack': '近战攻击', 'Heavy Attack': '重攻击', 'Light Attack': '轻攻击',
    'Ultimate': '终极技能', 'Unlocked': '解锁', 'All Items Unlocked': '解锁全部道具',
  };
  let bad = [];
  for (const [k, v] of Object.entries(expect)) {
    const got = T.translate(k).text;
    if (got !== v) bad.push(k + ': 期望 ' + v + ' 得到 ' + got);
  }
  ok(bad.length === 0, `常见术语 ${Object.keys(expect).length} 项全部正确`, bad.join(' | '));
}

console.log('========== 2. 乱码与符号修正 ==========');
{
  // 连续问号（编码损坏的中文）
  let r = C.cleanText('Infinite Stamina HP? ????');
  ok(r.text === 'Infinite Stamina HP', '连续问号清理: ' + JSON.stringify(r.text));
  ok(r.changed === true, '标记为已修改');

  // UTF-8 替换符
  r = C.cleanText('God\uFFFD\uFFFDmode');
  ok(r.text === 'Godmode', 'U+FFFD 替换符清理: ' + JSON.stringify(r.text));

  // 控制字符
  r = C.cleanText('God\u0000mode\u0007');
  ok(r.text === 'Godmode', '控制字符清理: ' + JSON.stringify(r.text));

  // 零宽字符
  r = C.cleanText('God\u200Bmode');
  ok(r.text === 'Godmode', '零宽字符清理: ' + JSON.stringify(r.text));

  // 多余空格
  r = C.cleanText('  Infinite   Ammo  ');
  ok(r.text === 'Infinite Ammo', '多余空格清理: ' + JSON.stringify(r.text));

  // 全角括号转半角
  r = C.cleanText('Godmode（MC）');
  ok(r.text.includes('(MC)'), '全角括号转半角: ' + JSON.stringify(r.text));

  // 必须保留的：数字、按键、缩写
  r = C.cleanText('Max 999,999,9999 Gold');
  ok(r.text === 'Max 999,999,9999 Gold', '数字完整保留: ' + JSON.stringify(r.text));
  r = C.cleanText('L3 + R2 On R3 + R2 Off');
  ok(r.text === 'L3 + R2 On R3 + R2 Off', '按键组合保留: ' + JSON.stringify(r.text));
  r = C.cleanText('Infinite Ammo x99 (MC)');
  ok(r.text === 'Infinite Ammo x99 (MC)', '倍率与缩写保留: ' + JSON.stringify(r.text));

  // 问号检测
  ok(C.detectGarbage('HP? ????').length === 1, '乱码检测: ' + JSON.stringify(C.detectGarbage('HP? ????')));
  ok(C.detectGarbage('Clean Text').length === 0, '正常文本无误报');
}

console.log('========== 3. 翻译时自动修正乱码 ==========');
{
  let r = T.translate('Infinite Stamina HP? ????');
  ok(r.text === '无限体力HP', '乱码条目翻译后修正: ' + JSON.stringify(r.text));
  ok(r.reason.includes('乱码'), '提示已修正乱码: ' + r.reason);

  r = T.translate('Godmode');
  ok(r.text === '无敌', '正常条目不受影响');
  ok(!r.reason.includes('乱码'), '正常条目不误报');

  // 已含中文的条目只清理不重译
  r = T.translate('无敌???');
  ok(r.text === '无敌', '已含中文只清理: ' + JSON.stringify(r.text));
}

console.log('========== 4. 跨格式转换写入署名 ==========');
{
  const src = 'I:\\下载\\CUSA18740_01.08.mc4';
  const model = F.parseCheatFile(src, fs.readFileSync(src, 'utf8'));
  const sig = '————翻译：L.wl，编辑时间20261104————';

  // JSON 转换：署名进 credits
  const json = F.convertModel(model, 'json', { signature: sig, signatureMode: 'entry' });
  const jo = JSON.parse(json);
  ok(jo.credits.includes(sig), 'JSON 转换写入 credits: ' + JSON.stringify(jo.credits));
  ok(jo.credits.includes(model.meta.author), 'JSON 保留原作者: ' + jo.credits[0]);
  ok(jo.mods.length === model.mods.length, 'JSON 条目数不变');

  // SHN 转换：署名作为独立条目
  const shn = F.convertModel(model, 'shn', { signature: sig, signatureMode: 'entry' });
  const sm = F.parseCheatFile('x.shn', shn);
  ok(sm.mods.length === model.mods.length + 1, 'SHN 转换追加署名条目: ' + sm.mods.length);
  ok(sm.mods[sm.mods.length - 1].name === sig, 'SHN 末条为署名');

  // MC4 转换：签名名为独立条目且仍是加密态
  const mc4 = F.convertModel(model, 'mc4', { signature: sig, signatureMode: 'entry' });
  ok(/^[A-Za-z0-9+/=\s]+$/.test(mc4.trim()), 'MC4 转换输出为 base64');
  const mm = F.parseCheatFile('x.mc4', mc4);
  ok(mm.mods.length === model.mods.length + 1, 'MC4 转换追加署名条目: ' + mm.mods.length);
  ok(mm.mods[mm.mods.length - 1].name === sig, 'MC4 末条为署名');

  // suffix 模式
  const json2 = F.convertModel(model, 'json', { signature: sig, signatureMode: 'suffix' });
  const jo2 = JSON.parse(json2);
  ok(jo2.mods[0].name.endsWith(sig), 'suffix 模式附加到每个条目');

  // none 模式不加署名
  const json3 = F.convertModel(model, 'json', { signature: sig, signatureMode: 'none' });
  const jo3 = JSON.parse(json3);
  ok(!jo3.credits.includes(sig), 'none 模式不写署名');
  ok(jo3.mods[0].name === model.mods[0].name, 'none 模式不改名');
}

console.log('========== 5. 三种格式署名行为一致 ==========');
{
  const src = 'I:\\下载\\CUSA18740_01.08.mc4';
  const model = F.parseCheatFile(src, fs.readFileSync(src, 'utf8'));
  const sig = '————翻译：L.wl，编辑时间20261104————';

  // 同格式保存（serialize）
  const sameMc4 = F.serialize(model, { signature: sig, signatureMode: 'entry' });
  const sm = F.parseCheatFile('x.mc4', sameMc4.text);
  ok(sm.mods.length === model.mods.length + 1, '同格式 MC4 追加署名');

  // 跨格式转换（convertModel）
  const convMc4 = F.convertModel(model, 'mc4', { signature: sig, signatureMode: 'entry' });
  const cm = F.parseCheatFile('x.mc4', convMc4);
  ok(cm.mods.length === sm.mods.length, '同格式与转换的条目数一致');
  ok(cm.mods[0].name === sm.mods[0].name, '同格式与转换的名字一致');
}

console.log('\n========================================');
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log('========================================');
process.exit(fail ? 1 : 0);
