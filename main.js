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

/** 可关联打开/拖入的扩展名（与 package.json 的 fileAssociations 一致） */
const OPENABLE_EXTS = ['.mc4', '.shn', '.json'];
/** 系统传入、等待窗口就绪后再打开的文件路径 */
let pendingOpenPath = null;
/** 渲染层是否已挂载完毕（未挂载时发消息会丢） */
let rendererReady = false;

/**
 * 从命令行参数里找出可打开的金手指文件。
 * 开发模式（electron .）与打包模式的 argv 位置不同，按扩展名 + 存在性筛选。
 */
function findOpenablePath(argv) {
  for (const arg of (argv || []).slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    if (!OPENABLE_EXTS.includes(path.extname(arg).toLowerCase())) continue;
    try {
      if (fs.existsSync(arg) && fs.statSync(arg).isFile()) return path.resolve(arg);
    } catch (e) { /* 忽略非法路径 */ }
  }
  return null;
}

/**
 * 打开系统传入的文件（双击关联文件 / 命令行参数）。
 * 结果推给渲染层，由渲染层用新文件替换旧文件的显示。
 */
function openFileFromSystem(filePath) {
  if (!filePath) return;
  // 窗口还没建好或页面还没加载完：先记下来，did-finish-load 后再送
  if (!win || win.isDestroyed() || !rendererReady) {
    pendingOpenPath = filePath;
    return;
  }
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const model = F.parseCheatFile(filePath, text);
    win.webContents.send('file:openFromSystem', { ok: true, filePath, model: packModel(model) });
  } catch (e) {
    win.webContents.send('file:openFromSystem', { ok: false, filePath, error: e.message });
  }
}

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

  rendererReady = false;
  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  win.loadFile('index.html');

  // 把版本号注入渲染层（关于对话框显示用）
  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    win.webContents.executeJavaScript(
      `window.__APP_VERSION__ = ${JSON.stringify(APP_VERSION)};`
    ).catch(() => { /* 注入失败不影响功能 */ });

    // 双击关联文件启动时，页面就绪后再把文件送进界面
    if (pendingOpenPath) {
      const p = pendingOpenPath;
      pendingOpenPath = null;
      openFileFromSystem(p);
    }
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

// 文件关联双击：只保留一个实例，后续启动把文件转交给已有窗口
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

app.on('second-instance', (event, argv) => {
  const p = findOpenablePath(argv);
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  if (p) openFileFromSystem(p);
});

// macOS：Finder 里双击关联文件
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileFromSystem(filePath);
});

app.whenReady().then(() => {
  if (!singleInstance) return;

  // 先搬说明文档，再建窗口。
  // 放在 createWindow 之前是为了保证：即使窗口创建失败（无显卡/沙箱环境），
  // 说明文档也已经复制到位。
  copyReadmeToAppDir();

  buildMenu();
  createWindow();

  // 首次启动时由命令行带入的文件（双击关联文件）。
  // 此时页面可能还没挂载好监听器，先存成待打开项，did-finish-load 后再送。
  const initialPath = findOpenablePath(process.argv);
  if (initialPath) pendingOpenPath = initialPath;

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

/**
 * 把署名模板渲染成最终文本。
 * 署名在渲染层传的是模板（可能含 {作者} {日期} {游戏} {版本}），
 * 必须在主进程按当前文件的元信息渲染。
 */
function sigOptsFor(model, opts) {
  const o = opts || {};
  const sigText = renderSignature(o.signature, {
    author: o.author || '',
    game: (model && model.meta && model.meta.game) || '',
    version: (model && model.meta && model.meta.version) || '',
    signatureMode: o.signatureMode || 'entry',
  });
  return { ...o, signature: sigText };
}

/** 保存到原文件 */
ipcMain.handle('file:save', async (evt, payload) => {
  const { filePath, model, opts } = payload;
  try {
    const m = reviveModel(model);
    const out = F.serialize(m, sigOptsFor(m, opts));
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
    const sigOpts = sigOptsFor(m, opts);
    let text;
    if (opts && opts.targetFormat && opts.targetFormat !== m.sourceFormat) {
      // 格式转换输出
      text = F.convertModel(m, opts.targetFormat, sigOpts);
    } else {
      text = F.serialize(m, sigOpts).text;
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

    // 署名是模板，先按当前文件的游戏名/版本渲染成最终文本
    const o = opts || {};
    const sigText = renderSignature(o.signature, {
      author: o.author || '',
      game: (m.meta && m.meta.game) || '',
      version: (m.meta && m.meta.version) || '',
      signatureMode: o.signatureMode || 'entry',
    });
    const sigOpts = { ...o, signature: sigText };

    let text;
    if (targetFormat !== m.sourceFormat) {
      // 跨格式转换：重新生成整个文件（同样写入署名）
      text = F.convertModel(m, targetFormat, sigOpts);
    } else {
      // 同格式：定点替换，保留原文件其余内容
      text = F.serialize(m, sigOpts).text;
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
/** 覆盖模式下的备份目录名（位于被处理文件夹根目录下） */
const BATCH_BACKUP_DIR = '_PS5汉化备份';

/** 批量任务取消标记 */
let batchCancelRequested = false;
/** 最近一次批量任务，用于终止后回滚 */
let lastBatchRun = null;

/** 给渲染层推送批量进度 */
function sendBatchProgress(evt, payload) {
  try {
    if (evt && evt.sender && !evt.sender.isDestroyed()) {
      evt.sender.send('batch:progress', payload);
    }
  } catch (e) { /* 窗口已关闭时忽略 */ }
}

/** 备份目录用的时间戳：20261114_153012_123 */
function batchStamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${p(d.getMilliseconds(), 3)}`;
}

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
        // 跳过本工具的备份目录，避免把备份当成待处理文件
        if (e.name === BATCH_BACKUP_DIR) continue;
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

/** 扫描文件夹里的金手指文件（带可解析性校验，过程中上报进度） */
ipcMain.handle('batch:scan', async (evt, opts) => {
  const { dir, recursive } = opts || {};
  if (!dir) return { ok: false, error: '未指定目录' };
  if (!fs.existsSync(dir)) return { ok: false, error: '目录不存在' };

  batchCancelRequested = false;
  const candidates = scanCheatFiles(dir, !!recursive);
  const files = [];
  const skipped = [];
  const total = candidates.length;
  let lastAt = 0;

  for (let i = 0; i < candidates.length; i++) {
    if (batchCancelRequested) {
      return { ok: true, canceled: true, dir, files, skipped, total };
    }
    const c = candidates[i];
    const info = probeCheatFile(c.filePath, c.ext);
    if (info) files.push(info);
    else skipped.push({ name: c.name, reason: '无法解析为金手指文件' });

    // 让出事件循环，避免大目录扫描时界面卡死
    if (i % 20 === 0) await new Promise((r) => setImmediate(r));
    const now = Date.now();
    if (now - lastAt > 100 || i === total - 1) {
      lastAt = now;
      sendBatchProgress(evt, {
        phase: 'scan', done: i + 1, total, found: files.length, current: c.name,
      });
    }
  }
  return { ok: true, dir, files, skipped, total };
});

/**
 * 覆盖模式下把原文件复制到备份目录（保持相对目录结构）。
 * 返回备份文件路径；失败时返回 null。
 */
function backupFile(filePath, rootDir, sourceDir) {
  try {
    let rel = sourceDir ? path.relative(sourceDir, filePath) : path.basename(filePath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) rel = path.basename(filePath);
    const dst = path.join(rootDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(filePath, dst);
    return dst;
  } catch (e) {
    return null;
  }
}

/**
 * 批量翻译并保存。
 *
 * mode:
 *   'overwrite' 覆盖原文件（默认；原文件备份到 _PS5汉化备份/<时间戳>/）
 *   'suffix'    在原文件名后加 _CN 后缀，存到原目录
 *   'folder'    统一输出到另一个文件夹（文件名不变）
 *
 * 处理过程中通过 batch:progress 上报进度，可用 batch:cancel 终止。
 * translateOnly: true 时只翻译不写盘，用于预览
 */
ipcMain.handle('batch:process', async (evt, opts) => {
  const {
    dir, files, mode = 'overwrite', outDir, recursive, signature, signatureMode,
    author, targetFormat, translateOnly, skipUnchanged,
  } = opts || {};
  if (!Array.isArray(files) || !files.length) {
    return { ok: false, error: '没有待处理的文件' };
  }

  batchCancelRequested = false;
  const total = files.length;
  const authorName = String(author || '').trim();
  const results = [];
  const written = [];   // 已写盘的文件记录，供终止回滚
  let backupRoot = null;
  let okCount = 0;
  let translatedTotal = 0;
  let entriesTotal = 0;
  let lastAt = 0;

  // 备份目录：<解压目录>/_PS5汉化备份/<时间戳>
  const ensureBackupRoot = () => {
    if (backupRoot) return backupRoot;
    const base = dir || path.dirname(files[0].filePath);
    backupRoot = path.join(base, BATCH_BACKUP_DIR, batchStamp());
    return backupRoot;
  };

  const processOne = (item) => {
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

      // 发现别的作者 → 统一改成当前默认作者
      const oldAuthor = String(model.meta.author || '').trim();
      const fixAuthor = !!authorName && oldAuthor !== authorName;
      r.authorFixed = fixAuthor;
      r.oldAuthor = oldAuthor;
      r.newAuthor = fixAuthor ? authorName : oldAuthor;

      const newModel = {
        ...model,
        mods: renamed,
        meta: fixAuthor ? { ...model.meta, author: authorName } : model.meta,
      };
      const outFmt = targetFormat || srcFmt;

      if (translateOnly) {
        r.ok = true;
        r.preview = renamed.slice(0, 3).map((m) => m.name);
        return r;
      }

      // 没有任何翻译且作者无需修正时才跳过
      if (skipUnchanged && hit === 0 && !fixAuthor) {
        r.ok = true;
        r.skipped = '无改动，已跳过';
        return r;
      }

      // 生成内容：署名按当前文件的游戏名/版本渲染
      const sigText = renderSignature(signature, {
        author: authorName,
        game: model.meta.game || '',
        version: model.meta.version || '',
        signatureMode: signatureMode || 'entry',
      });
      const sigOpts = {
        signature: sigText,
        signatureMode: signatureMode || 'entry',
        rewriteAuthor: fixAuthor ? authorName : '',
      };
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
      let backupPath = null;

      if (mode === 'overwrite') {
        outPath = item.filePath;
        // 覆盖前备份到独立的备份文件夹，不再生成同目录 .bak
        backupPath = backupFile(item.filePath, ensureBackupRoot(), dir);
        r.backup = backupPath ? path.basename(backupPath) : '';
      } else if (mode === 'folder') {
        if (!outDir) { r.error = '未指定输出文件夹'; return r; }
        // 输出目录可能还没建，自动创建
        try {
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        } catch (e) {
          r.error = '无法创建输出文件夹：' + e.message;
          return r;
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

      if (mode === 'overwrite') {
        written.push({ filePath: item.filePath, outPath, mode, backupPath });
      } else if (outPath.toLowerCase() !== item.filePath.toLowerCase()) {
        written.push({ filePath: item.filePath, outPath, mode, backupPath: null });
      }
    } catch (e) {
      r.error = e.message;
    }
    return r;
  };

  for (let i = 0; i < total; i++) {
    if (batchCancelRequested) break;
    const item = files[i];
    const r = processOne(item);
    results.push(r);
    if (r.ok) okCount++;
    translatedTotal += r.translated || 0;
    entriesTotal += r.total || 0;

    // 让出事件循环：大文件量时界面仍可响应（进度/终止）
    await new Promise((res) => setImmediate(res));

    const now = Date.now();
    if (now - lastAt > 100 || i === total - 1) {
      lastAt = now;
      sendBatchProgress(evt, {
        phase: 'process',
        done: results.length,
        total,
        current: item.name,
        ok: okCount,
        failed: results.length - okCount,
        translated: translatedTotal,
        entries: entriesTotal,
      });
    }
  }

  lastBatchRun = { mode, backupDir: backupRoot, written };

  return {
    ok: true,
    // 全部处理完时即使用户刚点了终止，也不算「中断」，避免误触发回滚
    canceled: batchCancelRequested && results.length < total,
    results,
    backupDir: backupRoot,
    summary: {
      total: results.length,
      success: okCount,
      failed: results.length - okCount,
      translated: translatedTotal,
      entries: entriesTotal,
      authorFixed: results.filter((r) => r.authorFixed).length,
    },
  };
});

/** 请求终止当前批量任务 */
ipcMain.handle('batch:cancel', async () => {
  batchCancelRequested = true;
  return { ok: true };
});

/** 终止后询问是否恢复已处理的文件 */
ipcMain.handle('batch:confirmRollback', async () => {
  const n = lastBatchRun ? lastBatchRun.written.length : 0;
  const res = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['恢复为原文件', '保留已处理的文件'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: '批量处理已终止',
    message: '是否将已处理的文件恢复为原文件？',
    detail: n
      ? `本次已经处理 ${n} 个文件。选择「恢复为原文件」会撤销这些文件的改动。`
      : '本次还没有写入任何文件，无需恢复。',
  });
  return { restore: res.response === 0 };
});

/** 回滚最近一次批量任务：覆盖模式恢复备份，其它模式删除新生成的文件 */
ipcMain.handle('batch:rollback', async () => {
  if (!lastBatchRun) return { ok: false, error: '没有可恢复的批量任务' };

  let restored = 0;
  let removed = 0;
  let failed = 0;
  for (const w of lastBatchRun.written.slice().reverse()) {
    try {
      if (w.mode === 'overwrite') {
        if (w.backupPath && fs.existsSync(w.backupPath)) {
          fs.copyFileSync(w.backupPath, w.filePath);
          restored++;
        }
      } else if (w.outPath && fs.existsSync(w.outPath)) {
        fs.unlinkSync(w.outPath);
        removed++;
      }
    } catch (e) {
      failed++;
    }
  }
  lastBatchRun = null;
  return { ok: true, restored, removed, failed };
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
