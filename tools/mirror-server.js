'use strict';
/**
 * 本地工具包镜像服务。
 * electron-builder 打包 NSIS 时需要 winCodeSign / nsis / nsis-resources 三个包，
 * 本机（非管理员 + 未开开发者模式）解压 winCodeSign 时无法创建符号链接会失败，
 * 因此统一从本地 HTTP 服务提供，避免走远程下载与符号链接解压。
 *
 * 用法：node mirror-server.js <目录> <端口>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || process.cwd();
const port = +(process.argv[3] || 8899);

http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  const file = path.join(dir, name);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const stat = fs.statSync(file);
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } else {
    res.writeHead(404);
    res.end('not found: ' + name);
  }
}).listen(port, '127.0.0.1', () => {
  console.log('MIRROR_READY http://127.0.0.1:' + port + '/  (root=' + dir + ')');
});
