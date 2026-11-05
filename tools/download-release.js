'use strict';
/**
 * GitHub Release 附件下载器（带 DNS 绕过与 302 跟随）。
 *
 * 本机 Steam++ 劫持了 hosts，curl 直连 github.com 常常超时。
 * 这个脚本走 GitHub API → 跟随重定向 → 直连 S3，绕开镜像。
 *
 * 用法：node tools/download-release.js <tag> [文件名过滤] [输出路径]
 */
const https = require('https');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

const OWNER = 'liweili';
const REPO = 'PS5CheatCN';
const TOKEN = process.env.GITHUB_TOKEN || '';

const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

/** 绕过 hosts 劫持的请求 */
function req(url, headers, cb, redirects = 0) {
  const u = new URL(url);
  resolver.resolve4(u.hostname, (err, addrs) => {
    if (err || !addrs || !addrs.length) {
      console.error(`  ! 无法解析 ${u.hostname}`);
      cb(null);
      return;
    }
    const ip = addrs[0];
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers,
      lookup: (h, o, c) => {
        if (o && o.all) return c(null, [{ address: ip, family: 4 }]);
        c(null, ip, 4);
      },
    };
    const q = https.request(opts, (res) => {
      // 跟随重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 5) { cb(null); return; }
        const next = new URL(res.headers.location, url).toString();
        console.log(`  → ${res.statusCode} 重定向到 ${new URL(next).hostname}`);
        req(next, headers, cb, redirects + 1);
        return;
      }
      cb(res);
    });
    q.on('error', (e) => { console.error('  请求错误:', e.message); cb(null); });
    q.end();
  });
}

/** 列出版本的所有附件 */
function listAssets(tag) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'PS5CheatCN-downloader', 'Accept': 'application/vnd.github+json' };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    req(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`, headers, (res) => {
      if (!res) { resolve(null); return; }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
      });
    });
  });
}

/** 下载单个附件 */
function downloadAsset(asset, outPath) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'PS5CheatCN-downloader', 'Accept': 'application/octet-stream' };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    req(asset.url, headers, (res) => {
      if (!res) { resolve(false); return; }
      if (res.statusCode !== 200) {
        console.error(`  HTTP ${res.statusCode}`);
        res.resume();
        resolve(false);
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let got = 0;
      let lastTick = Date.now();
      const f = fs.createWriteStream(outPath);
      res.on('data', (c) => {
        got += c.length;
        // 每秒报一次进度
        if (Date.now() - lastTick > 1000) {
          lastTick = Date.now();
          const pct = total ? ((got / total) * 100).toFixed(0) : '?';
          process.stdout.write(`\r    ${(got / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)}MB (${pct}%)`);
        }
      });
      res.on('end', () => {
        f.end();
        process.stdout.write(`\r    ${(got / 1048576).toFixed(1)}MB 完成                    \n`);
        resolve(true);
      });
      res.pipe(f);
    });
  });
}

async function main() {
  const [tag, filter, outDir] = process.argv.slice(2);
  if (!tag) {
    console.log('用法: node tools/download-release.js <tag> [文件名过滤] [输出目录]');
    console.log('环境变量 GITHUB_TOKEN 可选（私有仓库或提高 API 限流额度时用）');
    process.exit(1);
  }
  const dest = outDir || process.env.TEMP || '.';
  fs.mkdirSync(dest, { recursive: true });

  console.log(`获取 ${OWNER}/${REPO} ${tag} 的附件列表...`);
  const rel = await listAssets(tag);
  if (!rel) { console.error('获取失败'); process.exit(1); }

  const assets = (rel.assets || []).filter((a) => !filter || a.name.includes(filter));
  if (!assets.length) {
    console.log('没有匹配的附件');
    process.exit(1);
  }

  for (const a of assets) {
    const out = path.join(dest, a.name);
    console.log(`下载 ${a.name} (${(a.size / 1048576).toFixed(1)}MB)`);
    const ok = await downloadAsset(a, out);
    if (ok) console.log(`  ✓ ${out}`);
    else console.error(`  ✗ 失败`);
  }
}

main();
