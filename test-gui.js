'use strict';
/**
 * GUI 逻辑层集成测试。
 * 不启动窗口，直接驱动 renderer.js 的核心逻辑（用 jsdom 风格的最小 DOM 替身），
 * 验证：打开 → 汉化 → 编辑 → 保存 → 转换 全流程。
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ---- 最小 DOM 替身 ----
class El {
  constructor(id) {
    this.id = id; this.value = ''; this.textContent = ''; this.innerHTML = '';
    this.className = ''; this.disabled = false; this.checked = false;
    this.dataset = {}; this.children = []; this.style = {};
    this._listeners = {};
  }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  get classList() {
    const self = this;
    return {
      add: (...c) => { c.forEach(x => { if (!self.className.includes(x)) self.className = (self.className + ' ' + x).trim(); }); },
      remove: (...c) => { c.forEach(x => { self.className = self.className.split(/\s+/).filter(y => y !== x).join(' '); }); },
      contains: (x) => self.className.includes(x),
    };
  }
  closest() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); }
  remove() {}
  set innerHTML(v) { this._html = v; this.children = []; }
  get innerHTML() { return this._html || ''; }
  get onclick() { return this._onclick; }
  set onclick(fn) { this._onclick = fn; }
  get oninput() { return this._oninput; }
  set oninput(fn) { this._oninput = fn; }
  get onchange() { return this._onchange; }
  set onchange(fn) { this._onchange = fn; }
  get onkeydown() { return this._onkeydown; }
  set onkeydown(fn) { this._onkeydown = fn; }
}
const els = {};
const registry = new Map();
global.document = {
  getElementById: (id) => {
    if (!els[id]) { els[id] = new El(id); registry.set(id, els[id]); }
    return els[id];
  },
  createElement: (t) => new El(t),
  createDocumentFragment: () => new El('frag'),
  addEventListener: () => {},
  querySelectorAll: () => [],
};
global.window = {
  api: {
    openFile: async () => ({ canceled: true }),
    openPath: async () => ({ ok: false, error: 'test' }),
    save: async (p) => ({ ok: true, filePath: p.filePath, changed: 1 }),
    saveAs: async (p) => ({ ok: true, filePath: p.filePath }),
    translateOne: async (n) => require('./src/translator').translate(n),
    translateBatch: async (ns) => ns.map((n) => require('./src/translator').translate(n)),
    openDir: async () => ({ ok: true }),
    onMenu: () => {},
  },
};
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
};
global.escapeHtml = undefined;

// ---- 加载被测模块 ----
const rendererSrc = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
// 暴露内部状态供测试
const mod = { exports: {} };
const fn = new Function('module', 'exports', 'require', 'window', 'document', 'localStorage', rendererSrc + '\nmodule.exports = { state, loadModel, doTranslateAll, revertOne, translateOne, applyEdit, buildSignature, updateStat, renderList, renderEdit };');
fn(mod, mod.exports, require, global.window, global.document, global.localStorage);
const R = mod.exports;

const F = require('./src/formats');

let pass = 0, fail = 0;
function ok(c, m, e) { if (c) { pass++; console.log('  [PASS] ' + m); } else { fail++; console.log('  [FAIL] ' + m + (e ? ' -> ' + e : '')); } }

// ============================================================
console.log('========== GUI 逻辑：加载模型 ==========');
const CH = 'I:\\PS5相关备份\\折腾项目\\PS5-Repository-List\\local\\cheats\\HEN-Cheats-Collection\\cheats';

{
  const p = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
  const txt = fs.readFileSync(p, 'utf8');
  const model = F.parseCheatFile(p, txt);
  R.loadModel(p, {
    format: model.format, sourceFormat: model.sourceFormat, meta: model.meta,
    mods: model.mods, raw: model.raw, plainXml: model.plainXml,
  });
  ok(R.state.mods.length === 9, '加载 9 个条目');
  ok(R.state.mods[0].origName === 'Godmode', '保留原名: ' + R.state.mods[0].origName);
  ok(R.state.sourceFormat === 'shn', '源格式: ' + R.state.sourceFormat);
  ok(R.state.filePath === p, '文件路径记录');
}

async function main() {
console.log('========== GUI 逻辑：一键汉化全部 ==========');
{
  await R.doTranslateAll();
  const translated = R.state.mods.filter((m) => m.name !== m.origName);
  ok(translated.length > 0, `汉化了 ${translated.length}/9 条`);
  ok(R.state.mods[0].name === '无敌', '第1条 → ' + R.state.mods[0].name);
  ok(R.state.dirty === true, '标记为已修改');
}

console.log('========== GUI 逻辑：单条汉化 ==========');
{
  R.revertOne(0);
  ok(R.state.mods[0].name === R.state.mods[0].origName, '撤销后恢复原文');
  await R.translateOne(0);
  ok(R.state.mods[0].name === '无敌', '单条汉化 → ' + R.state.mods[0].name);
  ok(R.state.mods[0].translated === true, '标记 translated');
}

console.log('========== GUI 逻辑：手动微调 ==========');
{
  R.state.selected = 1;
  R.state.mods[1].name = '我的自定义名称';
  R.state.mods[1].translated = true;
  R.updateStat();
  ok(R.state.mods[1].name === '我的自定义名称', '手动改名生效');
}

console.log('========== GUI 逻辑：署名生成 ==========');
{
  R.state.settings.author = 'L.wl';
  R.state.settings.signature = '————翻译：L.wl，编辑时间20261104————';
  R.state.settings.signatureMode = 'entry';
  const sig = R.buildSignature();
  ok(sig.includes('L.wl'), '署名含作者: ' + sig);
  ok(/\d{8}/.test(sig), '署名含日期');

  // 模板无日期时应自动填入今天
  R.state.settings.signature = '————翻译：，编辑时间————';
  const sig2 = R.buildSignature();
  ok(/\d{8}/.test(sig2), '自动填日期: ' + sig2);

  R.state.settings.signatureMode = 'none';
  ok(R.buildSignature() === '', 'none 模式不写署名');
  R.state.settings.signatureMode = 'entry';
}

console.log('========== GUI 逻辑：保存到原格式（SHN） ==========');
{
  const tmp = path.join(require('os').tmpdir(), 'gui-test-out.shn');
  const model = {
    format: 'shn', sourceFormat: 'shn',
    meta: R.state.meta,
    mods: R.state.mods.map((m) => ({ name: m.name, type: m.type, lines: m.lines })),
    raw: R.state.raw, plainXml: R.state.plainXml,
  };
  const out = F.serialize(model, { signature: '————翻译：L.wl，编辑时间20261104————', signatureMode: 'entry' });
  fs.writeFileSync(tmp, out.text, 'utf8');
  const back = F.parseCheatFile(tmp, fs.readFileSync(tmp, 'utf8'));
  ok(back.mods.length === 10, '保存后条目 9+署名=10: ' + back.mods.length);
  ok(back.mods[0].name === '无敌', '第1条中文已写入');
  ok(back.mods.some((m) => m.name.includes('翻译')), '署名条目存在');
  fs.unlinkSync(tmp);
}

console.log('========== GUI 逻辑：MC4 保存往返 ==========');
{
  const src = 'I:\\下载\\CUSA18740_01.08.mc4';
  const txt = fs.readFileSync(src, 'utf8');
  const model = F.parseCheatFile(src, txt);
  model.mods[0].name = '无限体力';
  model.mods[1].name = '最大预算';
  const out = F.serialize(model, { signature: '————翻译：L.wl，编辑时间20261104————', signatureMode: 'entry' });
  const back = F.parseCheatFile('x.mc4', out.text);
  ok(back.mods.length === model.mods.length + 1, 'MC4 条目数+署名: ' + back.mods.length);
  ok(back.mods[0].name === '无限体力', 'MC4 第1条: ' + back.mods[0].name);
  ok(back.mods[1].name === '最大预算', 'MC4 第2条: ' + back.mods[1].name);
  ok(back.meta.cusa === 'CUSA18740', 'MC4 元数据保留');
}

console.log('========== GUI 逻辑：三格式互转 ==========');
{
  const p = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
  const model = F.parseCheatFile(p, fs.readFileSync(p, 'utf8'));
  model.mods[0].name = '无敌';
  for (const target of ['json', 'shn', 'mc4']) {
    const out = F.convertModel(model, target);
    const back = F.parseCheatFile('x.' + target, out);
    ok(back.mods.length === 9, `→ ${target.toUpperCase()} 条目数保持: ${back.mods.length}`);
    ok(back.mods[0].name === '无敌', `→ ${target.toUpperCase()} 中文名保持`);
  }
}

console.log('========== 回归：空状态元素不被销毁 ==========');
{
  // renderList() 用 innerHTML 覆盖 modList，会销毁其子元素。
  // 曾因此导致 loadModel 访问已销毁的 emptyState 抛异常，
  // 造成「打开文件后界面卡住 / 打不开」。
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  ok(!/id="emptyState"/.test(html), 'index.html 中不再有静态 emptyState 元素');
  const rj = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
  ok(rj.indexOf("emptyState") === -1, 'renderer.js 中不再引用 emptyState');

  // 模拟真实场景：先渲染一次列表（覆盖 innerHTML），再 loadModel
  R.renderList();
  R.loadModel(path.join(CH, 'json', 'CUSA00004_01.07_0764ed4c.json'), {
    format: 'json', sourceFormat: 'json',
    meta: { game: 'T', cusa: 'C', version: '1', process: 'p', author: 'a', genres: [] },
    mods: [{ name: 'Godmode', type: 'checkbox', lines: [] }],
    raw: '{}', plainXml: null,
  });
  ok(R.state.mods.length === 1, 'loadModel 在列表重绘后仍正常完成');
  ok(R.state.mods[0].name === 'Godmode', '模型内容正确');
}

console.log('\n========================================');
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log('========================================');
process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
