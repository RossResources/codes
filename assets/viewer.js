// Minimal viewer.js for prototype
(function () {
  function qs(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildUrlFromPath(path) {
    if (!path) return null;
    // If absolute URL provided
    try {
      const u = new URL(path);
      return u.href;
    } catch (e) {}

    // If path starts with slash, treat as root-relative
    if (path.startsWith('/')) {
      return window.location.origin + path;
    }

    // Otherwise, assume path relative to /codes/
    return window.location.origin + '/codes/' + encodeURI(path);
  }

  async function loadFile(path) {
    const url = buildUrlFromPath(path);
    const codeEl = document.getElementById('codeContent');
    const preview = document.getElementById('preview');

    if (!url) {
      codeEl.textContent = 'No file specified.';
      preview.srcdoc = '';
      return;
    }

    codeEl.textContent = 'Loading...';
    preview.src = 'about:blank';

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      codeEl.innerHTML = escapeHtml(text);
      // set iframe src to the hosted URL for correct relative asset resolution
      preview.src = url;
      // update Open Original button
      document.getElementById('openOrig').onclick = function () {
        window.open(url, '_blank');
      };
      // update input value to the original form
      document.getElementById('fileInput').value = path;
    } catch (err) {
      codeEl.textContent = 'Error loading file: ' + err.message;
      preview.srcdoc = '<p style="color:crimson">Error loading preview</p>';
    }
  }

  // Wire up form and buttons
  document.getElementById('openForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    const v = document.getElementById('fileInput').value.trim();
    if (!v) return;
    // update URL query param for sharing
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('file', v);
    window.history.replaceState({}, '', newUrl);
    loadFile(v);
  });

  document.getElementById('copyBtn').addEventListener('click', function () {
    const t = document.getElementById('codeContent').innerText;
    if (!navigator.clipboard) {
      alert('Clipboard not supported');
      return;
    }
    navigator.clipboard.writeText(t).then(function () {
      // brief feedback
      document.getElementById('copyBtn').textContent = 'Copied';
      setTimeout(function () { document.getElementById('copyBtn').textContent = 'Copy source'; }, 1200);
    });
  });

  // On load, check query param
  window.addEventListener('load', function () {
    const fileParam = qs('file');
    if (fileParam) {
      // Use raw param as-is; it should be URL-encoded when linking
      loadFile(fileParam);
    } else {
      // show a helpful placeholder example
      const input = document.getElementById('fileInput');
      input.value = 'thread/starry night narração.html';
    }
  });
})();
