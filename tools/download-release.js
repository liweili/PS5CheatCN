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

/**
 * 用 HTTP Range 请求分块下载，绕过代理的单连接体积上限。
 *
 * 本机代理会在传输到约 50MB 时切断连接（两次实测都恰好停在 52428800 字节），
 * 单连接下载大文件必然失败。分块后每块只有几 MB，不会触发上限。
 *
 * 服务端需支持 Range（GitHub 的 release-assets CDN 支持）。
 */
function downloadAssetChunked(asset, outPath, chunkSize) {
  const SIZE = chunkSize || 20 * 1024 * 1024; // 20MB 一块（低于代理 50MB 上限）
  return new Promise((resolve) => {
    const total = asset.size;
    const parts = [];
    let offset = 0;

    const next = () => {
      if (offset >= total) {
        // 合并所有分块
        const out = fs.createWriteStream(outPath);
        let written = 0;
        for (const buf of parts) {
          out.write(buf);
          written += buf.length;
        }
        out.end();
        // 最终校验
        const localSize = fs.statSync(outPath).size;
        if (localSize !== total) {
          console.error(`\n    ✗ 合并后大小不符：${localSize} / ${total}`);
          try { fs.unlinkSync(outPath); } catch (e) { /* ignore */ }
          resolve(false);
          return;
        }
        process.stdout.write(`\r    ${(total / 1048576).toFixed(1)}MB 完成                    \n`);
        resolve(true);
        return;
      }

      const end = Math.min(offset + SIZE, total) - 1;
      const headers = {
        'User-Agent': 'PS5CheatCN-downloader',
        'Accept': 'application/octet-stream',
        Range: `bytes=${offset}-${end}`,
      };
      if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

      const u = new URL(asset.url);
      resolver.resolve4(u.hostname, (err, addrs) => {
        if (err || !addrs || !addrs.length) {
          console.error('  ! 无法解析主机名');
          resolve(false);
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
          // 跟随 302
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const nextUrl = new URL(res.headers.location, asset.url).toString();
            asset.url = nextUrl;
            next();
            return;
          }
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            console.error(`  HTTP ${res.statusCode}（分块 ${offset}-${end}）`);
            res.resume();
            resolve(false);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            const want = end - offset + 1;
            if (buf.length !== want) {
              console.error(`  ✗ 分块 ${offset}-${end} 长度不符：${buf.length} / ${want}`);
              resolve(false);
              return;
            }
            parts.push(buf);
            offset = end + 1;
            process.stdout.write(`\r    ${(offset / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)}MB (${((offset / total) * 100).toFixed(0)}%)   `);
            next();
          });
          res.on('error', (e) => {
            console.error('  分块出错:', e.message);
            resolve(false);
          });
        });
        q.on('error', (e) => { console.error('  请求错误:', e.message); resolve(false); });
        q.end();
      });
    };

    next();
  });
}

/** 下载单个附件（优先分块，失败时回退单连接） */
async function downloadAsset(asset, outPath) {
  // 文件较大时用分块下载，规避代理的单连接体积上限
  if (asset.size > 20 * 1024 * 1024) {
    console.log('  （大文件，分块下载）');
    const ok = await downloadAssetChunked(asset, outPath);
    if (ok) return true;
    console.log('  分块失败，回退单连接...');
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) { /* ignore */ }
  }
  return downloadAssetSingle(asset, outPath);
}

/** 单连接下载 */
function downloadAssetSingle(asset, outPath) {
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
        // 关键：校验实际收到的字节数。
        // 附件在下载途中被删除/替换时连接会提前断开，
        // 此时若不校验，会留下一个截断的文件却报告「成功」。
        if (total && got < total) {
          console.error(`\n    ✗ 下载不完整：只收到 ${got}/${total} 字节（${((got / total) * 100).toFixed(1)}%）`);
          try { fs.unlinkSync(outPath); } catch (e) { /* ignore */ }
          resolve(false);
          return;
        }
        process.stdout.write(`\r    ${(got / 1048576).toFixed(1)}MB 完成                    \n`);
        resolve(true);
      });
      res.on('error', (e) => {
        console.error('\n    ✗ 下载出错:', e.message);
        f.end();
        try { fs.unlinkSync(outPath); } catch (e2) { /* ignore */ }
        resolve(false);
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

  let failed = 0;
  for (const a of assets) {
    const out = path.join(dest, a.name);
    console.log(`下载 ${a.name} (${(a.size / 1048576).toFixed(1)}MB)`);
    const ok = await downloadAsset(a, out);
    if (ok) {
      console.log(`  ✓ ${out}`);
      // 二次校验：落盘文件大小必须与服务器声明一致
      const localSize = fs.statSync(out).size;
      if (localSize !== a.size) {
        console.error(`  ✗ 大小不符：本地 ${localSize} / 远端 ${a.size}`);
        fs.unlinkSync(out);
        failed++;
      }
    } else {
      console.error(`  ✗ 失败`);
      failed++;
    }
  }
  if (failed) {
    console.error(`\n${failed} 个附件下载失败`);
    process.exit(1);
  }
}

main();
