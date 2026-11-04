'use strict';
/* 渲染进程：界面逻辑 */

const state = {
  filePath: null,
  sourceFormat: null,
  meta: null,
  mods: [],          // {name, origName, type, lines}
  selected: -1,
  dirty: false,
  settings: {
    signature: '————翻译：L.wl，编辑时间20261104————',
    signatureMode: 'entry',
    author: 'L.wl',
    targetFormat: '',
  },
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 启动
document.addEventListener('DOMContentLoaded', () => {
  bindToolbar();
  bindList();
  bindEdit();
  bindSettings();
  bindConvert();
  bindFullText();
  bindSaveDialog();
  bindMenu();
  bindDragDrop();
  loadSettings();
  updateStat();
});

// ---------------------------------------------------------------- 工具栏
function bindToolbar() {
  $('btnOpen').onclick = doOpen;
  $('btnSave').onclick = () => openSaveDialog();
  $('btnSaveAs').onclick = () => openSaveDialog();
  $('btnConvert').onclick = openConvertDialog;
  $('btnViewFull').onclick = openFullTextDialog;
  $('btnTranslateAll').onclick = doTranslateAll;
  $('btnRevertAll').onclick = doRevertAll;
  $('btnSettings').onclick = () => $('settingsModal').classList.remove('hidden');
}

function setEnabled(on) {
  $('btnSave').disabled = !on;
  $('btnSaveAs').disabled = !on;
  $('btnTranslateAll').disabled = !on;
  $('btnRevertAll').disabled = !on;
  $('btnConvert').disabled = !on;
  $('btnViewFull').disabled = !on;
  $('searchBox').disabled = !on;
  $('onlyUntranslated').disabled = !on;
}

// 暴露给自动化测试与调试用
window.__cheatTool = { state, loadModel, doTranslateAll, translateOne, revertOne, applyEdit, buildSignature };

// ---------------------------------------------------------------- 打开
async function doOpen() {
  const res = await window.api.openFile();
  if (res.canceled) return;
  if (res.error) {
    setStatus('打开失败：' + res.error, true);
    return;
  }
  loadModel(res.filePath, res.model);
}

function loadModel(filePath, model) {
  state.filePath = filePath;
  state.sourceFormat = model.sourceFormat;
  state.meta = model.meta;
  state.mods = model.mods.map((m) => ({
    name: m.name,
    origName: m.name,
    type: m.type || 'checkbox',
    lines: m.lines || [],
    translated: false,
  }));
  state.selected = -1;
  state.dirty = false;

  // 保留原始文本，供定点替换用
  state.raw = model.raw;
  state.plainXml = model.plainXml;

  $('fileInfo').textContent = filePath;
  $('fileInfo').title = filePath;
  $('metaBar').classList.remove('hidden');
  $('mGame').textContent = model.meta.game || '—';
  $('mCusa').textContent = model.meta.cusa || '—';
  $('mVersion').textContent = model.meta.version || '—';
  $('mAuthor').textContent = model.meta.author || '—';
  $('mFormat').textContent = model.sourceFormat.toUpperCase();
  $('mCount').textContent = state.mods.length;

  setEnabled(true);
  renderList();
  renderEdit();
  updateStat();
  setStatus(`已打开 ${state.mods.length} 个修改项`);
}

// ---------------------------------------------------------------- 列表
function bindList() {
  $('searchBox').oninput = renderList;
  $('onlyUntranslated').onchange = renderList;

  $('modList').addEventListener('click', (e) => {
    const row = e.target.closest('.mod-row');
    if (!row) return;
    const idx = +row.dataset.idx;
    const btn = e.target.closest('.op-btn');

    if (btn) {
      e.stopPropagation();
      if (btn.classList.contains('tr')) translateOne(idx);
      else if (btn.classList.contains('re')) revertOne(idx);
      return;
    }
    selectMod(idx);
  });
}

function filteredIndexes() {
  const q = $('searchBox').value.trim().toLowerCase();
  const onlyUn = $('onlyUntranslated').checked;
  const out = [];
  for (let i = 0; i < state.mods.length; i++) {
    const m = state.mods[i];
    if (onlyUn && m.translated) continue;
    if (q) {
      const hay = (m.origName + ' ' + m.name).toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(i);
  }
  return out;
}

function renderList() {
  const list = $('modList');
  if (!state.mods.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎮</div>
      <div class="empty-title">拖入或打开金手指文件</div>
      <div class="empty-sub">支持 MC4 / SHN / JSON 三种格式</div></div>`;
    return;
  }

  const idxs = filteredIndexes();
  if (!idxs.length) {
    list.innerHTML = `<div class="empty-state small"><div class="empty-icon">🔍</div>
      <div class="empty-title">没有符合条件的条目</div></div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  idxs.forEach((i) => {
    const m = state.mods[i];
    const row = document.createElement('div');
    row.className = 'mod-row' + (i === state.selected ? ' selected' : '') + (m.translated ? ' dirty' : '');
    row.dataset.idx = i;

    const changed = m.name !== m.origName;
    row.innerHTML = `
      <span class="col-idx">${i + 1}</span>
      <span class="col-orig" title="${escapeHtml(m.origName)}">${escapeHtml(m.origName)}</span>
      <span class="col-cn ${changed ? 'translated' : 'empty'}" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
      <span class="col-op">
        <button class="op-btn tr" title="自动汉化这一条">译</button>
        <button class="op-btn re" title="恢复原文">↺</button>
      </span>`;
    frag.appendChild(row);
  });
  list.innerHTML = '';
  list.appendChild(frag);
  updateStat();
}

function selectMod(idx) {
  state.selected = idx;
  renderList();
  renderEdit();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- 详情编辑
function bindEdit() {
  $('btnSaveOne').onclick = applyEdit;
}

function renderEdit() {
  const box = $('editBody');
  const i = state.selected;
  if (i < 0 || i >= state.mods.length) {
    box.innerHTML = `<div class="empty-state small"><div class="empty-icon">✏️</div>
      <div class="empty-title">选择左侧条目进行编辑</div></div>`;
    $('btnSaveOne').disabled = true;
    return;
  }
  $('btnSaveOne').disabled = false;
  const m = state.mods[i];

  const linesHtml = m.lines.map((l, n) => `
    <div class="cheatline">
      <div class="cl-head"><span>指令 ${n + 1}</span><span>Section ${escapeHtml(l.section)}</span></div>
      <div class="cl-grid">
        <div class="cl-item"><label>Offset</label><span>${escapeHtml(l.offset)}</span></div>
        <div class="cl-item"><label>Type</label><span>${escapeHtml(m.type)}</span></div>
        <div class="cl-item"><label>ValueOn</label><span>${escapeHtml(l.on)}</span></div>
        <div class="cl-item"><label>ValueOff</label><span>${escapeHtml(l.off)}</span></div>
      </div>
    </div>`).join('');

  box.innerHTML = `
    <div class="ed-field">
      <label>原名称（不可修改）</label>
      <input type="text" id="fOrig" value="${escapeHtml(m.origName)}" readonly>
    </div>
    <div class="ed-field">
      <label>汉化名称（可自由修改）</label>
      <input type="text" id="fName" value="${escapeHtml(m.name)}" placeholder="在这里输入或修改名称">
      <div class="ed-hint">汉化后可自由微调；回车即可应用到本条</div>
    </div>
    <div class="ed-row">
      <div class="ed-field">
        <label>类型</label>
        <input type="text" id="fType" value="${escapeHtml(m.type)}">
      </div>
      <div class="ed-field">
        <label>状态</label>
        <input type="text" value="${m.translated ? '已汉化' : '未汉化'}" readonly>
      </div>
    </div>
    <div class="ed-actions">
      <button class="btn btn-accent btn-small" id="btnTrOne">🌐 自动汉化本条</button>
      <button class="btn btn-small" id="btnReOne">↺ 恢复原文</button>
    </div>
    <div class="ed-section">
      <h4>原始指令数据（只读，保存时保持不变）</h4>
      ${linesHtml || '<div class="ed-hint">无指令数据</div>'}
    </div>`;

  $('btnTrOne').onclick = () => translateOne(i);
  $('btnReOne').onclick = () => revertOne(i);
  $('fName').onkeydown = (e) => { if (e.key === 'Enter') applyEdit(); };
}

function applyEdit() {
  const i = state.selected;
  if (i < 0) return;
  const val = $('fName').value;
  state.mods[i].name = val;
  state.mods[i].translated = val !== state.mods[i].origName;
  state.dirty = true;
  renderList();
  renderEdit();
  setStatus('已应用到第 ' + (i + 1) + ' 条');
}

// ---------------------------------------------------------------- 汉化
async function translateOne(idx) {
  const m = state.mods[idx];
  if (!m) return;
  const r = await window.api.translateOne(m.origName);
  if (r.hit) {
    m.name = r.text;
    m.translated = true;
    state.dirty = true;
    setStatus(`第 ${idx + 1} 条已汉化：${r.text}  [${r.reason}]`);
  } else {
    // 未命中：保留原文，提示手动填写
    m.name = m.origName;
    m.translated = false;
    setStatus(`第 ${idx + 1} 条未能自动识别（${r.reason}），请手动填写`, true);
  }
  renderList();
  if (state.selected === idx) renderEdit();
}

function revertOne(idx) {
  const m = state.mods[idx];
  if (!m) return;
  m.name = m.origName;
  m.translated = false;
  state.dirty = true;
  renderList();
  if (state.selected === idx) renderEdit();
  setStatus(`第 ${idx + 1} 条已恢复原文`);
}

async function doTranslateAll() {
  const pending = [];
  for (let i = 0; i < state.mods.length; i++) {
    if (state.mods[i].name === state.mods[i].origName) pending.push(i);
  }
  if (!pending.length) {
    setStatus('没有需要汉化的条目');
    return;
  }
  setStatus(`正在汉化 ${pending.length} 条...`);
  const names = pending.map((i) => state.mods[i].origName);
  const results = await window.api.translateBatch(names);

  let ok = 0, miss = 0;
  results.forEach((r, n) => {
    const i = pending[n];
    if (r.hit) {
      state.mods[i].name = r.text;
      state.mods[i].translated = true;
      ok++;
    } else {
      miss++;
    }
  });
  state.dirty = true;
  renderList();
  if (state.selected >= 0) renderEdit();
  updateStat();
  setStatus(`自动汉化完成：成功 ${ok} 条，未识别 ${miss} 条（未识别项可手动修改）`);
}

function doRevertAll() {
  state.mods.forEach((m) => { m.name = m.origName; m.translated = false; });
  state.dirty = true;
  renderList();
  if (state.selected >= 0) renderEdit();
  updateStat();
  setStatus('已撤销全部汉化');
}

// ---------------------------------------------------------------- 保存

/**
 * 打开保存对话框。
 * 需求：默认沿用原格式，文件名加 _CN 后缀（可改），格式可切换。
 */
function openSaveDialog(forceFormat) {
  if (!state.filePath) return;

  const base = (state.filePath || 'cheat').split(/[\\/]/).pop();
  let noExt = base.replace(/\.(mc4|shn|json)$/i, '');
  const srcExt = state.sourceFormat || 'json';

  // 默认格式：与原文件相同（转换按钮传入的 forceFormat 优先）
  const defFmt = forceFormat || srcExt;

  // 默认文件名：原名 + _CN + 新扩展名。
  // 已经带 _CN 的不再重复加（避免 _CN_CN）
  if (!/_CN$/i.test(noExt)) noExt = noExt + '_CN';
  const defName = `${noExt}.${defFmt}`;

  $('saveFileName').value = defName;
  $('saveDir').value = (state.filePath || '').replace(/[\\/][^\\/]*$/, '');
  $('saveFormat').value = defFmt === srcExt ? '' : defFmt;
  $('saveSigMode').value = state.settings.signatureMode;

  updateSaveHints();
  $('saveModal').classList.remove('hidden');
}

/** 更新保存对话框里的提示信息 */
function updateSaveHints() {
  const fmt = $('saveFormat').value || state.sourceFormat;
  const names = { mc4: 'MC4（加密）', shn: 'SHN（XML）', json: 'JSON' };
  const srcFmt = state.sourceFormat;

  $('saveFormatHint').textContent = fmt === srcFmt
    ? `保持与原文件相同的 ${names[fmt]} 格式`
    : `将从 ${names[srcFmt]} 转换为 ${names[fmt]}（转换会重新生成文件结构）`;

  const mode = $('saveSigMode').value;
  if (mode === 'none') {
    $('saveSigPreview').textContent = '保存时不写入任何署名信息';
  } else {
    $('saveSigPreview').textContent = '署名：' + buildSignature();
  }
}

/** 执行保存（使用保存对话框里的设置） */
async function doSaveWithDialog() {
  const fileName = ($('saveFileName').value || '').trim();
  if (!fileName) {
    setStatus('文件名不能为空', true);
    return;
  }
  const dir = $('saveDir').value || '';
  const target = dir ? dir + '\\' + fileName : fileName;
  const targetFormat = $('saveFormat').value || state.sourceFormat;

  const payload = {
    filePath: target,
    sourceFormat: state.sourceFormat,
    defaultName: fileName,
    model: {
      format: state.sourceFormat,
      sourceFormat: state.sourceFormat,
      meta: state.meta,
      mods: state.mods.map((m) => ({
        name: m.name,
        type: m.type,
        lines: m.lines,
      })),
      raw: state.raw,
      plainXml: state.plainXml,
    },
    opts: {
      signature: buildSignature(),
      signatureMode: $('saveSigMode').value,
      targetFormat,
    },
  };

  const res = await window.api.saveTo(payload);
  if (res.canceled) return;
  if (res.error) {
    setStatus('保存失败：' + res.error, true);
    return;
  }
  $('saveModal').classList.add('hidden');
  state.filePath = res.filePath;
  state.dirty = false;
  $('fileInfo').textContent = res.filePath;
  $('fileInfo').title = res.filePath;
  setStatus('已保存到 ' + res.filePath);
}

/** 生成署名文本 */
function buildSignature() {
  const mode = state.settings.signatureMode;
  if (mode === 'none') return '';
  const author = (state.settings.author || '').trim();
  const tmpl = state.settings.signature || '';
  // 若模板里没有作者和时间，动态填入
  let sig = tmpl;
  if (!/[0-9]{8}/.test(sig)) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    // 模板里若已写「翻译：xxx」，只替换作者名；若为空则整体填充
    if (/翻译[:：]/.test(sig)) {
      sig = sig.replace(/(翻译[:：])[^，,：:]*([，,]\s*编辑时间)/, `$1${author}$2`);
      // 模板形如「————翻译：，编辑时间————」：作者仍为空时补上
      if (!new RegExp('翻译[:：]' + author).test(sig)) {
        sig = sig.replace(/(翻译[:：])[^，,：:]*/, `$1${author}`);
      }
      // 补日期
      if (!/[0-9]{8}/.test(sig)) {
        sig = sig.replace(/(编辑时间)[^，,]*$/, `$1${ymd}`);
      }
    } else {
      // 没有「翻译：」标记，直接套用默认格式
      sig = `————翻译：${author}，编辑时间${ymd}————`;
    }
  }
  return sig;
}

// ---------------------------------------------------------------- 设置
function bindSettings() {
  $('btnSetCancel').onclick = () => $('settingsModal').classList.add('hidden');
  $('btnSetSave').onclick = () => {
    state.settings.signature = $('setSignature').value;
    state.settings.signatureMode = $('setSigMode').value;
    state.settings.author = $('setAuthor').value;
    state.settings.targetFormat = $('setTarget').value;
    saveSettings();
    $('settingsModal').classList.add('hidden');
    setStatus('设置已保存');
  };
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('ps5cheat-settings') || '{}');
    Object.assign(state.settings, s);
  } catch (e) { /* ignore */ }
  $('setSignature').value = state.settings.signature;
  $('setSigMode').value = state.settings.signatureMode;
  $('setAuthor').value = state.settings.author;
  $('setTarget').value = state.settings.targetFormat;
}

function saveSettings() {
  try {
    localStorage.setItem('ps5cheat-settings', JSON.stringify(state.settings));
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- 保存对话框
function bindSaveDialog() {
  $('btnSaveCancel').onclick = () => $('saveModal').classList.add('hidden');
  $('btnSaveOk').onclick = doSaveWithDialog;
  $('btnPickDir').onclick = async () => {
    const res = await window.api.pickDir();
    if (res && res.dir) $('saveDir').value = res.dir;
  };
  $('saveFormat').onchange = updateSaveHints;
  $('saveSigMode').onchange = updateSaveHints;
  // 文件名随格式联动扩展名
  $('saveFileName').oninput = () => {
    const fmt = $('saveFormat').value || state.sourceFormat;
    const base = ($('saveFileName').value || '').replace(/\.(mc4|shn|json)$/i, '');
    $('saveFileName').value = base + '.' + fmt;
  };
}

// ---------------------------------------------------------------- 格式转换
function bindConvert() {
  let target = 'json';
  const cards = document.querySelectorAll('.convert-card');
  cards.forEach((c) => {
    c.onclick = () => {
      cards.forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      target = c.dataset.fmt;
    };
  });

  $('btnConvCancel').onclick = () => $('convertModal').classList.add('hidden');
  $('btnConvOk').onclick = () => {
    $('convertModal').classList.add('hidden');
    // 直接打开保存对话框，并预填目标格式
    openSaveDialog(target);
  };
}

/**
 * 「转换格式」按钮：先选目标格式，再进保存对话框。
 */
function openConvertDialog() {
  if (!state.filePath) return;
  const srcFmt = state.sourceFormat;
  const cards = Array.from(document.querySelectorAll('.convert-card'));
  // 先全部取消高亮，再只选中一个与原格式不同的格式
  cards.forEach((c) => c.classList.remove('active'));
  const firstDiff = cards.find((c) => c.dataset.fmt !== srcFmt);
  if (firstDiff) firstDiff.classList.add('active');
  $('convertModal').classList.remove('hidden');
}

// ---------------------------------------------------------------- 全文查看
function bindFullText() {
  $('btnFullClose').onclick = () => $('fullModal').classList.add('hidden');
  $('btnFullWrap').onclick = () => {
    const el = $('fullText');
    el.classList.toggle('wrap');
    $('btnFullWrap').textContent = '自动换行：' + (el.classList.contains('wrap') ? '开' : '关');
  };
  $('btnFullCopy').onclick = async () => {
    const text = $('fullText').textContent;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('全文已复制到剪贴板');
    } catch (e) {
      setStatus('复制失败，请手动选择复制', true);
    }
  };
}

/**
 * 查看文件全文。
 * MC4 会先解密成 XML 再显示，方便核对内容。
 */
async function openFullTextDialog() {
  if (!state.filePath) return;
  const res = await window.api.getFullText(state.filePath);
  if (res.error) {
    setStatus('读取全文失败：' + res.error, true);
    return;
  }
  $('fullText').textContent = res.text;
  const fmtName = { mc4: 'MC4（已解密显示）', shn: 'SHN（XML）', json: 'JSON' }[res.format] || res.format;
  $('fullMeta').textContent = `格式：${fmtName}    路径：${state.filePath}`;
  $('fullSize').textContent = `${res.text.length.toLocaleString()} 字符 · ${res.bytes.toLocaleString()} 字节`;
  $('fullModal').classList.remove('hidden');
}

// ---------------------------------------------------------------- 菜单
function bindMenu() {
  window.api.onMenu((action) => {
    switch (action) {
      case 'open': doOpen(); break;
      case 'save': if (state.filePath) openSaveDialog(); break;
      case 'saveAs': if (state.filePath) openSaveDialog(); break;
      case 'translateAll': if (state.mods.length) doTranslateAll(); break;
      case 'revertAll': if (state.mods.length) doRevertAll(); break;
      case 'settings': $('settingsModal').classList.remove('hidden'); break;
    }
  });
}

// ---------------------------------------------------------------- 拖放
function bindDragDrop() {
  let hint = null;
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'drop-hint';
      hint.textContent = '松开鼠标打开该金手指文件';
      document.body.appendChild(hint);
    }
  });
  document.addEventListener('dragleave', (e) => {
    if (e.clientX === 0 && e.clientY === 0 && hint) {
      hint.remove(); hint = null;
    }
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (hint) { hint.remove(); hint = null; }
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const res = await window.api.openPath(f.path);
    if (res.ok) loadModel(res.filePath, res.model);
    else setStatus('打开失败：' + res.error, true);
  });
}

// ---------------------------------------------------------------- 状态
function setStatus(msg, isErr) {
  const el = $('statusMsg');
  el.textContent = msg;
  el.style.color = isErr ? 'var(--red)' : 'var(--text-dim)';
}

function updateStat() {
  if (!state.mods.length) {
    $('statLine').textContent = '—';
    $('translateStat').textContent = '';
    return;
  }
  const done = state.mods.filter((m) => m.name !== m.origName).length;
  $('statLine').textContent = `共 ${state.mods.length} 项，已汉化 ${done} 项`;
  $('translateStat').textContent = state.dirty ? '● 有未保存的修改' : '';
  $('translateStat').style.color = state.dirty ? 'var(--orange)' : 'var(--green)';
}
