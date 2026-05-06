(function () {
  // Derive base URL from viewer.html's own location — works both locally and on GitHub Pages
  const BASE_URL = new URL('./', window.location.href).href;

  const codeContent = document.getElementById('codeContent');
  const preview     = document.getElementById('preview');

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function buildUrl(type, filename) {
    if (!type || !filename) return null;
    return BASE_URL + encodeURIComponent(type) + '/' + encodeURIComponent(filename);
  }

  // --- Contenteditable code editor with Prism highlight ---

  // Save cursor as a character offset from the start of codeContent
  function saveSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return -1;
    const range = sel.getRangeAt(0);
    if (!codeContent.contains(range.commonAncestorContainer)) return -1;
    const pre = range.cloneRange();
    pre.selectNodeContents(codeContent);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  // Restore cursor from a character offset, traversing Prism's span tree
  function restoreSelection(offset) {
    if (offset < 0) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    let chars = 0, found = false;
    (function walk(node) {
      if (found) return;
      if (node.nodeType === Node.TEXT_NODE) {
        if (chars + node.length >= offset) {
          range.setStart(node, offset - chars);
          range.collapse(true);
          found = true;
        } else {
          chars += node.length;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    })(codeContent);
    if (!found) { range.selectNodeContents(codeContent); range.collapse(false); }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Re-highlight in place, preserving cursor position
  function updateHighlight() {
    if (!window.Prism) return;
    const offset = saveSelection();
    const text = codeContent.textContent;
    codeContent.textContent = text; // strip existing spans to plain text
    Prism.highlightElement(codeContent);
    restoreSelection(offset);
  }

  // Set code content from JS (load / revert), running Prism after
  function setCode(text) {
    codeContent.textContent = text || '';
    if (window.Prism && text) Prism.highlightElement(codeContent);
  }

  let codeDirty = false;
  let highlightTimer = null;

  codeContent.addEventListener('input', function () {
    codeDirty = true;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(function () {
      updateHighlight();
      refreshLivePreview();
      codeDirty = false;
    }, 1000);
  });

  codeContent.addEventListener('blur', function () {
    clearTimeout(highlightTimer);
    updateHighlight();
    if (codeDirty) {
      refreshLivePreview();
      codeDirty = false;
    }
  });

  // -------------------------------------------------------------------------
  // Preview background
  // -------------------------------------------------------------------------

  const PREVIEW_BG_KEY = 'viewer-preview-bg';
  const previewBgInput = document.getElementById('previewBgInput');
  let previewBg = localStorage.getItem(PREVIEW_BG_KEY) || '#ffffff';
  previewBgInput.value = previewBg;

  function buildPreviewDoc(html) {
    return '<style>html,body{margin:0;background:' + previewBg + '}body{padding:20px}[id^="r"] *{white-space:pre-line}</style>' + (html || '');
  }

  previewBgInput.addEventListener('input', function () {
    previewBg = this.value;
    localStorage.setItem(PREVIEW_BG_KEY, previewBg);
    if (originalSource) refreshLivePreview();
  });

  const eyeDropperBtn = document.getElementById('eyeDropperBtn');
  if (!('EyeDropper' in window)) {
    eyeDropperBtn.hidden = true;
  } else {
    eyeDropperBtn.addEventListener('click', async function () {
      try {
        const result = await new window.EyeDropper().open();
        previewBg = result.sRGBHex;
        previewBgInput.value = previewBg;
        localStorage.setItem(PREVIEW_BG_KEY, previewBg);
        if (originalSource) refreshLivePreview();
      } catch (e) { /* cancelled */ }
    });
  }

  // -------------------------------------------------------------------------
  // Variable panel
  // -------------------------------------------------------------------------

  function isColorValue(v) {
    return /^#[0-9a-fA-F]{3,8}$/.test(v) || /^(rgb|rgba|hsl|hsla)\s*\(/i.test(v);
  }

  function isSizeValue(v) {
    return /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|pt|ex|ch)\s*$/i.test(v);
  }

  function toFullHex(color) {
    const m3 = color.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/i);
    if (m3) return '#' + m3[1]+m3[1] + m3[2]+m3[2] + m3[3]+m3[3];
    const m4 = color.match(/^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/i);
    if (m4) return '#' + m4[1];
    return color;
  }

  function formatLabel(name) {
    return name.replace(/^--/, '').replace(/[-_]/g, ' ')
               .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function parseTemplateVars(html) {
    if (!html) return [];
    const m = html.match(/<div\b[^>]*\bid="r[^"]*"[^>]*\bstyle="([^"]*--[^"]*)"/i) ||
              html.match(/<div\b[^>]*\bstyle="([^"]*--[^"]*)"[^>]*\bid="r[^"]*"/i);
    if (!m) return [];
    const vars = [];
    const re = /(--[\w-]+)\s*:\s*([^;}"']+)/g;
    let hit;
    while ((hit = re.exec(m[1])) !== null) {
      vars.push({ name: hit[1].trim(), value: hit[2].trim() });
    }
    return vars;
  }

  function setVariable(name, newValue) {
    const esc = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const newText = codeContent.textContent.replace(
      new RegExp('(' + esc + '\\s*:\\s*)([^;}"\']+)', 'g'),
      '$1' + newValue
    );
    setCode(newText);
    refreshLivePreview();
  }

  function refreshLivePreview() {
    preview.srcdoc = buildPreviewDoc(codeContent.textContent);
  }

  function makeColorRow(v) {
    const row = document.createElement('div');
    row.className = 'var-row';
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = toFullHex(v.value);
    inp.addEventListener('input', function () { setVariable(v.name, this.value); });
    const lbl = document.createElement('label');
    lbl.textContent = formatLabel(v.name);
    lbl.title = v.name;
    row.append(inp, lbl);
    return row;
  }

  function makeSizeRow(v) {
    const row = document.createElement('div');
    row.className = 'var-row';
    const mUnit = v.value.match(/^(-?\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|pt)$/i);
    const num  = mUnit ? parseFloat(mUnit[1]) : 0;
    const unit = mUnit ? mUnit[2] : '';
    const lbl = document.createElement('label');
    lbl.textContent = formatLabel(v.name);
    lbl.title = v.name;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'var-num';
    inp.value = num;
    inp.step = unit.toLowerCase() === 'px' ? 1 : 0.1;
    inp.addEventListener('input', function () { setVariable(v.name, this.value + unit); });
    const span = document.createElement('span');
    span.className = 'var-unit';
    span.textContent = unit;
    row.append(lbl, inp, span);
    return row;
  }

  function buildVarPanel(html) {
    const panel    = document.getElementById('varPanel');
    const colorGrp = document.getElementById('colorVars');
    const sizeGrp  = document.getElementById('sizeVars');
    colorGrp.innerHTML = '';
    sizeGrp.innerHTML  = '';

    const vars   = parseTemplateVars(html);
    const colors = vars.filter(function (v) { return isColorValue(v.value); });
    const sizes  = vars.filter(function (v) { return isSizeValue(v.value); });

    if (!colors.length && !sizes.length) { panel.hidden = true; return; }

    if (colors.length) {
      const t = document.createElement('div');
      t.className = 'var-group-title';
      t.textContent = 'Colors';
      colorGrp.append(t);
      colors.forEach(function (v) { colorGrp.append(makeColorRow(v)); });
    }
    if (sizes.length) {
      const t = document.createElement('div');
      t.className = 'var-group-title';
      t.textContent = 'Sizes';
      sizeGrp.append(t);
      sizes.forEach(function (v) { sizeGrp.append(makeSizeRow(v)); });
    }

    colorGrp.hidden = !colors.length;
    sizeGrp.hidden  = !sizes.length;
    panel.hidden    = false;

    const body = document.getElementById('varBody');
    if (body.hidden) {
      body.hidden = false;
      document.getElementById('varToggle').classList.remove('collapsed');
    }
  }

  document.getElementById('varToggle').addEventListener('click', function () {
    const body = document.getElementById('varBody');
    body.hidden = !body.hidden;
    this.classList.toggle('collapsed', body.hidden);
  });

  // -------------------------------------------------------------------------
  // Template index
  // -------------------------------------------------------------------------

  let templatesIndex = {};
  let originalSource = '';

  async function loadIndex() {
    try {
      const res = await fetch(BASE_URL + 'assets/templates.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      templatesIndex = await res.json();
      populateTypeSelect();
    } catch (e) {
      console.error('Failed to load templates index:', e);
    }
  }

  function populateTypeSelect() {
    const sel = document.getElementById('typeSelect');
    sel.innerHTML = '';
    Object.keys(templatesIndex).sort().forEach(function (k) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    });
    if (sel.value) setFilesForType(sel.value);
  }

  // --- Combobox ---
  let allFiles  = [];
  let highlighted = -1;

  function setFilesForType(type) {
    allFiles = templatesIndex[type] || [];
    document.getElementById('fileInput').value = '';
    hideDropdown();
  }

  function getFilteredFiles(query) {
    if (!query.trim()) return allFiles;
    const q = query.trim().toLowerCase();
    return allFiles.filter(function (f) {
      return f.toLowerCase().replace(/\.html$/i, '').includes(q);
    });
  }

  function renderDropdown(query) {
    const ul = document.getElementById('fileDropdown');
    const matches = getFilteredFiles(query);
    ul.innerHTML = '';
    highlighted = -1;
    if (!matches.length) { hideDropdown(); return; }
    matches.forEach(function (name) {
      const li = document.createElement('li');
      li.textContent = name.replace(/\.html$/i, '');
      li.dataset.value = name;
      li.setAttribute('role', 'option');
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        pickFile(name);
      });
      ul.appendChild(li);
    });
    showDropdown();
  }

  function showDropdown() {
    document.getElementById('fileDropdown').removeAttribute('hidden');
    document.getElementById('fileInput').setAttribute('aria-expanded', 'true');
  }

  function hideDropdown() {
    document.getElementById('fileDropdown').setAttribute('hidden', '');
    document.getElementById('fileInput').setAttribute('aria-expanded', 'false');
    highlighted = -1;
  }

  function pickFile(name) {
    const type = document.getElementById('typeSelect').value;
    document.getElementById('fileInput').value = name.replace(/\.html$/i, '');
    hideDropdown();
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('type', type);
    newUrl.searchParams.set('file', name);
    window.history.replaceState({}, '', newUrl);
    loadTemplate(type, name);
  }

  function tryLoadFromInput() {
    const type = document.getElementById('typeSelect').value;
    const inputVal = fileInput.value.trim();
    if (!type || !inputVal) return;
    const withExt = inputVal.replace(/\.html$/i, '') + '.html';
    const actual = allFiles.find(function (f) {
      return f.toLowerCase() === withExt.toLowerCase();
    });
    if (!actual) {
      fileInput.classList.add('error');
      setTimeout(function () { fileInput.classList.remove('error'); }, 2000);
      codeContent.textContent = 'Template "' + inputVal + '" not found in category "' + type + '".';
      buildVarPanel('');
      preview.src = 'about:blank';
      return;
    }
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('type', type);
    newUrl.searchParams.set('file', actual);
    window.history.replaceState({}, '', newUrl);
    hideDropdown();
    loadTemplate(type, actual);
  }

  function moveHighlight(dir) {
    const items = document.getElementById('fileDropdown').querySelectorAll('li');
    if (!items.length) return;
    if (highlighted >= 0) items[highlighted].removeAttribute('aria-selected');
    highlighted = Math.max(0, Math.min(items.length - 1, highlighted + dir));
    items[highlighted].setAttribute('aria-selected', 'true');
    items[highlighted].scrollIntoView({ block: 'nearest' });
  }

  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('focus', function () { renderDropdown(this.value); });
  fileInput.addEventListener('input', function () { this.classList.remove('error'); renderDropdown(this.value); });
  fileInput.addEventListener('blur', function () { setTimeout(hideDropdown, 150); });
  fileInput.addEventListener('keydown', function (e) {
    const ul = document.getElementById('fileDropdown');
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (ul.hidden) renderDropdown(this.value);
        moveHighlight(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveHighlight(-1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlighted >= 0 && !ul.hidden) {
          const item = ul.querySelectorAll('li')[highlighted];
          if (item) pickFile(item.dataset.value);
        } else {
          hideDropdown();
          tryLoadFromInput();
        }
        break;
      case 'Escape':
        hideDropdown();
        break;
    }
  });

  // --- Template loading ---
  async function loadTemplate(type, filename) {
    const url = buildUrl(type, filename);

    if (!url) {
      setCode('');
      buildVarPanel('');
      preview.src = 'about:blank';
      return;
    }

    codeContent.textContent = 'Loading…';
    buildVarPanel('');
    preview.srcdoc = buildPreviewDoc('');

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      originalSource = text;
      clearTimeout(highlightTimer);
      codeDirty = false;
      setCode(text);
      buildVarPanel(text);
      preview.srcdoc = buildPreviewDoc(text);
    } catch (err) {
      codeContent.textContent = 'Error loading file: ' + err.message;
      buildVarPanel('');
      preview.srcdoc = '<p style="color:crimson;font-family:sans-serif;padding:1em">Error loading preview</p>';
    }
  }

  // --- Toolbar buttons ---
  document.getElementById('copyBtn').addEventListener('click', function () {
    const t = codeContent.textContent;
    if (!navigator.clipboard) { alert('Clipboard not supported'); return; }
    navigator.clipboard.writeText(t).then(function () {
      const btn = document.getElementById('copyBtn');
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy source'; }, 1200);
    });
  });

  document.getElementById('revertBtn').addEventListener('click', function () {
    if (!originalSource) return;
    clearTimeout(highlightTimer);
    codeDirty = false;
    setCode(originalSource);
    buildVarPanel(originalSource);
    preview.srcdoc = buildPreviewDoc(originalSource);
  });

  document.getElementById('openForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideDropdown();
    tryLoadFromInput();
  });

  document.getElementById('typeSelect').addEventListener('change', function () {
    setFilesForType(this.value);
  });

  // --- Resizer ---
  (function () {
    const resizer   = document.getElementById('resizer');
    const codePane  = document.querySelector('.pane.code');
    const container = document.querySelector('.container');
    const SPLIT_KEY = 'viewer-split';

    const saved = parseFloat(localStorage.getItem(SPLIT_KEY));
    if (saved >= 15 && saved <= 85) codePane.style.flex = '0 0 ' + saved + '%';

    function onMove(e) {
      const rect = container.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(15, Math.min(85, pct));
      codePane.style.flex = '0 0 ' + pct + '%';
      localStorage.setItem(SPLIT_KEY, pct);
    }

    function onUp() {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      preview.style.pointerEvents = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      preview.style.pointerEvents = 'none'; // stop iframe stealing mouse events
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();

  window.addEventListener('load', async function () {
    await loadIndex();

    const typeParam = qs('type');
    const fileParam = qs('file');
    const typeSelect = document.getElementById('typeSelect');

    if (typeParam && templatesIndex[typeParam]) {
      typeSelect.value = typeParam;
      setFilesForType(typeParam);
    } else {
      const first = Object.keys(templatesIndex).sort()[0];
      if (first) { typeSelect.value = first; setFilesForType(first); }
    }

    if (fileParam) {
      document.getElementById('fileInput').value = fileParam.replace(/\.html$/i, '');
      const type = typeSelect.value;
      if (type) loadTemplate(type, fileParam);
    }
  });
})();
