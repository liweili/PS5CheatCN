const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const svg = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false,
    transparent: true, frame: false, webPreferences: { offscreen: true },
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:1024px;height:1024px;background:transparent;overflow:hidden}
    svg{display:block}
  </style></head><body>${svg}</body></html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 600));

  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const out = path.join(ROOT, 'build', 'icon.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('PNG_SAVED ' + out + ' ' + img.getSize().width + 'x' + img.getSize().height);
  app.exit(0);
});
