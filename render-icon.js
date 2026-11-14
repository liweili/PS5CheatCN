const { app, BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const svg = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');

app.whenReady().then(async () => {
  // 无头 / CI 环境的桌面可用区域可能小于 1024，窗口会被裁剪。
  // 取可用区域内的最大正方形作为渲染尺寸，保证 capturePage 输出正方形。
  const area = screen.getPrimaryDisplay().workAreaSize;
  const size = Math.max(256, Math.min(1024, area.width, area.height));

  const win = new BrowserWindow({
    width: size, height: size, useContentSize: true, show: false,
    transparent: true, frame: false, webPreferences: { offscreen: true },
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 600));

  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  const out = path.join(ROOT, 'build', 'icon.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('PNG_SAVED ' + out + ' ' + img.getSize().width + 'x' + img.getSize().height);
  app.exit(0);
});
