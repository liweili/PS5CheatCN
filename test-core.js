'use strict';
/** 核心库自测：格式解析 / 保存往返 / 转换 */
const fs = require('fs');
const path = require('path');
const F = require('./src/formats');

const CH = 'I:\\PS5相关备份\\折腾项目\\PS5-Repository-List\\local\\cheats\\HEN-Cheats-Collection\\cheats';
let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  [PASS] ' + msg); }
  else { fail++; console.log('  [FAIL] ' + msg + (extra ? '  -> ' + extra : '')); }
}

console.log('========== 1. MC4 解密/加密往返 ==========');
{
  const p = 'I:\\下载\\CUSA18740_01.08.mc4';
  const txt = fs.readFileSync(p, 'utf8');
  const model = F.parseCheatFile(p, txt);
  ok(model.format === 'mc4', '识别为 mc4 格式');
  ok(model.meta.game.includes('eFootball'), '游戏名: ' + model.meta.game);
  ok(model.meta.cusa === 'CUSA18740', 'Cusa: ' + model.meta.cusa);
  ok(model.meta.version === '01.08', 'Version: ' + model.meta.version);
  ok(model.mods.length === 4, 'Cheat 条目数: ' + model.mods.length);
  ok(model.mods[0].lines.length === 1, '首条 Cheatline 数: ' + model.mods[0].lines.length);
  ok(/^[0-9A-F]+$/.test(model.mods[0].lines[0].on), 'ValueOn hex: ' + model.mods[0].lines[0].on);

  // 往返：解密再加密应与原文件完全一致
  const plain = F.mc4Decrypt(txt);
  const re = F.mc4Encrypt(plain);
  ok(re === txt.trim(), 'MC4 加密往返字节级一致');

  // 改名字后保存，解密回来应看到新名字
  model.mods[0].name = '测试中文名';
  const saved = F.serialize(model, { signature: '', signatureMode: 'none' });
  const back = F.parseCheatFile('x.mc4', saved.text);
  ok(back.mods[0].name === '测试中文名', 'MC4 保存后名字可读回');
}

console.log('========== 2. SHN 解析/保存 ==========');
{
  const p = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
  const txt = fs.readFileSync(p, 'utf8');
  const model = F.parseCheatFile(p, txt);
  ok(model.format === 'shn', '识别为 shn');
  ok(model.meta.game === 'inFamous: Second Son', '游戏名: ' + model.meta.game);
  ok(model.meta.cusa === 'CUSA00004', 'Cusa: ' + model.meta.cusa);
  ok(model.meta.author === 'Weysincha', '作者: ' + model.meta.author);
  ok(model.mods.length === 9, 'Cheat 条目数: ' + model.mods.length);
  ok(model.mods[0].name === 'Godmode', '首个名字: ' + model.mods[0].name);
  ok(model.mods[5].lines.length === 2, '第6条有2个Cheatline: ' + model.mods[5].lines.length);
  ok(model.mods[0].lines[0].on === '909090909090909090', 'ValueOn 归一化: ' + model.mods[0].lines[0].on);

  // 改名保存，其余内容必须原样保留
  model.mods[0].name = '无敌';
  const saved = F.serialize(model, { signature: '', signatureMode: 'none' });
  ok(saved.text.includes('Text="无敌"'), 'SHN 改名写入成功');
  ok(saved.text.includes('<Genres Name="Action" />'), 'Genres 保留');
  ok(saved.text.includes('<Items />'), 'Items 保留');
  ok(saved.text.includes('ValueOn>90-90-90-90-90-90-90-90-90<'), 'ValueOn 连字符格式保留');
  const re = F.parseCheatFile('x.shn', saved.text);
  ok(re.mods.length === 9 && re.mods[0].name === '无敌', 'SHN 保存后重新解析正确');
  ok(re.mods[1].name === 'Infinite Energy', 'SHN 未改动条目保持原名');
}

console.log('========== 3. JSON 解析/保存 ==========');
{
  const p = path.join(CH, 'json', 'CUSA00004_01.07_0764ed4c.json');
  const txt = fs.readFileSync(p, 'utf8');
  const model = F.parseCheatFile(p, txt);
  ok(model.format === 'json', '识别为 json');
  ok(model.meta.game === 'inFamous: Second Son', '游戏名: ' + model.meta.game);
  ok(model.meta.cusa === 'CUSA00004', 'id: ' + model.meta.cusa);
  ok(model.meta.version === '01.07', 'version: ' + model.meta.version);
  ok(model.meta.author === 'Weysincha', 'credits: ' + model.meta.author);
  ok(model.mods.length === 6, 'mods 数: ' + model.mods.length);
  ok(model.mods[0].name === 'Godmode', '首 mod: ' + model.mods[0].name);
  ok(model.mods[0].type === 'checkbox', 'type: ' + model.mods[0].type);
  ok(model.mods[0].lines[0].on === '909090909090909090', 'on: ' + model.mods[0].lines[0].on);

  model.mods[0].name = '无敌';
  const saved = F.serialize(model, { signature: '', signatureMode: 'none' });
  const re = JSON.parse(saved.text);
  ok(re.mods[0].name === '无敌', 'JSON 改名写入成功');
  ok(re.mods.length === 6, 'JSON mods 数不变');
  ok(re.credits[0] === 'Weysincha', 'JSON credits 保留');
  ok(re.mods[1].name === 'Infinite Energy', 'JSON 未改动条目保持');
}

console.log('========== 4. 格式转换 ==========');
{
  const p = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
  const model = F.parseCheatFile(p, fs.readFileSync(p, 'utf8'));

  const json = F.convertModel(model, 'json');
  const jm = F.parseCheatFile('x.json', json);
  ok(jm.mods.length === 9, 'SHN→JSON 条目数一致: ' + jm.mods.length);
  ok(jm.mods[0].name === 'Godmode', 'SHN→JSON 名字一致');
  ok(jm.mods[0].lines[0].on === '909090909090909090', 'SHN→JSON hex 无连字符');

  const shn = F.convertModel(model, 'shn');
  const sm = F.parseCheatFile('x.shn', shn);
  ok(sm.mods.length === 9, 'SHN→SHN 条目数一致');
  ok(sm.mods[5].lines.length === 2, 'SHN→SHN 多Cheatline保留');

  const mc4 = F.convertModel(model, 'mc4');
  const mm = F.parseCheatFile('x.mc4', mc4);
  ok(mm.mods.length === 9, 'SHN→MC4 条目数一致: ' + mm.mods.length);
  ok(mm.mods[0].name === 'Godmode', 'SHN→MC4 名字一致');
  ok(mm.mods[5].lines.length === 2, 'SHN→MC4 Cheatline 数一致');
  ok(mc4.length % 4 === 0, 'MC4 base64 长度合法: ' + mc4.length);

  // JSON → MC4
  const jp = path.join(CH, 'json', 'CUSA00004_01.07_0764ed4c.json');
  const jmodel = F.parseCheatFile(jp, fs.readFileSync(jp, 'utf8'));
  const j2m = F.convertModel(jmodel, 'mc4');
  const j2mm = F.parseCheatFile('x.mc4', j2m);
  ok(j2mm.mods.length === 6, 'JSON→MC4 条目数一致: ' + j2mm.mods.length);
  ok(j2mm.mods[0].name === 'Godmode', 'JSON→MC4 名字一致');
}

console.log('========== 5. 署名信息写入 ==========');
{
  const p = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
  const model = F.parseCheatFile(p, fs.readFileSync(p, 'utf8'));
  const sig = '————翻译：L.wl，编辑时间20261104————';
  const saved = F.serialize(model, { signature: sig, signatureMode: 'entry' });
  ok(saved.text.includes(sig), 'SHN 署名条目写入');
  const re = F.parseCheatFile('x.shn', saved.text);
  ok(re.mods.length === 10, '署名后条目数+1: ' + re.mods.length);

  const jp = path.join(CH, 'json', 'CUSA00004_01.07_0764ed4c.json');
  const jm = F.parseCheatFile(jp, fs.readFileSync(jp, 'utf8'));
  const js = F.serialize(jm, { signature: sig, signatureMode: 'entry' });
  const jo = JSON.parse(js.text);
  ok(jo.credits.includes(sig), 'JSON credits 写入署名: ' + JSON.stringify(jo.credits));
}

console.log('========== 6. 边界情况 ==========');
{
  const p = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
  const model = F.parseCheatFile(p, fs.readFileSync(p, 'utf8'));
  // 名称含 XML 特殊字符
  model.mods[0].name = 'A&B <test> "q"';
  const saved = F.serialize(model, { signature: '', signatureMode: 'none' });
  const re = F.parseCheatFile('x.shn', saved.text);
  ok(re.mods[0].name === 'A&B <test> "q"', 'XML 特殊字符转义往返: ' + JSON.stringify(re.mods[0].name));

  // 中文名往返
  model.mods[1].name = '无限生命';
  const s2 = F.serialize(model, { signature: '', signatureMode: 'none' });
  const r2 = F.parseCheatFile('x.shn', s2.text);
  ok(r2.mods[1].name === '无限生命', '中文名 SHN 往返');

  const jp = path.join(CH, 'json', 'CUSA00004_01.07_0764ed4c.json');
  const jm = F.parseCheatFile(jp, fs.readFileSync(jp, 'utf8'));
  jm.mods[1].name = '无限生命';
  const js = F.serialize(jm, { signature: '', signatureMode: 'none' });
  const jo = JSON.parse(js.text);
  ok(jo.mods[1].name === '无限生命', '中文名 JSON 往返');

  // 空 mods
  const empty = { format: 'json', sourceFormat: 'json', meta: model.meta, mods: [], raw: fs.readFileSync(jp, 'utf8') };
  const es = F.serialize(empty, { signature: '', signatureMode: 'none' });
  ok(JSON.parse(es.text).mods.length === 0, '空 mods 不崩');
}

console.log('========== 7. 批量样本扫描 ==========');
{
  for (const sub of ['mc4', 'shn', 'json']) {
    const dir = path.join(CH, sub);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.' + sub));
    let okc = 0, errc = 0;
    const errs = [];
    for (const f of files.slice(0, 60)) {
      try {
        const m = F.parseCheatFile(path.join(dir, f), fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!m.mods.length) throw new Error('0 条目');
        okc++;
      } catch (e) { errc++; errs.push(f + ': ' + e.message); }
    }
    console.log(`  ${sub}: 成功 ${okc} / 失败 ${errc} (共取样 ${Math.min(60, files.length)}/${files.length})`);
    if (errs.length) errs.slice(0, 3).forEach(e => console.log('      ! ' + e));
  }
}

console.log('\n========================================');
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log('========================================');
process.exit(fail ? 1 : 0);
