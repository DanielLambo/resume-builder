/* Resumate — app.js
 * Browser-owned resumes: all resume data (latex, title, chat, versions)
 * lives in IndexedDB via window.ResumateStore. The server only exposes
 * stateless endpoints (/api/compile, /api/ai, /api/ats, /api/section-at).
 */
(function () {
  "use strict";

  window.showToast = function (msg, type, ms) {
    type = type || "info";
    ms = ms || 3200;
    var c = document.getElementById("toasts");
    if (!c) return;
    var t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () {
      t.classList.add("leaving");
      setTimeout(function () { t.remove(); }, 220);
    }, ms);
  };

  var cmEl = document.getElementById("latex-editor");
  if (!cmEl) return;

  function parseResumeId() {
    var m = /\/edit\/([^/?#]+)/.exec(window.location.pathname);
    if (!m || !m[1]) return null;
    try {
      var id = decodeURIComponent(m[1]).trim();
      return id || null;
    } catch (e) {
      return null;
    }
  }

  var resumeId = parseResumeId();
  if (!resumeId || !window.ResumateStore) {
    window.location.replace("/");
    return;
  }
  var Store = window.ResumateStore;
  var resumeRow = null; // populated once loaded from IndexedDB
  var chatHistory = []; // working copy, synced to Store on every AI turn

  var dirtyDot = document.getElementById("dirty-dot");
  var pill = document.getElementById("status-pill");
  var pillHideTimer = null;
  var ignoreChange = false;

  var editor = CodeMirror.fromTextArea(cmEl, {
    mode: "stex",
    theme: "default",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    readOnly: "nocursor",
    extraKeys: {
      "Ctrl-S": function () { save(); },
      "Cmd-S": function () { save(); },
      "Ctrl-Enter": function () { compile(); },
      "Cmd-Enter": function () { compile(); },
      Tab: function (cm) { cm.replaceSelection("  ", "end"); },
    },
  });
  editor.setSize("100%", "100%");

  var cursorEl = document.getElementById("cursor-pos");
  editor.on("cursorActivity", function () {
    if (!cursorEl) return;
    var p = editor.getCursor();
    cursorEl.textContent = (p.line + 1) + ":" + (p.ch + 1);
  });

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function setDirty(on) {
    if (dirtyDot) dirtyDot.hidden = !on;
  }

  function setStatus(text, kind, holdMs) {
    if (!pill) return;
    clearTimeout(pillHideTimer);
    if (!text) {
      pill.className = "status-pill";
      pill.textContent = "";
      return;
    }
    pill.className = "status-pill visible" + (kind ? " " + kind : "");
    pill.textContent = text;
    if (holdMs) {
      pillHideTimer = setTimeout(function () { pill.className = "status-pill"; }, holdMs);
    }
  }

  var compileBtn = document.getElementById("compile-btn");
  var titleInput = document.getElementById("resume-title");
  var downloadPdfBtn = document.getElementById("download-pdf-btn");
  var downloadTexBtn = document.getElementById("download-tex-btn");
  if (downloadPdfBtn) downloadPdfBtn.classList.add("is-hidden");

  function setEditingDisabled(disabled) {
    editor.setOption("readOnly", disabled ? "nocursor" : false);
    [compileBtn, titleInput].forEach(function (el) {
      if (el) el.disabled = disabled;
    });
    if (downloadTexBtn) downloadTexBtn.classList.toggle("is-disabled", disabled);
  }

  /* ── Save (local, IndexedDB — no server round-trip) ───────── */
  var saveChain = Promise.resolve();
  var lastSaved = editor.getValue();
  setDirty(false);

  function save() {
    var content = editor.getValue();
    if (content === lastSaved) {
      setDirty(false);
      return saveChain;
    }
    setStatus("Saving…");
    saveChain = saveChain.then(function () {
      var latest = editor.getValue();
      if (latest === lastSaved) {
        setDirty(false);
        return;
      }
      return Store.saveLatex(resumeId, latest)
        .then(function () {
          lastSaved = latest;
          setDirty(false);
          setStatus("Saved", "saved", 1400);
        })
        .catch(function () {
          setStatus("Save failed", "error", 4000);
          showToast("Failed to save", "error");
        });
    });
    return saveChain;
  }

  var saveTimer;
  var liveTimer;
  var liveCompileEl = document.getElementById("live-compile");
  editor.on("change", function () {
    if (ignoreChange) return;
    setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
    clearTimeout(liveTimer);
    if (liveCompileEl && liveCompileEl.checked) {
      liveTimer = setTimeout(function () { compile({ quiet: true, autoFit: true }); }, 2200);
    }
  });
  if (liveCompileEl) {
    try {
      var savedLive = localStorage.getItem("resumate-live");
      if (savedLive === "0") liveCompileEl.checked = false;
    } catch (e) {}
    liveCompileEl.addEventListener("change", function () {
      try { localStorage.setItem("resumate-live", liveCompileEl.checked ? "1" : "0"); } catch (e) {}
    });
  }

  /* ── Title rename ────────────────────────────────────────── */
  var titleTimer = null;
  var lastTitle = titleInput ? titleInput.value : "";
  function saveTitle() {
    if (!titleInput) return;
    var t = titleInput.value.trim() || "Untitled Resume";
    if (t === lastTitle) return;
    Store.saveTitle(resumeId, t)
      .then(function (row) {
        lastTitle = row.title;
        titleInput.value = lastTitle;
        document.title = lastTitle + " — Resumate";
        setStatus("Renamed", "saved", 1200);
      })
      .catch(function () {
        showToast("Failed to rename", "error");
      });
  }
  if (titleInput) {
    titleInput.addEventListener("input", function () {
      clearTimeout(titleTimer);
      titleTimer = setTimeout(saveTitle, 700);
    });
    titleInput.addEventListener("blur", saveTitle);
    titleInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        titleInput.blur();
      }
    });
  }

  /* ── Dual mode: Vibe (AI-first) / Code (source-first) ─────── */
  var sourcePeekBtn = document.getElementById("source-peek-btn");
  var currentMode = "vibe";
  var editScope = null; // { type: "section"|"selection", label: string }

  function setShowSource(on) {
    document.body.classList.toggle("show-source", !!on);
    if (sourcePeekBtn) {
      sourcePeekBtn.textContent = on ? "Hide source" : "Show source";
      sourcePeekBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    requestAnimationFrame(function () { editor.refresh(); });
  }

  function applyMode(mode) {
    currentMode = mode === "code" ? "code" : "vibe";
    document.body.classList.toggle("vibe-mode", currentMode === "vibe");
    document.body.classList.toggle("code-mode", currentMode === "code");
    var vibeBtn = document.getElementById("mode-vibe");
    var codeBtn = document.getElementById("mode-code");
    if (vibeBtn) vibeBtn.classList.toggle("is-active", currentMode === "vibe");
    if (codeBtn) codeBtn.classList.toggle("is-active", currentMode === "code");
    var label = document.getElementById("pane-mode-label");
    if (label) label.textContent = currentMode === "vibe" ? "Vibe" : "Source";
    if (sourcePeekBtn) sourcePeekBtn.hidden = currentMode !== "vibe";
    if (currentMode === "code") {
      document.body.classList.remove("show-source");
      var panel = document.getElementById("ai-panel");
      if (panel) panel.style.height = "";
    } else if (!document.body.classList.contains("show-source")) {
      var panel2 = document.getElementById("ai-panel");
      if (panel2) panel2.style.height = "";
    }
    try { localStorage.setItem("resumate-mode", currentMode); } catch (e) {}
    requestAnimationFrame(function () { editor.refresh(); });
  }

  var startMode = "vibe";
  try { startMode = localStorage.getItem("resumate-mode") || "vibe"; } catch (e) {}
  applyMode(startMode);
  try {
    if (startMode === "vibe" && localStorage.getItem("resumate-show-source") === "1") {
      setShowSource(true);
    }
  } catch (e) {}

  document.querySelectorAll(".mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyMode(btn.getAttribute("data-mode"));
      if (currentMode === "vibe") {
        var input = document.getElementById("ai-input");
        if (input) setTimeout(function () { input.focus(); }, 30);
      } else {
        editor.focus();
      }
    });
  });

  /* ── Compile ─────────────────────────────────────────────── */
  var compiling = false;
  var pendingCompile = null;
  var pdfRenderToken = 0;
  var compileRail = document.getElementById("compile-progress");
  var lastPdfBlobUrl = null;

  function setCompileProgress(stage) {
    if (!compileRail) return;
    if (!stage) {
      compileRail.hidden = true;
      compileRail.removeAttribute("data-stage");
      compileRail.style.setProperty("--progress", "0%");
      return;
    }
    compileRail.hidden = false;
    compileRail.setAttribute("data-stage", stage);
    var map = { saving: "28%", compiling: "62%", rendering: "88%", done: "100%", error: "100%" };
    compileRail.style.setProperty("--progress", map[stage] || "40%");
    var label = document.getElementById("compile-progress-label");
    if (label) {
      var text = {
        saving: "Saving…",
        compiling: "Running pdflatex…",
        rendering: "Rendering preview…",
        done: "Ready",
        error: "Compile failed",
      };
      label.textContent = text[stage] || "Working…";
    }
  }

  function setPreviewLoading(on) {
    var el = document.getElementById("pdf-container");
    if (el) el.classList.toggle("is-loading", !!on);
  }

  function flashPreview() {
    var pane = document.getElementById("preview-pane");
    if (!pane) return;
    pane.classList.remove("is-fresh");
    void pane.offsetWidth;
    pane.classList.add("is-fresh");
    setTimeout(function () { pane.classList.remove("is-fresh"); }, 900);
  }

  function base64ToBlob(b64, mime) {
    var chars = atob(b64);
    var bytes = new Uint8Array(chars.length);
    for (var i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function filenameFor(ext) {
    var t = (titleInput && titleInput.value.trim()) || (resumeRow && resumeRow.title) || "resume";
    var safe = t.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "-") || "resume";
    return safe + "." + ext;
  }

  function triggerDownload(url, filename) {
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!lastPdfBlobUrl) {
        showToast("Compile first to download a PDF", "info");
        return;
      }
      triggerDownload(lastPdfBlobUrl, filenameFor("pdf"));
    });
  }
  if (downloadTexBtn) {
    downloadTexBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (downloadTexBtn.classList.contains("is-disabled") || !resumeRow) return;
      var blob = new Blob([editor.getValue()], { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      triggerDownload(url, filenameFor("tex"));
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });
  }

  function renderPdfFromBase64(b64) {
    if (!b64) {
      setPreviewLoading(false);
      return;
    }
    var blob = base64ToBlob(b64, "application/pdf");
    if (lastPdfBlobUrl) URL.revokeObjectURL(lastPdfBlobUrl);
    lastPdfBlobUrl = URL.createObjectURL(blob);
    if (downloadPdfBtn) downloadPdfBtn.classList.remove("is-hidden");
    renderPDF(lastPdfBlobUrl);
  }

  function compile(opts) {
    opts = opts || {};
    if (!resumeRow) return; // ignore until initial load completes
    if (compiling) {
      pendingCompile = opts;
      return;
    }
    compiling = true;

    var btn = compileBtn;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-light"></span> Compiling';
    }
    setStatus("Compiling…", "compiling");
    setPreviewLoading(true);
    setCompileProgress("saving");

    var content = editor.getValue();
    var fd = new FormData();
    fd.append("latex_content", content);
    fd.append("job_id", resumeId);
    if (opts.autoFit) fd.append("auto_fit", "1");

    save().then(function () {
      setCompileProgress("compiling");
      return fetch("/api/compile", { method: "POST", body: fd });
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        clearErrorMarks();
        clearErrorLines();
        if (d.success) {
          setCompileProgress("rendering");
          if (d.latex_content && d.latex_content !== editor.getValue()) {
            ignoreChange = true;
            editor.setValue(d.latex_content);
            ignoreChange = false;
            lastSaved = d.latex_content;
            Store.saveLatex(resumeId, d.latex_content).catch(function () {});
          }
          synctexData = d.synctex || null;
          var fitNote = d.auto_fit_level ? " · auto-fit" : "";
          setStatus((d.pages ? "Ready · " + d.pages + "p" : "Ready") + fitNote, "saved", 2400);
          var pc = document.getElementById("page-count");
          if (pc) {
            pc.textContent = d.pages ? d.pages + (d.pages === 1 ? " page" : " pages") : "";
            pc.classList.toggle("is-warn", !!(d.pages && d.pages > 1));
          }
          var ph = document.getElementById("pdf-placeholder");
          if (ph) ph.style.display = "none";
          var ep = document.getElementById("error-panel");
          if (ep) ep.remove();
          flashPreview();
          renderPdfFromBase64(d.pdf_base64);
          setCompileProgress("done");
          setTimeout(function () { setCompileProgress(null); }, 700);
          if (d.pages && d.pages > 1 && !opts.autoFit && !opts.quiet) {
            showToast("Over 1 page — try One page or keep Live auto-fit on", "info");
          }
        } else {
          setPreviewLoading(false);
          setCompileProgress("error");
          if (d.errors && d.errors.length) markErrorLines(d.errors);
          setStatus("Compile failed", "error", 5000);
          if (!opts.quiet) showToast("Compilation failed", "error");
          var pane = document.getElementById("preview-pane");
          var ep2 = document.getElementById("error-panel");
          if (!ep2 && pane) {
            ep2 = document.createElement("div");
            ep2.id = "error-panel";
            pane.appendChild(ep2);
          }
          if (ep2) {
            ep2.innerHTML =
              '<div class="error-panel">' +
              '<div class="error-panel-head"><span>LaTeX error</span>' +
              '<button type="button" class="error-dismiss" id="error-dismiss" aria-label="Dismiss">×</button></div>' +
              '<div class="error-panel-body">' + esc(d.error) + "</div>" +
              (d.hint ? '<div class="error-hint">' + esc(d.hint) + "</div>" : "") +
              '<div class="error-actions">' +
              '<button type="button" class="btn btn-sm btn-primary fix-ai-btn" id="fix-ai-btn">Fix with AI</button>' +
              '<button type="button" class="btn btn-sm" id="retry-compile-btn">Retry</button>' +
              "</div></div>";
            var fixBtn = document.getElementById("fix-ai-btn");
            if (fixBtn) {
              fixBtn.addEventListener("click", function () {
                applyMode("vibe");
                if (aiInput) {
                  aiInput.value =
                    "Fix this LaTeX compile error without inventing content: " +
                    (d.error || "").slice(0, 400);
                  sendAI();
                }
              });
            }
            var retryBtn = document.getElementById("retry-compile-btn");
            if (retryBtn) retryBtn.addEventListener("click", function () { compile({ quiet: false }); });
            var dismiss = document.getElementById("error-dismiss");
            if (dismiss) dismiss.addEventListener("click", function () { ep2.remove(); });
          }
          setTimeout(function () { setCompileProgress(null); }, 1600);
        }
      })
      .catch(function () {
        setPreviewLoading(false);
        setCompileProgress("error");
        setStatus("Request failed", "error", 4000);
        showToast("Request failed", "error");
        setTimeout(function () { setCompileProgress(null); }, 1200);
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Compile <kbd class="kbd">⌘⏎</kbd>';
        }
        compiling = false;
        if (pendingCompile) {
          var next = pendingCompile;
          pendingCompile = null;
          compile(next);
        }
      });
  }
  window.resumateCompile = compile;

  /* ── PDF.js ──────────────────────────────────────────────── */
  var synctexData = null;
  var errorMarks = [];
  var syncFlash = null;

  function clearErrorMarks() {
    for (var i = 0; i < errorMarks.length; i++) errorMarks[i].clear();
    errorMarks = [];
  }

  function clearErrorLines() {
    for (var i = 0; i <= editor.lastLine(); i++) {
      editor.setGutterMarker(i, "CodeMirror-linenumber", null);
    }
  }

  function markErrorLines(errors) {
    clearErrorLines();
    if (!errors || !errors.length) return;
    for (var i = 0; i < errors.length; i++) {
      var e = errors[i];
      if (!e.line || e.line <= 0) continue;
      var lineIdx = Math.min(e.line - 1, editor.lastLine());
      var lineContent = editor.getLine(lineIdx);
      if (lineContent && lineContent.length > 0) {
        errorMarks.push(editor.markText(
          { line: lineIdx, ch: 0 },
          { line: lineIdx, ch: lineContent.length },
          { className: "cm-error-squiggly", attributes: { title: e.message } }
        ));
      }
      editor.setGutterMarker(lineIdx, "CodeMirror-linenumber", (function (msg) {
        var span = document.createElement("div");
        span.className = "cm-error-gutter";
        span.title = msg;
        span.textContent = "!";
        return span;
      })(e.message));
    }
  }

  function jumpToLine(lineNum) {
    var lineIdx = Math.max(0, Math.min(editor.lastLine(), lineNum - 1));
    editor.setCursor(lineIdx, 0);
    editor.scrollIntoView({ line: lineIdx, ch: 0 }, 80);
    editor.focus();
    if (syncFlash) syncFlash.clear();
    var lineContent = editor.getLine(lineIdx) || "";
    syncFlash = editor.markText(
      { line: lineIdx, ch: 0 },
      { line: lineIdx, ch: lineContent.length },
      { className: "cm-sync-flash" }
    );
    setTimeout(function () {
      if (syncFlash) { syncFlash.clear(); syncFlash = null; }
    }, 1800);
  }

  function renderPDF(url) {
    var container = document.getElementById("pdf-pages");
    if (!container) return;
    if (typeof pdfjsLib === "undefined") {
      setPreviewLoading(false);
      showToast("PDF viewer not loaded", "error");
      return;
    }

    var token = ++pdfRenderToken;
    container.innerHTML = "";

    pdfjsLib.getDocument(url).promise.then(function (pdf) {
      if (token !== pdfRenderToken) return;
      var scale = 1.5;
      var pending = pdf.numPages;
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (pageNum) {
          pdf.getPage(pageNum).then(function (page) {
            if (token !== pdfRenderToken) return;
            var viewport = page.getViewport({ scale: scale });
            var pageSize = page.getViewport({ scale: 1 });
            var canvas = document.createElement("canvas");
            canvas.className = "pdf-page";
            canvas.setAttribute("data-page", pageNum);
            canvas.title = "Click to edit this section with AI";
            var ctx = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            container.appendChild(canvas);

            canvas.addEventListener("click", function (e) {
              if (!synctexData || !synctexData.pages) {
                showToast("Compile once to enable click-to-edit on the PDF", "info", 2400);
                return;
              }
              var rect = canvas.getBoundingClientRect();
              var pdfX = ((e.clientX - rect.left) / rect.width) * pageSize.width;
              var pdfY = ((e.clientY - rect.top) / rect.height) * pageSize.height;
              var hits = synctexData.pages[String(pageNum)] || synctexData.pages[pageNum];
              if (!hits || !hits.length) {
                showToast("Couldn’t map that spot — try clicking a heading or bullet", "info", 2200);
                return;
              }
              var best = null;
              var bestDist = Infinity;
              for (var j = 0; j < hits.length; j++) {
                var h = hits[j];
                if (!h.line) continue;
                var d = Math.abs(pdfX - h.x) + Math.abs(pdfY - h.y) * 1.5;
                if (d < bestDist) { bestDist = d; best = h; }
              }
              if (best && bestDist <= 110) {
                jumpToLine(best.line);
                promptSectionEdit(best.line);
              } else {
                showToast("Couldn’t map that spot — try clicking a heading or bullet", "info", 2200);
              }
            });
            page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
              pending -= 1;
              if (pending <= 0 && token === pdfRenderToken) setPreviewLoading(false);
            });
          });
        })(i);
      }
    }).catch(function (err) {
      console.error("PDF render error:", err);
      setPreviewLoading(false);
      showToast("Failed to render PDF", "error");
    });
  }

  /* ── Resizable panes ─────────────────────────────────────── */
  var LS_SPLIT = "resumate.splitPct";
  var LS_AI = "resumate.aiHeight";
  var divider = document.getElementById("editor-divider");
  var aiDivider = document.getElementById("ai-divider");
  var edPane = document.getElementById("editor-pane");
  var pvPane = document.getElementById("preview-pane");
  var aiPanel = document.getElementById("ai-panel");
  var split = document.querySelector(".editor-split");
  var overlay = document.getElementById("split-overlay");
  var resizeTarget = null;

  function isStackedSplit() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function applySplitPct(pct) {
    pct = Math.max(20, Math.min(80, pct));
    if (isStackedSplit()) {
      edPane.style.flex = "none";
      edPane.style.width = "";
      edPane.style.height = pct + "%";
      pvPane.style.flex = "1";
      pvPane.style.height = "";
      pvPane.style.width = "";
    } else {
      edPane.style.flex = "none";
      edPane.style.height = "";
      edPane.style.width = pct + "%";
      pvPane.style.flex = "1";
      pvPane.style.width = "";
      pvPane.style.height = "";
    }
    try { localStorage.setItem(LS_SPLIT, String(Math.round(pct * 10) / 10)); } catch (e) {}
    return pct;
  }

  function applyAiHeight(px) {
    if (!aiPanel) return px;
    if (currentMode === "vibe" && !document.body.classList.contains("show-source")) {
      aiPanel.style.height = "";
      return px;
    }
    var paneH = edPane.getBoundingClientRect().height;
    var minH = currentMode === "code" ? 120 : 220;
    var maxH = Math.max(minH, paneH - (currentMode === "code" ? 80 : 140));
    px = Math.max(minH, Math.min(maxH, Math.round(px)));
    aiPanel.style.height = px + "px";
    try { localStorage.setItem(LS_AI, String(px)); } catch (e) {}
    editor.refresh();
    return px;
  }

  (function restoreSizes() {
    var savedPct = parseFloat(localStorage.getItem(LS_SPLIT) || "");
    if (!isNaN(savedPct)) applySplitPct(savedPct);
    else if (currentMode === "vibe") applySplitPct(isStackedSplit() ? 38 : 42);
    if (currentMode === "vibe" && document.body.classList.contains("show-source")) {
      var savedAi = parseFloat(localStorage.getItem(LS_AI) || "");
      if (!isNaN(savedAi) && savedAi >= 220) applyAiHeight(savedAi);
      else applyAiHeight(280);
    } else if (aiPanel) {
      aiPanel.style.height = "";
    }
  })();

  if (sourcePeekBtn) {
    sourcePeekBtn.addEventListener("click", function () {
      var next = !document.body.classList.contains("show-source");
      setShowSource(next);
      try { localStorage.setItem("resumate-show-source", next ? "1" : "0"); } catch (e) {}
      if (next) {
        var savedAi = parseFloat(localStorage.getItem(LS_AI) || "");
        if (!isNaN(savedAi) && savedAi >= 220) applyAiHeight(savedAi);
        else applyAiHeight(280);
      } else if (aiPanel) {
        aiPanel.style.height = "";
      }
    });
  }

  function beginResize(target, handle, cursor) {
    resizeTarget = target;
    handle.classList.add("dragging");
    document.body.classList.add("is-resizing");
    document.body.style.cursor = cursor;
    if (overlay) {
      overlay.style.display = "block";
      overlay.style.cursor = cursor;
    }
  }

  function endResize() {
    if (!resizeTarget) return;
    resizeTarget = null;
    if (divider) divider.classList.remove("dragging");
    if (aiDivider) aiDivider.classList.remove("dragging");
    document.body.classList.remove("is-resizing");
    document.body.style.cursor = "";
    if (overlay) {
      overlay.style.display = "none";
      overlay.style.cursor = "";
    }
    editor.refresh();
  }

  if (divider) {
    divider.addEventListener("mousedown", function (e) {
      e.preventDefault();
      beginResize("split", divider, isStackedSplit() ? "row-resize" : "col-resize");
    });
  }
  if (aiDivider) {
    aiDivider.addEventListener("mousedown", function (e) {
      e.preventDefault();
      beginResize("ai", aiDivider, "row-resize");
    });
  }

  document.addEventListener("mousemove", function (e) {
    if (!resizeTarget) return;
    if (resizeTarget === "split") {
      var rect = split.getBoundingClientRect();
      applySplitPct(isStackedSplit()
        ? ((e.clientY - rect.top) / rect.height) * 100
        : ((e.clientX - rect.left) / rect.width) * 100);
    } else if (resizeTarget === "ai") {
      applyAiHeight(edPane.getBoundingClientRect().bottom - e.clientY);
    }
  });
  document.addEventListener("mouseup", endResize);
  window.addEventListener("resize", function () {
    var savedPct = parseFloat(localStorage.getItem(LS_SPLIT) || "50");
    if (!isNaN(savedPct)) applySplitPct(savedPct);
    var savedAi = parseFloat(localStorage.getItem(LS_AI) || "");
    if (!isNaN(savedAi)) applyAiHeight(savedAi);
    else editor.refresh();
  });

  /* ── Drop .tex onto editor ───────────────────────────────── */
  (function setupEditorDrop() {
    var pane = document.getElementById("editor-pane");
    var overlayEl = document.getElementById("editor-drop-overlay");
    if (!pane || !overlayEl) return;
    var depth = 0;

    function isTexFile(f) {
      return f && /\.tex$/i.test(f.name || "");
    }

    pane.addEventListener("dragenter", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      var hasFiles = false;
      for (var i = 0; i < e.dataTransfer.types.length; i++) {
        if (e.dataTransfer.types[i] === "Files") hasFiles = true;
      }
      if (!hasFiles) return;
      e.preventDefault();
      depth += 1;
      overlayEl.hidden = false;
      pane.classList.add("is-drop-target");
    });
    pane.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    pane.addEventListener("dragleave", function () {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        overlayEl.hidden = true;
        pane.classList.remove("is-drop-target");
      }
    });
    pane.addEventListener("drop", function (e) {
      e.preventDefault();
      depth = 0;
      overlayEl.hidden = true;
      pane.classList.remove("is-drop-target");
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!isTexFile(file)) {
        showToast("Drop a .tex file to replace source", "error");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast("File too large (max 10 MB)", "error");
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || "");
        if (text.indexOf("\\documentclass") === -1) {
          showToast("File doesn’t look like valid LaTeX", "error");
          return;
        }
        if (!confirm("Replace the current LaTeX source with “" + file.name + "”?")) return;
        ignoreChange = true;
        editor.setValue(text);
        ignoreChange = false;
        lastSaved = null;
        setDirty(true);
        setStatus("Imported .tex", "saved", 1800);
        showToast("Source replaced — compiling…", "info");
        compile({ quiet: false, autoFit: true });
      };
      reader.onerror = function () { showToast("Could not read file", "error"); };
      reader.readAsText(file);
    });
  })();

  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (aiInput) aiInput.focus();
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      applyMode(document.body.classList.contains("vibe-mode") ? "code" : "vibe");
    }
  });

  /* ── AI ──────────────────────────────────────────────────── */
  var aiThread = document.getElementById("ai-thread");
  var aiInput = document.getElementById("ai-input");
  var aiSend = document.getElementById("ai-send");
  var aiCount = document.getElementById("ai-msg-count");
  var aiRoleInput = document.getElementById("ai-target-role");
  var aiJd = document.getElementById("ai-jd");
  var aiInsights = document.getElementById("ai-insights");
  var aiContext = document.getElementById("ai-context");
  var aiContextToggle = document.getElementById("ai-context-toggle");
  var aiScopeEl = document.getElementById("ai-scope");
  var aiScopeChip = document.getElementById("ai-scope-chip");
  var aiScopeClear = document.getElementById("ai-scope-clear");
  var aiBusy = false;

  var QUICK_PROMPTS = {
    bullets: null, // special: prep the composer for a notes paste
    polish: "Polish the wording throughout: clearer, tighter, and more professional. Keep facts and structure the same.",
    humanize: "Humanize the tone so it sounds like a real person wrote it — less corporate filler, still professional.",
    verbs: "Strengthen action verbs on experience bullets. Keep meaning and metrics intact.",
    metrics: "Add honest, plausible metrics where bullets are vague. Do not invent fake employers or titles.",
    summary: "Rewrite the professional summary to be sharper and more specific. Keep it concise.",
    onepage: "Tighten spacing and wording so the resume fits cleanly on one page without cutting important content.",
    tailor: "Tailor this resume to the pasted job description: mirror relevant keywords and emphasize matching experience. Do not invent experience.",
  };

  if (aiSend) aiSend.disabled = true;
  if (aiInput) aiInput.disabled = true;

  function setAiBusy(busy) {
    aiBusy = !!busy;
    if (aiSend) {
      aiSend.disabled = aiBusy || !resumeRow;
      aiSend.textContent = aiBusy ? "…" : "Send";
    }
    document.querySelectorAll(".ai-quick-btn").forEach(function (b) {
      b.disabled = aiBusy;
    });
  }

  function updateContextToggle() {
    if (!aiContextToggle) return;
    var role = aiRoleInput && aiRoleInput.value.trim();
    var jd = aiJd && aiJd.value.trim();
    var open = aiContext && !aiContext.hidden;
    aiContextToggle.classList.toggle("is-active", !!(open || role || jd));
    aiContextToggle.setAttribute("aria-expanded", open ? "true" : "false");
    aiContextToggle.textContent = (role || jd) ? "Context ●" : "Context";
  }

  function setEditScope(scope) {
    editScope = scope;
    if (!aiScopeEl || !aiScopeChip) return;
    if (!scope) {
      aiScopeEl.hidden = true;
      aiScopeChip.textContent = "";
      return;
    }
    aiScopeChip.textContent = scope.label;
    aiScopeEl.hidden = false;
  }

  function promptSectionEdit(lineNum) {
    var fd = new FormData();
    fd.append("latex_content", editor.getValue());
    fd.append("line", lineNum);
    fetch("/api/section-at", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        applyMode("vibe");
        var section = (d.section || "").trim() || "this section";
        setEditScope({ type: "section", label: section });
        if (aiInput) {
          aiInput.value = "";
          aiInput.placeholder = "What should change in " + section + "?";
          aiInput.focus();
        }
        showToast("Scoped to “" + section + "” — describe the edit", "info", 2600);
      })
      .catch(function () {});
  }

  if (aiScopeClear) {
    aiScopeClear.addEventListener("click", function () {
      setEditScope(null);
      if (aiInput) aiInput.placeholder = "Paste what you did at the job — or ask for an edit";
    });
  }

  if (aiContextToggle && aiContext) {
    aiContextToggle.addEventListener("click", function () {
      aiContext.hidden = !aiContext.hidden;
      updateContextToggle();
      if (!aiContext.hidden && aiJd) aiJd.focus();
    });
  }
  if (aiRoleInput) aiRoleInput.addEventListener("input", updateContextToggle);
  if (aiJd) aiJd.addEventListener("input", updateContextToggle);
  updateContextToggle();

  function updateCount() {
    if (!aiCount || !aiThread) return;
    var n = aiThread.querySelectorAll(".ai-msg:not(.ai-msg-thinking)").length;
    aiCount.textContent = n ? String(n) : "";
    var empty = aiThread.querySelector(".ai-empty-state");
    aiThread.classList.toggle("is-empty", !!empty || n === 0);
  }

  function clearEmptyState() {
    if (!aiThread) return;
    var empty = aiThread.querySelector(".ai-empty-state");
    if (empty) empty.remove();
  }

  function emptyStateHtml() {
    return '<div class="ai-empty-state">' +
      '<div class="ai-empty-text">Paste what you did in a role — get sharp resume bullets back.</div>' +
      '<div class="ai-empty-hint">Bullets shortcut · click PDF to target a section · ⌘⇧A to focus</div>' +
      "</div>";
  }

  function addMsg(role, text, meta) {
    if (!aiThread) return;
    clearEmptyState();
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg-" + role + (role === "error" ? " ai-msg-assistant ai-msg-error" : "");
    var roleLabel = role === "user" ? "You" : role === "error" ? "Error" : "AI";
    var metaHtml = meta ? '<div class="ai-msg-meta">' + esc(meta) + "</div>" : "";
    div.innerHTML = '<div class="ai-msg-head"><div class="ai-msg-role">' + roleLabel +
      '</div></div><div class="ai-msg-text">' + esc(text) + "</div>" + metaHtml;
    aiThread.appendChild(div);
    aiThread.scrollTop = aiThread.scrollHeight;
    updateCount();
    return div;
  }

  function pushChat(role, text, meta) {
    addMsg(role, text, meta);
    if (role === "user" || role === "assistant") {
      chatHistory.push({ role: role, content: text });
      if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
    }
  }

  function renderChatHistory() {
    if (!aiThread) return;
    aiThread.innerHTML = "";
    if (!chatHistory.length) {
      aiThread.innerHTML = emptyStateHtml();
    } else {
      chatHistory.forEach(function (msg) {
        addMsg(msg.role === "user" ? "user" : "assistant", msg.content);
      });
    }
    updateCount();
  }

  document.querySelectorAll(".ai-quick-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (aiBusy || !resumeRow) return;
      var action = btn.getAttribute("data-action");
      if (action === "bullets") {
        applyMode("vibe");
        if (!editScope) setEditScope({ type: "section", label: "Experience" });
        if (aiInput) {
          var existing = aiInput.value.trim();
          if (existing.length >= 160) {
            aiInput.value =
              "Turn these work notes into resume bullets for my job. Replace that role's bullets; keep employer, title, and dates.\n\n" +
              existing;
            sendAI();
            return;
          }
          aiInput.value = "Turn these work notes into resume bullets for my job:\n\n";
          aiInput.focus();
          aiInput.setSelectionRange(aiInput.value.length, aiInput.value.length);
          aiInput.dispatchEvent(new Event("input"));
        }
        showToast("Paste your job notes, then Send", "info", 2800);
        return;
      }
      var prompt = QUICK_PROMPTS[action];
      if (!prompt) return;
      if (btn.getAttribute("data-needs-jd") === "1") {
        if (!aiJd || !aiJd.value.trim()) {
          if (aiContext) aiContext.hidden = false;
          updateContextToggle();
          showToast("Paste a job description in Context first", "error");
          if (aiJd) aiJd.focus();
          return;
        }
      }
      if (aiInput) aiInput.value = prompt;
      sendAI();
    });
  });

  if (aiInput) {
    aiInput.addEventListener("paste", function () {
      setTimeout(function () {
        var v = aiInput.value || "";
        if (v.length < 200) return;
        var looksLikeNotes =
          v.split("\n").length >= 3 ||
          /\b(i |i'm |i’ve |i've |my |responsible|worked on|built |led )\b/i.test(v);
        if (!looksLikeNotes && v.length < 280) return;
        if (!editScope) setEditScope({ type: "section", label: "Experience" });
        showToast("Notes detected — Send to turn them into job bullets", "info", 2800);
      }, 0);
    });
  }

  var atsBtn = document.getElementById("ats-check-btn");
  if (atsBtn) {
    atsBtn.addEventListener("click", function () {
      if (!aiInsights || !resumeRow) return;
      atsBtn.disabled = true;
      atsBtn.textContent = "…";
      var fd = new FormData();
      fd.append("latex_content", editor.getValue());
      fetch("/api/ats", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var lines = ["ATS score: " + d.score + "/100"];
          if (d.risks && d.risks.length) lines.push("Risks: " + d.risks.join("; "));
          if (d.metric_nudges && d.metric_nudges.length) {
            lines.push(d.metric_nudges.length + " bullets lack numbers — try Metrics.");
          }
          aiInsights.hidden = false;
          aiInsights.innerHTML = "<strong>ATS check</strong><div>" + esc(lines.join("\n")) + "</div>";
        })
        .catch(function () {
          showToast("ATS check failed", "error");
        })
        .then(function () {
          atsBtn.disabled = false;
          atsBtn.textContent = "ATS";
        });
    });
  }

  /* ── Versions drawer ───────────────────────────────────────── */
  var versionsDrawer = document.getElementById("versions-drawer");
  var versionsBtn = document.getElementById("versions-btn");
  var versionsList = document.getElementById("versions-list");
  var versionsClose = document.getElementById("versions-close");

  function setVersionsOpen(open) {
    if (!versionsDrawer) return;
    versionsDrawer.hidden = !open;
    if (versionsBtn) {
      versionsBtn.classList.toggle("is-open", open);
      versionsBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function formatVersionWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    try {
      return d.toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function loadVersions() {
    if (!versionsList) return;
    versionsList.innerHTML = "<p class='versions-empty'>Loading…</p>";
    Store.getResume(resumeId)
      .then(function (row) {
        var vs = (row && row.versions) || [];
        if (!vs.length) {
          versionsList.innerHTML =
            "<p class='versions-empty'>No snapshots yet. They appear after AI edits — Restore brings that version back.</p>";
          return;
        }
        versionsList.innerHTML = vs.map(function (v) {
          return '<div class="version-row"><span>' + esc(v.label || "snapshot") +
            "<small>" + esc(formatVersionWhen(v.createdAt)) + "</small></span>" +
            '<button type="button" class="btn btn-sm" data-vid="' + esc(v.id) + '">Restore</button></div>';
        }).join("");
        versionsList.querySelectorAll("button[data-vid]").forEach(function (b) {
          b.addEventListener("click", function () {
            b.disabled = true;
            b.textContent = "…";
            Store.restoreVersion(resumeId, b.getAttribute("data-vid"))
              .then(function (row) {
                ignoreChange = true;
                editor.setValue(row.latex || "");
                ignoreChange = false;
                lastSaved = row.latex || "";
                setDirty(false);
                showToast("Restored snapshot", "info");
                compile({ quiet: true });
                setVersionsOpen(false);
              })
              .catch(function () {
                showToast("Restore failed", "error");
                b.disabled = false;
                b.textContent = "Restore";
              });
          });
        });
      })
      .catch(function () {
        versionsList.innerHTML = "<p class='versions-empty'>Couldn’t load history. Try again.</p>";
      });
  }

  if (versionsBtn) {
    versionsBtn.setAttribute("aria-expanded", "false");
    versionsBtn.setAttribute("aria-controls", "versions-drawer");
    versionsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!versionsDrawer) return;
      var open = versionsDrawer.hidden;
      setVersionsOpen(open);
      if (open) loadVersions();
    });
  }
  if (versionsClose) {
    versionsClose.addEventListener("click", function () {
      setVersionsOpen(false);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && versionsDrawer && !versionsDrawer.hidden) {
      setVersionsOpen(false);
    }
  });
  document.addEventListener("click", function (e) {
    if (!versionsDrawer || versionsDrawer.hidden) return;
    if (versionsDrawer.contains(e.target)) return;
    if (versionsBtn && versionsBtn.contains(e.target)) return;
    setVersionsOpen(false);
  });

  if (aiSend && aiInput) {
    aiSend.addEventListener("click", function () { sendAI(); });
    aiInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAI();
      }
    });
    aiInput.addEventListener("input", function () {
      aiInput.style.height = "auto";
      var next = Math.min(110, Math.max(currentMode === "code" ? 38 : 44, aiInput.scrollHeight));
      aiInput.style.height = next + "px";
    });
  }

  function applyAI(latexContent) {
    if (latexContent === editor.getValue()) return null;
    var prev = editor.getValue();
    ignoreChange = true;
    editor.replaceRange(
      latexContent,
      { line: 0, ch: 0 },
      { line: editor.lineCount(), ch: 0 }
    );
    ignoreChange = false;
    lastSaved = null; // force save on next compile chain
    setDirty(true);
    return prev;
  }

  function attachRevertButton(snapshot) {
    if (!aiThread || snapshot == null) return;
    var last = aiThread.lastElementChild;
    if (!last || !last.classList.contains("ai-msg-assistant")) return;
    if (last.querySelector(".ai-revert-btn")) return;
    var head = last.querySelector(".ai-msg-head");
    if (!head) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-revert-btn";
    btn.textContent = "Revert";
    btn.addEventListener("click", function () {
      ignoreChange = true;
      editor.replaceRange(
        snapshot,
        { line: 0, ch: 0 },
        { line: editor.lineCount(), ch: 0 }
      );
      ignoreChange = false;
      lastSaved = null;
      setDirty(true);
      btn.remove();
      save();
      compile({ quiet: true });
    });
    head.appendChild(btn);
    requestAnimationFrame(function () {
      last.scrollIntoView({ block: "nearest" });
    });
  }

  function sendAI() {
    if (!resumeRow || aiBusy) return;
    var prompt = aiInput.value.trim();
    if (!prompt) return;

    // Large pasted work notes without an instruction → treat as bulletize
    var lineCount = prompt.split(/\n/).length;
    var looksLikeNotes =
      prompt.length >= 280 ||
      (lineCount >= 4 && prompt.length >= 160) ||
      (/\b(i |i'm |i’ve |i've |my responsibilities|worked on)\b/i.test(prompt) && prompt.length >= 180);
    var hasInstruction = /turn (these|this|the following)|bulletize|make bullets|convert /i.test(prompt);
    if (looksLikeNotes && !hasInstruction) {
      prompt =
        "Turn these work notes into resume bullets for my job. Replace that role's bullets; keep employer, title, and dates.\n\n" +
        prompt;
      if (!editScope) setEditScope({ type: "section", label: "Experience" });
    }

    var role = aiRoleInput ? aiRoleInput.value.trim() : "";
    var jd = aiJd ? aiJd.value.trim() : "";
    var fullPrompt = prompt;
    var metaBits = [];

    if (editScope && editScope.type === "section") {
      fullPrompt =
        "Edit ONLY the " + editScope.label + " section. Do not change other sections.\n\n" +
        fullPrompt;
      metaBits.push("section: " + editScope.label);
    }

    if (jd) {
      fullPrompt = "[Job description]\n" + jd.slice(0, 4500) + "\n[/Job description]\n" + fullPrompt;
      metaBits.push("with JD");
    }
    if (role) {
      fullPrompt = "[Target role: " + role + "] " + fullPrompt;
      metaBits.push("role: " + role);
    }

    var sel = editor.getSelection();
    if ((!editScope || editScope.type !== "section") && sel && sel.trim().length > 12 && sel.length < 2000) {
      fullPrompt += "\n\nFocus ONLY on this selected fragment (keep surrounding structure):\n" + sel.trim();
      metaBits.push("selection");
    }

    var bubble = prompt;
    if (looksLikeNotes) {
      bubble = "Convert work notes → bullets" + (prompt.length > 80 ? " (" + prompt.length + " chars)" : "");
    }

    var beforeLatex = editor.getValue();
    var historyForRequest = chatHistory.slice(-8);

    pushChat("user", bubble, metaBits.length ? metaBits.join(" · ") : "");
    Store.saveChat(resumeId, chatHistory).catch(function () {});

    aiInput.value = "";
    aiInput.style.height = "";
    setAiBusy(true);

    var thinking = document.createElement("div");
    thinking.className = "ai-msg ai-msg-assistant ai-msg-thinking";
    thinking.innerHTML = '<div class="ai-msg-head"><div class="ai-msg-role">AI</div></div><div class="ai-msg-text"><span class="spinner"></span> Editing…</div>';
    clearEmptyState();
    aiThread.appendChild(thinking);
    aiThread.scrollTop = aiThread.scrollHeight;

    var fd = new FormData();
    fd.append("latex_content", beforeLatex);
    fd.append("prompt", fullPrompt);
    fd.append("history", JSON.stringify(historyForRequest));

    fetch("/api/ai", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        thinking.remove();
        if (d.success && d.latex_content) {
          var snapshot = applyAI(d.latex_content);
          pushChat("assistant", d.ai_reply || "Updated.");
          Store.saveChat(resumeId, chatHistory).catch(function () {});
          if (snapshot !== null) {
            Store.snapshot(resumeId, beforeLatex, prompt.slice(0, 80)).catch(function () {});
            attachRevertButton(snapshot);
          }
          save();
          compile({ quiet: true });
        } else {
          pushChat("error", d.error || "Request failed");
          showToast(d.error || "AI request failed", "error");
        }
      })
      .catch(function () {
        thinking.remove();
        pushChat("error", "Request failed");
        showToast("AI request failed", "error");
      })
      .then(function () {
        setAiBusy(false);
        updateCount();
        if (aiInput) aiInput.focus();
      });
  }

  window.clearChat = function () {
    if (!confirm("Clear chat history?")) return;
    chatHistory = [];
    Store.saveChat(resumeId, [])
      .then(function () {
        if (aiThread) aiThread.innerHTML = emptyStateHtml();
        setEditScope(null);
        updateCount();
      })
      .catch(function () {
        showToast("Failed to clear chat", "error");
      });
  };

  /* ── Initial load from IndexedDB ───────────────────────────── */
  setEditingDisabled(true);
  setStatus("Loading…");
  Store.getResume(resumeId)
    .then(function (row) {
      if (!row) {
        window.location.replace("/");
        return;
      }
      resumeRow = row;
      ignoreChange = true;
      editor.setValue(row.latex || "");
      ignoreChange = false;
      lastSaved = row.latex || "";
      setDirty(false);

      if (titleInput) {
        titleInput.value = row.title || "Untitled Resume";
        lastTitle = titleInput.value;
      }
      document.title = (row.title || "Untitled Resume") + " — Resumate";

      chatHistory = Array.isArray(row.chatHistory) ? row.chatHistory.slice() : [];
      renderChatHistory();

      setEditingDisabled(false);
      setAiBusy(false);
      setStatus(null);
      editor.refresh();
      var p = editor.getCursor();
      if (cursorEl) cursorEl.textContent = (p.line + 1) + ":" + (p.ch + 1);
    })
    .catch(function () {
      window.location.replace("/");
    });
})();
