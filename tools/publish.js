'use strict';
/**
 * GitHub 发布助手。
 *
 * 用法：
 *   node tools/publish.js create-repo <token>   创建远程仓库
 *   node tools/publish.js push <token>          推送代码
 *   node tools/publish.js release <token> <tag> 创建 Release 并上传安装包
 *   node tools/publish.js all <token> <tag>     一键完成以上全部
 *
 * token 需具备 repo 权限（Personal Access Token / classic 或 fine-grained）
 *
 * 网络说明：
 *   本机 Steam++ 会在 hosts 里把 api.github.com / uploads.github.com 等
 *   指向 127.0.0.1，导致 REST API 完全不通。本脚本通过自定义 DNS
 *   （直查 8.8.8.8）拿到真实 IP 并在 TLS 层保留原域名，绕过 hosts 劫持。
 */

const https = require('https');
const dns = require('dns');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OWNER = 'liweili';
const REPO = 'PS5CheatCN';
const DIST = path.join(ROOT, 'dist');

// ---------------------------------------------------------------- DNS 绕过
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

/** 缓存解析结果，避免重复查询 */
const ipCache = new Map();

/**
 * 用公共 DNS 直查主机真实 IP，绕开被劫持的 hosts。
 * 返回 null 表示查询失败（此时交给系统解析）。
 */
function resolveRealIp(hostname) {
  if (ipCache.has(hostname)) return ipCache.get(hostname);
  return new Promise((resolve) => {
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || !addresses.length) {
        console.warn(`  ! 无法解析 ${hostname}（${err && err.message || '无结果'}），改用系统 DNS`);
        ipCache.set(hostname, null);
        resolve(null);
        return;
      }
      const ip = addresses[0];
      ipCache.set(hostname, ip);
      resolve(ip);
    });
  });
}

/** 构造一个绕过 hosts 的 https.request 选项 */
async function requestOptions(hostname, extra) {
  const ip = await resolveRealIp(hostname);
  const opts = { hostname, ...extra };
  if (ip) {
    // Node 18+ 会传 options.all=true，要求回调返回地址数组；
    // 老版本则要求 (err, address, family)。两种都兼容。
    opts.lookup = (host, lookupOpts, cb) => {
      if (lookupOpts && lookupOpts.all) return cb(null, [{ address: ip, family: 4 }]);
      return cb(null, ip, 4);
    };
  }
  return opts;
}

// ---------------------------------------------------------------- API
async function api(token, method, path_, body) {
  const data = body ? JSON.stringify(body) : null;
  const opts = await requestOptions('api.github.com', {
    path: path_,
    method,
    headers: {
      'User-Agent': 'PS5CheatCN-publisher',
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------- 建仓库
async function createRepo(token) {
  console.log(`检查仓库 ${OWNER}/${REPO} ...`);
  const chk = await api(token, 'GET', `/repos/${OWNER}/${REPO}`);
  if (chk.status === 200) {
    console.log('  仓库已存在，跳过创建');
    return true;
  }
  if (chk.status !== 404) {
    console.error('  ✗ 查询失败:', chk.status, chk.json && chk.json.message);
    return false;
  }
  console.log('  仓库不存在，正在创建...');
  const res = await api(token, 'POST', '/user/repos', {
    name: REPO,
    description: 'PS5/PS4 金手指自动汉化工具 —— 支持 MC4 / SHN / JSON',
    private: false,
    auto_init: false,
    has_wiki: false,
    has_issues: true,
    has_projects: false,
    has_downloads: true,
    topics: ['ps5', 'ps4', 'cheat', 'trainer', 'mc4', 'translation', 'electron'],
  });
  if (res.status === 201) {
    console.log(`  ✓ 创建成功: https://github.com/${OWNER}/${REPO}`);
    return true;
  }
  console.error('  ✗ 创建失败:', res.status, res.json && res.json.message);
  return false;
}

// ---------------------------------------------------------------- 推代码
function pushCode(token) {
  // 本机全局配了 insteadOf 把 github.com 重写到 ghfast.top 镜像。
  // 镜像虽然能推，但它的 ref 状态有时不同步（报
  // "cannot lock ref ... but expected ..."），所以这里用
  // GIT_CONFIG_* 环境变量临时清空该重写，直连真实 GitHub。
  const url = `https://${token}@github.com/${OWNER}/${REPO}.git`;
  console.log('推送代码到 origin ...');

  const env = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'url.https://ghfast.top/https://github.com/.insteadof',
    GIT_CONFIG_VALUE_0: 'https://github.invalid/',
  };

  try {
    execSync(`git push -u "${url}" main`, { cwd: ROOT, stdio: 'inherit', env });
    console.log('  ✓ 推送完成');
    return true;
  } catch (e) {
    console.error('  ✗ 推送失败:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------- Release
async function createRelease(token, tag) {
  console.log(`创建 Release ${tag} ...`);
  const res = await api(token, 'POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: tag,
    name: `PS5金手指自动汉化工具 ${tag}`,
    body: [
      '## PS5/PS4 金手指自动汉化工具',
      '',
      '支持 **MC4 / SHN / JSON** 三种格式的打开、编辑、自动汉化、保存与格式转换。',
      '',
      '### 安装',
      '',
      '下载 `PS5金手指自动汉化工具-*-x64.exe` 双击安装，安装完成后会自动创建桌面与开始菜单快捷方式。',
      '免安装绿色版 `*.zip` 解压即用。',
      '',
      '### 功能',
      '',
      '- 打开 **MC4**（自动解密）/ **SHN** / **JSON** 三种格式，支持拖拽打开',
      '- 每个修改项独立列出，可单条汉化或一键全译',
      '- **乱码自动修正**：编码损坏的问号串、替换符、控制字符、全角符号一并清理',
      '- **游戏术语表**：Combo 系列统一译「连招」，另覆盖战斗、属性、货币、关卡等 400+ 条',
      '- 汉化结果可自由微调，支持撤销全部',
      '- **保存对话框**：默认沿用原格式，文件名自动加 `_CN` 后缀（可改）',
      '- **格式转换**：MC4 ⇄ SHN ⇄ JSON 互转',
      '- **查看全文**：一键查看文件完整内容（MC4 自动解密成 XML）',
      '- 保存时自动写入译者署名',
      '',
      '### 关于翻译',
      '',
      '内置四级翻译引擎（整句 → 前缀规则 → 短语 → 单词），词库基于',
      'HEN-Cheats-Collection 全量 12330 条去重条目的词频统计，',
      '实测命中率 **81.0%**。未识别的多为游戏专有名词，会保留原文供手动微调。',
      '',
      '> 全部处理在本机完成，不联网、不上传任何数据。',
    ].join('\n'),
    draft: false,
    prerelease: false,
  });

  if (res.status !== 201) {
    console.error('  ✗ 创建失败:', res.status, res.json && res.json.message);
    return false;
  }
  console.log('  ✓ Release 已创建');

  if (!fs.existsSync(DIST)) {
    console.error('  ✗ dist 目录不存在，请先运行 npm run dist');
    return false;
  }

  const assets = fs.readdirSync(DIST).filter((f) => /\.(exe|zip|blockmap)$/.test(f));
  let allOk = true;
  // upload_url 形如：
  //   https://uploads.github.com/repos/{owner}/{repo}/releases/{id}/assets{?name,label}
  // 需要把末尾的 URI 模板 {?name,label} 去掉，name 改用 query 参数传
  const uploadBase = res.json.upload_url.replace(/\{[^}]*\}$/, '');
  for (const f of assets) {
    const file = path.join(DIST, f);
    const size = fs.statSync(file).size;
    const assetName = toAsciiAssetName(f);
    if (assetName !== f) {
      console.log(`  · ${f} → ${assetName}（GitHub 会清洗非 ASCII 资源名）`);
    }
    process.stdout.write(`  上传 ${assetName} (${(size / 1048576).toFixed(1)}MB) ... `);
    const okUpload = await uploadAsset(token, uploadBase, assetName, file);
    console.log(okUpload ? '✓' : '✗');
    if (!okUpload) allOk = false;
  }
  return allOk;
}

/**
 * 把附件名里的非 ASCII 字符换成 ASCII。
 *
 * GitHub 在保存 Release 附件时会把非 ASCII 字符从资源名里剔除
 * （"PS5金手指自动汉化工具-1.1.0-x64.exe" → "PS5.-1.1.0-x64.exe"），
 * 导致下载到的文件名残缺。中文名保留在安装后的程序名和桌面快捷方式上，
 * 下载用的文件一律用 ASCII。
 */
function toAsciiAssetName(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const ascii = base
    .replace(/[^\x20-\x7E]+/g, '-')   // 非 ASCII → 连字符
    .replace(/-{2,}/g, '-')           // 合并连续连字符
    .replace(/^-|-$/g, '');           // 去掉首尾连字符
  return (ascii || 'asset') + ext;
}

/**
 * 只重传附件：产物重新打包后刷新 Release 上的文件，保留 Release 本体
 * （标题、正文、tag 都不动）。
 */
async function uploadAssetsOnly(token, tag) {
  const rel = await api(token, 'GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  if (rel.status !== 200) {
    console.error('  ✗ 找不到 Release:', rel.status, rel.json && rel.json.message);
    return false;
  }
  const release = rel.json;
  console.log(`Release ${release.tag_name} (id ${release.id})`);

  // 先删掉同名旧附件
  for (const a of release.assets || []) {
    const del = await api(token, 'DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${a.id}`);
    console.log(`  删除旧附件 ${a.name} -> ${del.status}`);
  }

  if (!fs.existsSync(DIST)) {
    console.error('  ✗ dist 目录不存在，请先运行 npm run dist');
    return false;
  }
  const uploadBase = release.upload_url.replace(/\{[^}]*\}$/, '');
  const assets = fs.readdirSync(DIST).filter((f) => /\.(exe|zip|blockmap)$/.test(f));
  let allOk = true;
  for (const f of assets) {
    const file = path.join(DIST, f);
    const size = fs.statSync(file).size;
    const assetName = toAsciiAssetName(f);
    process.stdout.write(`  上传 ${assetName} (${(size / 1048576).toFixed(1)}MB) ... `);
    const ok = await uploadAsset(token, uploadBase, assetName, file);
    console.log(ok ? '✓' : '✗');
    if (!ok) allOk = false;
  }
  return allOk;
}

async function uploadAsset(token, uploadUrl, name, file) {  const url = new URL(uploadUrl);
  const stat = fs.statSync(file);
  const opts = await requestOptions(url.hostname, {
    path: url.pathname + '?name=' + encodeURIComponent(name),
    method: 'POST',
    headers: {
      'User-Agent': 'PS5CheatCN-publisher',
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
    },
  });

  return new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve(true);
        } else {
          console.error(`\n    HTTP ${res.statusCode}: ${body.slice(0, 300)}`);
          resolve(false);
        }
      });
    });
    req.on('error', (e) => {
      console.error(`\n    上传失败: ${e.message}`);
      resolve(false);
    });
    fs.createReadStream(file).pipe(req);
  });
}

// ---------------------------------------------------------------- 主流程
async function main() {
  const [cmd, token, arg] = process.argv.slice(2);
  if (!cmd || !token) {
    console.log('用法: node tools/publish.js <create-repo|push|release|assets|all> <token> [tag]');
    process.exit(1);
  }
  try {
    if (cmd === 'create-repo') {
      process.exit(await createRepo(token) ? 0 : 1);
    } else if (cmd === 'push') {
      process.exit(pushCode(token) ? 0 : 1);
    } else if (cmd === 'release') {
      if (!arg) { console.error('请指定 tag，例如 v1.1.0'); process.exit(1); }
      process.exit(await createRelease(token, arg) ? 0 : 1);
    } else if (cmd === 'all') {
      if (!arg) { console.error('请指定 tag，例如 v1.1.0'); process.exit(1); }
      if (!await createRepo(token)) process.exit(1);
      if (!pushCode(token)) process.exit(1);
      process.exit(await createRelease(token, arg) ? 0 : 1);
    } else if (cmd === 'assets') {
      // 只重传附件（不动 Release 本体），用于产物重新打包后刷新
      if (!arg) { console.error('请指定 tag，例如 v1.1.0'); process.exit(1); }
      process.exit(await uploadAssetsOnly(token, arg) ? 0 : 1);
    } else {
      console.error('未知命令:', cmd);
      process.exit(1);
    }
  } catch (e) {
    console.error('执行失败:', e.message);
    process.exit(1);
  }
}

main();
