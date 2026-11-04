'use strict';
/**
 * GitHub 发布助手。
 *
 * 用法：
 *   node tools/publish.js create-repo <token>   创建远程仓库
 *   node tools/publish.js push <token>          推送代码
 *   node tools/publish.js release <token> <tag> 创建 Release 并上传安装包
 *
 * token 需具备 repo 权限（Personal Access Token / classic 或 fine-grained）
 */

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OWNER = 'liweili9264';
const REPO = 'PS5CheatCN';
const DIST = path.join(ROOT, 'dist');

function api(token, method, path_, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: path_,
      method,
      headers: {
        'User-Agent': 'PS5CheatCN-publisher',
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
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

async function createRepo(token) {
  console.log(`检查仓库 ${OWNER}/${REPO} ...`);
  const chk = await api(token, 'GET', `/repos/${OWNER}/${REPO}`);
  if (chk.status === 200) {
    console.log('  仓库已存在，跳过创建');
    return true;
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
  });
  if (res.status === 201) {
    console.log(`  ✓ 创建成功: https://github.com/${OWNER}/${REPO}`);
    return true;
  }
  console.error('  ✗ 创建失败:', res.status, res.json && res.json.message);
  return false;
}

function pushCode(token) {
  // 用带凭据的 URL 推送一次，避免交互式输入
  const url = `https://${token}@github.com/${OWNER}/${REPO}.git`;
  console.log('推送代码到 origin ...');
  try {
    execSync(`git push -u "${url}" main`, { cwd: ROOT, stdio: 'inherit' });
    console.log('  ✓ 推送完成');
    return true;
  } catch (e) {
    console.error('  ✗ 推送失败:', e.message);
    return false;
  }
}

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
      '下载 `PS5金手指自动汉化工具-*-x64.exe` 双击安装，安装后自动创建桌面快捷方式。',
      '',
      '### 功能',
      '- 打开 MC4（自动解密）/ SHN / JSON 三种格式',
      '- 每个修改项独立列出，可单条汉化或一键全译',
      '- 汉化结果可自由微调',
      '- 保存时写回原格式（MC4 加密结构字节级还原）',
      '- 三种格式互转',
      '- 保存时自动写入译者署名',
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

  // 上传附件
  if (!fs.existsSync(DIST)) {
    console.error('  ✗ dist 目录不存在，请先运行 npm run dist');
    return false;
  }
  const assets = fs.readdirSync(DIST).filter((f) => /\.(exe|zip|blockmap)$/.test(f));
  for (const f of assets) {
    const file = path.join(DIST, f);
    const size = fs.statSync(file).size;
    process.stdout.write(`  上传 ${f} (${(size / 1048576).toFixed(1)}MB) ... `);
    const okUpload = await uploadAsset(token, res.json.upload_url.replace('{/name}', ''), f, file);
    console.log(okUpload ? '✓' : '✗');
  }
  return true;
}

function uploadAsset(token, uploadUrl, name, file) {
  return new Promise((resolve) => {
    const stat = fs.statSync(file);
    const url = new URL(uploadUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + '?name=' + encodeURIComponent(name),
      method: 'POST',
      headers: {
        'User-Agent': 'PS5CheatCN-publisher',
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode === 201));
    });
    req.on('error', () => resolve(false));
    fs.createReadStream(file).pipe(req);
  });
}

async function main() {
  const [cmd, token, arg] = process.argv.slice(2);
  if (!cmd || !token) {
    console.log('用法: node tools/publish.js <create-repo|push|release> <token> [tag]');
    process.exit(1);
  }
  try {
    if (cmd === 'create-repo') {
      const ok = await createRepo(token);
      process.exit(ok ? 0 : 1);
    } else if (cmd === 'push') {
      process.exit(pushCode(token) ? 0 : 1);
    } else if (cmd === 'release') {
      if (!arg) { console.error('请指定 tag，例如 v1.0.0'); process.exit(1); }
      process.exit(await createRelease(token, arg) ? 0 : 1);
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
