'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const F = require('./src/formats');
const T = require('./src/translator');

let win = null;

/** 项目主页（关于对话框与帮助菜单共用） */
const GITHUB_URL = 'https://github.com/liweili/PS5CheatCN';
/** 当前版本号（从 package.json 读） */
const APP_VERSION = require('./package.json').version;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: 'PS5 金手指自动汉化工具',
    backgroundColor: '#1b1e26',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile('index.html');

  // 把版本号注入渲染层（关于对话框显示用）
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(
      `window.__APP_VERSION__ = ${JSON.stringify(APP_VERSION)};`
    ).catch(() => { /* 注入失败不影响功能 */ });
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// ---------------------------------------------------------------- 菜单
function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开金手指文件...', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu', 'open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu', 'save') },
        { label: '另存为...', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu', 'saveAs') },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '操作',
      submenu: [
        { label: '自动汉化全部', accelerator: 'CmdOrCtrl+T', click: () => win.webContents.send('menu', 'translateAll') },
        { label: '撤销全部汉化', click: () => win.webContents.send('menu', 'revertAll') },
        { type: 'separator' },
        { label: '设置...', click: () => win.webContents.send('menu', 'settings') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于本工具...', click: () => win.webContents.send('menu', 'about') },
        { label: '项目主页（GitHub）', click: () => require('electron').shell.openExternal(GITHUB_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // 先搬说明文档，再建窗口。
  // 放在 createWindow 之前是为了保证：即使窗口创建失败（无显卡/沙箱环境），
  // 说明文档也已经复制到位。
  copyReadmeToAppDir();

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * 把使用说明从 resources 复制到程序根目录，方便用户直接查看。
 * extraResources 只会把它放进 resources\，这里做一次搬运。
 */
function copyReadmeToAppDir() {
  try {
    const dst = path.join(path.dirname(app.getPath('exe')), '使用说明.md');
    if (fs.existsSync(dst)) return;

    // 说明文档打包在 asar 内（app.asar/使用说明.md）
    //
    // 关键坑：Electron 的 asar 虚拟文件系统对 existsSync 的判定与
    // readFileSync 不一致 —— existsSync 对「resourcesPath + app.asar + 相对路径」
    // 可能返回 false，但 readFileSync 却能正常读到内容。
    // 所以这里不用 existsSync 判断，直接尝试读取，读到就写。
    const candidates = [
      path.join(process.resourcesPath, 'app.asar', '使用说明.md'),
      path.join(process.resourcesPath, '使用说明.md'),
    ];
    for (const src of candidates) {
      try {
        const content = fs.readFileSync(src);
        if (content && content.length) {
          fs.writeFileSync(dst, content);
          return;
        }
      } catch (e) { /* 换下一个候选路径 */ }
    }
  } catch (e) {
    console.error('复制使用说明失败:', e.message);
    // 失败时重试一次（可能是 asar 尚未挂载完成）
    setTimeout(copyReadmeToAppDir, 2000);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------- IPC

/** 打开文件 */
ipcMain.handle('file:open', async (evt) => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择金手指文件',
    properties: ['openFile'],
    filters: [
      { name: '所有金手指文件', extensions: ['mc4', 'shn', 'json'] },
      { name: 'MC4（加密）', extensions: ['mc4'] },
      { name: 'SHN（XML）', extensions: ['shn'] },
      { name: 'JSON', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const filePath = res.filePaths[0];
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const model = F.parseCheatFile(filePath, text);
    return { canceled: false, filePath, model: packModel(model) };
  } catch (e) {
    return { canceled: false, error: e.message };
  }
});

/** 读取指定路径（拖拽用） */
ipcMain.handle('file:openPath', async (evt, filePath) => {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const model = F.parseCheatFile(filePath, text);
    return { ok: true, filePath, model: packModel(model) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** 保存到原文件 */
ipcMain.handle('file:save', async (evt, payload) => {
  const { filePath, model, opts } = payload;
  try {
    const out = F.serialize(reviveModel(model), opts || {});
    fs.writeFileSync(filePath, out.text, 'utf8');
    return { ok: true, filePath, changed: out.changed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** 另存为 */
ipcMain.handle('file:saveAs', async (evt, payload) => {
  const { model, opts, defaultName, sourceFormat } = payload;
  const ext = (opts && opts.targetFormat) || sourceFormat || 'json';
  const res = await dialog.showSaveDialog(win, {
    title: '保存金手指文件',
    defaultPath: defaultName || `cheat.${ext}`,
    filters: [
      { name: 'MC4（加密）', extensions: ['mc4'] },
      { name: 'SHN（XML）', extensions: ['shn'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try {
    const m = reviveModel(model);
    let text;
    if (opts && opts.targetFormat && opts.targetFormat !== m.sourceFormat) {
      // 格式转换输出
      text = F.convertModel(m, opts.targetFormat);
    } else {
      text = F.serialize(m, opts || {}).text;
    }
    fs.writeFileSync(res.filePath, text, 'utf8');
    return { ok: true, filePath: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** 翻译单条 */
ipcMain.handle('tr:one', async (evt, name) => {
  const r = T.translate(name);
  return r;
});

/** 批量翻译 */
ipcMain.handle('tr:batch', async (evt, names) => {
  return names.map((n) => T.translate(n));
});

/**
 * 保存到指定路径（保存对话框用）。
 * 与 file:saveAs 的区别：不弹系统对话框，路径由渲染层指定。
 */
ipcMain.handle('file:saveTo', async (evt, payload) => {
  const { filePath, model, opts } = payload;
  try {
    const m = reviveModel(model);
    const targetFormat = (opts && opts.targetFormat) || m.sourceFormat;
    let text;
    if (targetFormat !== m.sourceFormat) {
      // 跨格式转换：重新生成整个文件（同样写入署名）
      text = F.convertModel(m, targetFormat, opts || {});
    } else {
      // 同格式：定点替换，保留原文件其余内容
      text = F.serialize(m, opts || {}).text;
    }
    fs.writeFileSync(filePath, text, 'utf8');
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** 读取文件全文（MC4 会被解密成 XML 显示） */
ipcMain.handle('file:getFullText', async (evt, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const fmt = F.detectFormat(filePath, raw);
    let text = raw;
    if (fmt === 'mc4') {
      // MC4 显示解密后的 XML（去掉尾部 padding 空白）
      text = F.mc4Decrypt(raw).replace(/\s+$/, '');
    }
    return { ok: true, text, format: fmt, bytes: Buffer.byteLength(text, 'utf8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** 选择保存目录 */
ipcMain.handle('file:pickDir', async (evt) => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择保存位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  return { dir: res.filePaths[0] };
});

// ---------------------------------------------------------------- 批量处理

const CHEAT_EXTS = ['.mc4', '.shn', '.json'];

/**
 * 渲染署名模板。
 * 模板支持变量：{作者} {日期} {游戏} {版本}
 * 与渲染层的 buildSignature 保持一致 —— 主进程也要能渲染，
 * 因为批量处理时只有主进程在跑。
 */
function renderSignature(tpl, opts) {
  const o = opts || {};
  const mode = o.signatureMode || 'entry';
  if (mode === 'none') return '';

  const DEFAULT_SIG = '————翻译：{作者}，编辑时间{日期}————';
  const author = (o.author || '').trim() || '未署名';
  const game = (o.game || '').trim() || '未命名游戏';
  const version = (o.version || '').trim() || '-';
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const tmpl = (tpl || '').trim() || DEFAULT_SIG;
  let sig = tmpl
    .replace(/\{作者\}/g, author)
    .replace(/\{日期\}/g, ymd)
    .replace(/\{游戏\}/g, game)
    .replace(/\{版本\}/g, version);

  // 模板无变量时补全缺值的旧式写法
  if (!/\{[作者日期游戏版本]\}/.test(tmpl)) {
    if (/翻译[:：][，,]\s*编辑时间/.test(sig)) {
      sig = sig.replace(/(翻译[:：])[^，,：:]*/, `$1${author}`);
    }
    if (/编辑时间[^，,]*$/.test(sig) && !/[0-9]{8}/.test(sig)) {
      sig = sig.replace(/(编辑时间)[^，,]*$/, `$1${ymd}`);
    }
    // 模板既不含「翻译/汉化」标记，也没有日期 —— 说明是用户自定义的纯文本，
    // 原样保留即可（不要强行套默认格式）
  }
  return sig;
}

/**
 * 递归扫描目录下的金手指文件。
 * 只扫一层还是递归由 recursive 决定（默认一层，避免误伤大目录树）。
 */
function scanCheatFiles(dir, recursive) {
  const found = [];
  const walk = (d, depth) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (recursive && depth < 8) walk(p, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!CHEAT_EXTS.includes(ext)) continue;
      // 跳过本工具自己生成的产物，避免重复处理
      if (/_CN\.(mc4|shn|json)$/i.test(e.name)) continue;
      if (/\.bak$/i.test(e.name)) continue;
      found.push({ filePath: p, name: e.name, ext: ext.slice(1) });
    }
  };
  walk(dir, 0);
  return found;
}

/** 快速判断一个候选文件是不是金手指文件（能解析出条目） */
function probeCheatFile(filePath, ext) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const model = F.parseCheatFile(filePath, raw);
    if (!model || !model.mods || !model.mods.length) return null;
    return {
      filePath,
      name: path.basename(filePath),
      ext,
      format: model.sourceFormat || ext,
      game: model.meta.game || '',
      cusa: model.meta.cusa || '',
      count: model.mods.length,
      size: fs.statSync(filePath).size,
    };
  } catch (e) {
    return null;
  }
}

/** 扫描文件夹里的金手指文件（带可解析性校验） */
ipcMain.handle('batch:scan', async (evt, opts) => {
  const { dir, recursive } = opts || {};
  if (!dir) return { ok: false, error: '未指定目录' };
  if (!fs.existsSync(dir)) return { ok: false, error: '目录不存在' };

  const candidates = scanCheatFiles(dir, !!recursive);
  const files = [];
  const skipped = [];
  for (const c of candidates) {
    const info = probeCheatFile(c.filePath, c.ext);
    if (info) files.push(info);
    else skipped.push({ name: c.name, reason: '无法解析为金手指文件' });
  }
  return { ok: true, dir, files, skipped, total: candidates.length };
});

/**
 * 批量翻译并保存。
 *
 * mode:
 *   'suffix'   在原文件名后加 _CN 后缀，存到原目录（默认，最安全）
 *   'overwrite' 覆盖原文件（会先备份成 .bak）
 *   'folder'   统一输出到另一个文件夹（文件名不变）
 *
 * translateOnly: true 时只翻译不写盘，用于预览
 */
ipcMain.handle('batch:process', async (evt, opts) => {
  const { dir, files, mode, outDir, recursive, signature, signatureMode, author, targetFormat, translateOnly, skipUnchanged } = opts || {};
  if (!Array.isArray(files) || !files.length) {
    return { ok: false, error: '没有待处理的文件' };
  }

  const results = [];
  for (const item of files) {
    const r = { name: item.name, filePath: item.filePath, ok: false };
    try {
      const raw = fs.readFileSync(item.filePath, 'utf8');
      const model = F.parseCheatFile(item.filePath, raw);
      const srcFmt = model.sourceFormat || item.ext;

      // 翻译每个条目名
      let hit = 0;
      const renamed = model.mods.map((m) => {
        const t = T.translate(m.name);
        if (t.hit) hit++;
        return { ...m, name: t.hit ? t.text : m.name };
      });

      r.translated = hit;
      r.total = model.mods.length;
      r.hitRate = model.mods.length ? hit / model.mods.length : 0;

      // 全部都没译出且允许跳过时，不写盘
      const newModel = { ...model, mods: renamed };
      const outFmt = targetFormat || srcFmt;

      if (translateOnly) {
        r.ok = true;
        r.preview = renamed.slice(0, 3).map((m) => m.name);
        results.push(r);
        continue;
      }

      if (skipUnchanged && hit === 0) {
        r.ok = true;
        r.skipped = '无改动，已跳过';
        results.push(r);
        continue;
      }

      // 生成内容：署名在这里按当前文件的游戏名/版本渲染
      const sigText = renderSignature(signature, {
        author: author || '',
        game: model.meta.game || '',
        version: model.meta.version || '',
        signatureMode: signatureMode || 'entry',
      });
      const sigOpts = { signature: sigText, signatureMode: signatureMode || 'entry' };
      let text;
      if (outFmt !== srcFmt) {
        text = F.convertModel(newModel, outFmt, sigOpts);
      } else {
        text = F.serialize(newModel, sigOpts).text;
      }

      // 决定输出路径
      let outPath;
      const base = path.basename(item.filePath);
      const ext = path.extname(base);
      const stem = path.basename(base, ext);

      if (mode === 'overwrite') {
        outPath = item.filePath;
        // 覆盖前先备份，保留 .bak
        try {
          const bak = item.filePath + '.bak';
          fs.copyFileSync(item.filePath, bak);
          r.backup = path.basename(bak);
        } catch (e) { /* 备份失败不阻止覆盖 */ }
      } else if (mode === 'folder') {
        if (!outDir) { r.error = '未指定输出文件夹'; results.push(r); continue; }
        // 输出目录可能还没建，自动创建
        try {
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        } catch (e) {
          r.error = '无法创建输出文件夹：' + e.message;
          results.push(r);
          continue;
        }
        const outExt = '.' + outFmt;
        // 扩展名变了就用新扩展名；没变则保持原名
        let outName = stem + (outExt.toLowerCase() === ext.toLowerCase() ? '' : outExt);
        outPath = path.join(outDir, outName);
        // 与源文件同名（输出目录就是源目录）时加 _CN 避免自我覆盖
        if (outPath.toLowerCase() === item.filePath.toLowerCase()) {
          outName = stem + '_CN' + outExt;
          outPath = path.join(outDir, outName);
        }
        // 目标已存在时加序号，避免静默覆盖别人的文件
        let n = 2;
        while (fs.existsSync(outPath)) {
          outName = stem + '_CN' + (n > 2 ? '_' + n : '') + outExt;
          outPath = path.join(outDir, outName);
          n++;
        }
      } else {
        // suffix：原名 + _CN + 新扩展名
        const outExt = '.' + outFmt;
        const outName = stem + '_CN' + outExt;
        outPath = path.join(path.dirname(item.filePath), outName);
      }

      // 同目录同后缀时避免覆盖自己
      if (outPath.toLowerCase() === item.filePath.toLowerCase() && mode !== 'overwrite') {
        outPath = path.join(path.dirname(item.filePath), stem + '_CN' + path.extname(base));
      }

      fs.writeFileSync(outPath, text, 'utf8');
      r.ok = true;
      r.outPath = outPath;
      r.outName = path.basename(outPath);
      r.size = fs.statSync(outPath).size;
    } catch (e) {
      r.error = e.message;
    }
    results.push(r);
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: true,
    results,
    summary: {
      total: results.length,
      success: okCount,
      failed: results.length - okCount,
      translated: results.reduce((s, r) => s + (r.translated || 0), 0),
      entries: results.reduce((s, r) => s + (r.total || 0), 0),
    },
  };
});

/** 打开外部链接（关于对话框用） */
ipcMain.handle('shell:openExternal', async (evt, url) => {
  try {
    // 只允许 http/https，杜绝任意协议唤起
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: '不支持的链接协议' };
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** 打开文件夹 */
ipcMain.handle('shell:openDir', async (evt, dir) => {
  require('electron').shell.openPath(dir);
  return { ok: true };
});

// ---------------------------------------------------------------- 模型打包
// 主进程与渲染进程之间只传纯 JSON，避免 raw 原文过大

function packModel(m) {
  return {
    format: m.format,
    sourceFormat: m.sourceFormat,
    meta: m.meta,
    mods: m.mods.map((x) => ({
      name: x.name,
      type: x.type || 'checkbox',
      lines: x.lines.map((l) => ({ offset: l.offset, section: l.section, on: l.on, off: l.off })),
    })),
    // 原文用于定点替换，由渲染进程带回来
    raw: m.raw,
    plainXml: m.plainXml,
  };
}

/** 从打包的模型还原（补回 parseShn 需要但渲染进程没有的字段） */
function reviveModel(packed) {
  const m = {
    format: packed.format,
    sourceFormat: packed.sourceFormat,
    meta: packed.meta,
    raw: packed.raw,
    plainXml: packed.plainXml,
    mods: (packed.mods || []).map((x) => ({
      name: x.name,
      type: x.type || 'checkbox',
      lines: (x.lines || []).map((l) => ({
        offset: l.offset, section: l.section, on: l.on, off: l.off,
      })),
    })),
  };
  return m;
}
