'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const F = require('./src/formats');
const T = require('./src/translator');

let win = null;

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
        { label: '关于', click: () => {
          dialog.showMessageBox(win, {
            type: 'info',
            title: '关于',
            message: 'PS5 金手指自动汉化工具',
            detail: '支持 MC4 / SHN / JSON 三种格式的打开、编辑、自动汉化、保存与格式转换。\nMC4 采用 AES-256-CBC + Base64（与官方 mc4-cheat-decrypter 一致）。',
          });
        } },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  copyReadmeToAppDir();

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
    const src = path.join(process.resourcesPath, '使用说明.md');
    const dst = path.join(path.dirname(app.getPath('exe')), '使用说明.md');
    if (!fs.existsSync(src)) return;
    if (fs.existsSync(dst)) return;
    fs.copyFileSync(src, dst);
  } catch (e) { /* 复制失败不影响程序运行 */ }
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
