'use strict';
/**
 * v1.2.0 新功能测试：署名模板 / 批量处理 / 关于对话框
 *
 * 运行：node test-v12.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function section(t) { console.log('\n========== ' + t + ' =========='); }

// ---------------------------------------------------------------- 工具
const ROOT = __dirname;
const CH = 'I:/PS5相关备份/折腾项目/PS5-Repository-List/local/cheats/HEN-Cheats-Collection/cheats';

function mkTmpDir(name) {
  const d = path.join(ROOT, '.tmp-' + name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** 从 main.js 源码里抽出 renderSignature 做单元测试 */
function loadRenderSignature() {
  const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const m = src.match(/function renderSignature\(tpl, opts\) \{[\s\S]*?\n\}/);
  if (!m) return null;
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '; return renderSignature;')();
}

// ================================================================ 署名模板
section('署名模板渲染（主进程 renderSignature）');
{
  const render = loadRenderSignature();
  ok(!!render, '能从 main.js 提取 renderSignature');

  if (render) {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    })();

    // 默认规则
    const d1 = render('————翻译：{作者}，编辑时间{日期}————', { author: 'L.wl', signatureMode: 'entry' });
    ok(d1 === `————翻译：L.wl，编辑时间${today}————`, '默认规则正确：' + d1);

    // 留空用默认
    const d2 = render('', { author: 'L.wl', signatureMode: 'entry' });
    ok(d2 === d1, '留空时回退到默认规则');

    // 各变量
    const d3 = render('————汉化：{作者} {日期}————', { author: '张三', signatureMode: 'entry' });
    ok(d3 === `————汉化：张三 ${today}————`, '简洁模板：' + d3);

    const d4 = render('————{游戏} 中文版，翻译：{作者}，编辑时间{日期}————',
      { author: '李四', game: 'PES 2021', version: '1.02', signatureMode: 'entry' });
    ok(d4.includes('PES 2021') && d4.includes('李四'), '游戏名/版本变量：' + d4);

    const d5 = render('[CN] {作者} {日期}', { author: '王五', signatureMode: 'entry' });
    ok(d5 === `[CN] 王五 ${today}`, '方括号模板：' + d5);

    // 无残留花括号
    ok(!/[{]/.test(d1) && !/[{]/.test(d3) && !/[{]/.test(d5), '渲染后无残留花括号');

    // 老式写死格式
    const d6 = render('————翻译：老王，编辑时间20200101————', { author: '老王', signatureMode: 'entry' });
    ok(d6 === '————翻译：老王，编辑时间20200101————', '老式写死格式原样保留：' + d6);

    // 缺值的老式模板应补全
    const d7 = render('————翻译：，编辑时间————', { author: '赵六', signatureMode: 'entry' });
    ok(d7.includes('赵六') && d7.includes(today), '缺值模板自动补全：' + d7);

    // 无作者名
    const d8 = render('————翻译：{作者}————', { author: '', signatureMode: 'entry' });
    ok(d8.includes('未署名'), '空作者名兜底为「未署名」：' + d8);

    // 不写入署名
    const d9 = render('————翻译：{作者}————', { author: 'x', signatureMode: 'none' });
    ok(d9 === '', '署名方式为「不写入」时返回空串');

    // 游戏名缺失时的兜底（模板里用了 {游戏}）
    const d10 = render('————{游戏}————', { author: 'a', signatureMode: 'entry' });
    ok(d10.includes('未命名游戏'), '游戏名缺失兜底：' + d10);

    // 纯自定义文本原样保留，不被强行套默认格式
    const d11 = render('我自己的标记', { author: 'a', signatureMode: 'entry' });
    ok(d11 === '我自己的标记', '纯自定义文本原样保留：' + d11);
  }
}

// ================================================================ 批量处理
section('批量处理：扫描与产出');
{
  const F = require('./src/formats');

  // 准备测试目录：3 个真金手指文件 + 1 个假 json
  const dir = mkTmpDir('batch');
  const outDir = path.join(ROOT, '.tmp-batch-out');
  fs.rmSync(outDir, { recursive: true, force: true });

  const samples = [];
  const mc4Src = 'I:/下载/CUSA18740_01.08.mc4';
  if (fs.existsSync(mc4Src)) samples.push([mc4Src, 'mc4']);
  if (fs.existsSync(CH)) {
    const shn = path.join(CH, 'shn', 'CUSA00004_01.07_d083461a.shn');
    const json = path.join(CH, 'json', 'CUSA00004_01.07_0764ed4c.json');
    if (fs.existsSync(shn)) samples.push([shn, 'shn']);
    if (fs.existsSync(json)) samples.push([json, 'json']);
  }
  samples.forEach(([src]) => fs.copyFileSync(src, path.join(dir, path.basename(src))));
  // 假 json（无法解析出金手指条目）
  fs.writeFileSync(path.join(dir, 'fake.json'), '{"name":"notacheat","mods":[]}', 'utf8');

  ok(samples.length > 0, '测试样本已准备：' + samples.length + ' 个金手指文件');

  // 模拟主进程的扫描逻辑（与 main.js 中的 scanCheatFiles + probeCheatFile 一致）
  const CHEAT_EXTS = ['.mc4', '.shn', '.json'];
  function scan(d) {
    const found = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!CHEAT_EXTS.includes(ext)) continue;
      if (/_CN\.(mc4|shn|json)$/i.test(e.name)) continue;
      if (/\.bak$/i.test(e.name)) continue;
      found.push({ filePath: path.join(d, e.name), name: e.name, ext: ext.slice(1) });
    }
    return found;
  }
  function probe(fp) {
    try {
      const m = F.parseCheatFile(fp, fs.readFileSync(fp, 'utf8'));
      if (!m || !m.mods || !m.mods.length) return null;
      return { count: m.mods.length, game: m.meta.game || '' };
    } catch (e) { return null; }
  }

  const candidates = scan(dir);
  const valid = [], skipped = [];
  candidates.forEach((c) => {
    const p = probe(c.filePath);
    if (p) valid.push({ ...c, ...p }); else skipped.push(c.name);
  });

  ok(candidates.length === samples.length + 1, '扫描到 ' + candidates.length + ' 个候选（含 1 个假文件）');
  ok(valid.length === samples.length, '有效金手指文件 ' + valid.length + ' 个');
  ok(skipped.includes('fake.json'), '无法解析的文件被跳过：' + skipped.join(', '));
  ok(valid.every((v) => v.count > 0), '每个有效文件都有修改项');

  // 签名：_CN 副本应被跳过
  fs.copyFileSync(valid[0].filePath, path.join(dir, 'test_CN' + path.extname(valid[0].name)));
  const after = scan(dir);
  ok(!after.some((f) => f.name.includes('_CN.')), '扫描时跳过已生成的 _CN 副本');
  fs.rmSync(path.join(dir, 'test_CN' + path.extname(valid[0].name)), { force: true });

  // 产出：_CN 后缀模式
  const T = require('./src/translator');
  let okCount = 0;
  valid.forEach((v) => {
    const model = F.parseCheatFile(v.filePath, fs.readFileSync(v.filePath, 'utf8'));
    const renamed = model.mods.map((m) => {
      const t = T.translate(m.name);
      return { ...m, name: t.hit ? t.text : m.name };
    });
    const out = path.join(dir, path.basename(v.filePath, path.extname(v.filePath)) + '_CN' + path.extname(v.filePath));
    fs.writeFileSync(out, F.serialize({ ...model, mods: renamed }, { signature: '', signatureMode: 'none' }).text, 'utf8');
    ok(fs.existsSync(out), '生成 _CN 副本：' + path.basename(out));
    // 重新解析验证
    const back = F.parseCheatFile(out, fs.readFileSync(out, 'utf8'));
    if (back.mods.length === renamed.length) okCount++;
  });
  ok(okCount === valid.length, '所有 _CN 副本可被重新解析（' + okCount + '/' + valid.length + '）');

  // 跨格式转换：全部转 JSON
  fs.mkdirSync(outDir, { recursive: true });
  let convOk = 0;
  valid.forEach((v) => {
    const model = F.parseCheatFile(v.filePath, fs.readFileSync(v.filePath, 'utf8'));
    const renamed = model.mods.map((m) => {
      const t = T.translate(m.name);
      return { ...m, name: t.hit ? t.text : m.name };
    });
    const text = F.convertModel({ ...model, mods: renamed }, 'json', { signature: '测试署名', signatureMode: 'entry' });
    const out = path.join(outDir, path.basename(v.filePath, path.extname(v.filePath)) + '.json');
    fs.writeFileSync(out, text, 'utf8');
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (j.mods.length === renamed.length) convOk++;
  });
  ok(convOk === valid.length, '跨格式转换全部成功（' + convOk + '/' + valid.length + '）');

  // 清理
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
}

// ================================================================ 关于对话框
section('关于对话框与 GitHub 链接');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');

  ok(html.includes('id="aboutModal"'), 'index.html 有关于对话框');
  ok(html.includes('id="btnAbout"'), 'index.html 有「关于」按钮');
  ok(html.includes('id="btnAboutGithub"'), 'index.html 有「打开 GitHub」按钮');
  ok(html.includes('id="btnAboutRelease"'), 'index.html 有「下载最新版本」按钮');
  ok(html.includes('id="aboutVersion"'), 'index.html 有版本号显示位');

  ok(main.includes("GITHUB_URL = 'https://github.com/liweili/PS5CheatCN'"), 'main.js 定义了 GitHub 地址');
  ok(main.includes("ipcMain.handle('shell:openExternal'"), 'main.js 有 openExternal IPC');
  ok(/^\s*if \(!\/\^https\?:\\\/\\\/\/i\.test\(url\)\)/m.test(main), 'openExternal 校验协议（只允许 http/https）');
  ok(main.includes('label: \'关于本工具...\''), '菜单里有「关于本工具」');
  ok(main.includes('label: \'项目主页（GitHub）\''), '菜单里有「项目主页（GitHub）」');

  ok(renderer.includes('function openAboutDialog'), 'renderer 有 openAboutDialog');
  ok(renderer.includes('function bindAbout'), 'renderer 有 bindAbout');
  ok(preload.includes('openExternal'), 'preload 暴露 openExternal');

  // 图标要进 asar
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(pkg.build.files.some((f) => f.includes('build/icon.png')), '图标已配置进打包文件列表');
}

// ================================================================ 批量界面
section('批量处理界面元素');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(html.includes('id="batchModal"'), '有批量处理对话框');
  ok(html.includes('id="btnBatch"'), '工具栏有「批量处理」按钮');
  ok(html.includes('id="batchMode"'), '有更新方式选择');
  ok(html.includes('id="batchDir"'), '有文件夹选择');
  ok(html.includes('id="batchOutDir"'), '有输出文件夹选择');
  ok(html.includes('id="batchFormat"'), '有输出格式选择');
  ok(html.includes('id="batchFileList"'), '有文件列表');
  ok(html.includes('id="batchResult"'), '有结果区');

  // 三种更新方式
  ok(html.includes('value="suffix"'), '支持「_CN 副本」模式');
  ok(html.includes('value="overwrite"'), '支持「覆盖原文件」模式');
  ok(html.includes('value="folder"'), '支持「输出到指定文件夹」模式');
}

// ================================================================ 汇总
console.log('\n========================================');
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log('========================================');
process.exit(fail ? 1 : 0);
