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
  bindMenu();
  bindDragDrop();
  loadSettings();
  updateStat();
});

// ---------------------------------------------------------------- 工具栏
function bindToolbar() {
  $('btnOpen').onclick = doOpen;
  $('btnSave').onclick = () => doSave(false);
  $('btnSaveAs').onclick = () => doSave(true);
  $('btnTranslateAll').onclick = doTranslateAll;
  $('btnRevertAll').onclick = doRevertAll;
  $('btnSettings').onclick = () => $('settingsModal').classList.remove('hidden');
}

function setEnabled(on) {
  $('btnSave').disabled = !on;
  $('btnSaveAs').disabled = !on;
  $('btnTranslateAll').disabled = !on;
  $('btnRevertAll').disabled = !on;
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
async function doSave(saveAs) {
  if (!state.filePath) return;

  // 打包模型
  const payload = {
    filePath: state.filePath,
    sourceFormat: state.sourceFormat,
    defaultName: defaultSaveName(),
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
      signatureMode: state.settings.signatureMode,
      targetFormat: state.settings.targetFormat,
    },
  };

  let res;
  if (saveAs) res = await window.api.saveAs(payload);
  else res = await window.api.save(payload);

  if (res.canceled) return;
  if (res.error) {
    setStatus('保存失败：' + res.error, true);
    return;
  }
  state.filePath = res.filePath;
  state.dirty = false;
  $('fileInfo').textContent = res.filePath;
  $('fileInfo').title = res.filePath;
  setStatus('已保存到 ' + res.filePath);
}

function defaultSaveName() {
  const base = (state.filePath || 'cheat').split(/[\\/]/).pop();
  const noExt = base.replace(/\.(mc4|shn|json)$/i, '');
  const ext = state.settings.targetFormat || state.sourceFormat;
  return `${noExt}.${ext}`;
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
  $('btnConvOk').onclick = async () => {
    $('convertModal').classList.add('hidden');
    state.settings.targetFormat = target;
    saveSettings();
    $('setTarget').value = target;
    await doSave(true);
  };
}

// ---------------------------------------------------------------- 菜单
function bindMenu() {
  window.api.onMenu((action) => {
    switch (action) {
      case 'open': doOpen(); break;
      case 'save': if (state.filePath) doSave(false); break;
      case 'saveAs': if (state.filePath) doSave(true); break;
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
