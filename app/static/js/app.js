/* Resumate — app.js */
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

  var resumeId = cmEl.getAttribute("data-resume-id");
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

  var saveTimer;
  editor.on("change", function () {
    if (ignoreChange) return;
    setDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  });

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

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* ── Save (serialized, always writes latest content) ─────── */
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
      var body = new FormData();
      body.append("latex_content", latest);
      return fetch("/resume/" + resumeId + "/save", { method: "POST", body: body })
        .then(function (r) {
          if (!r.ok) throw new Error("bad");
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
  window.resumateSave = save;

  /* ── Title rename ────────────────────────────────────────── */
  var titleInput = document.getElementById("resume-title");
  var titleTimer = null;
  if (titleInput) {
    var lastTitle = titleInput.value;
    function saveTitle() {
      var t = titleInput.value.trim() || "Untitled Resume";
      if (t === lastTitle) return;
      var fd = new FormData();
      fd.append("title", t);
      fetch("/resume/" + resumeId + "/title", { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) {
            lastTitle = d.title || t;
            titleInput.value = lastTitle;
            document.title = lastTitle + " — Resumate";
            setStatus("Renamed", "saved", 1200);
          }
        })
        .catch(function () {
          showToast("Failed to rename", "error");
        });
    }
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

  /* ── Focus mode ──────────────────────────────────────────── */
  var focusBtn = document.getElementById("focus-toggle");
  var LS_FOCUS = "resumate-focus";
  function applyFocus(on) {
    document.body.classList.toggle("focus-mode", !!on);
    if (focusBtn) focusBtn.setAttribute("aria-pressed", on ? "true" : "false");
    localStorage.setItem(LS_FOCUS, on ? "1" : "0");
    editor.refresh();
  }
  if (localStorage.getItem(LS_FOCUS) === "1") applyFocus(true);
  if (focusBtn) {
    focusBtn.addEventListener("click", function () {
      applyFocus(!document.body.classList.contains("focus-mode"));
    });
  }

  /* ── Compile ─────────────────────────────────────────────── */
  var compiling = false;
  var pdfRenderToken = 0;

  function setPreviewLoading(on) {
    var el = document.getElementById("pdf-container");
    if (el) el.classList.toggle("is-loading", !!on);
  }

  function flashPreview() {
    var pane = document.getElementById("preview-pane");
    if (!pane) return;
    pane.classList.remove("is-fresh");
    // force reflow so the animation can replay
    void pane.offsetWidth;
    pane.classList.add("is-fresh");
    setTimeout(function () { pane.classList.remove("is-fresh"); }, 900);
  }

  function compile(opts) {
    opts = opts || {};
    if (compiling) return;
    compiling = true;

    var btn = document.getElementById("compile-btn");
    var orig = "Compile";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
    }
    setStatus("Compiling…", "compiling");
    setPreviewLoading(true);

    var fd = new FormData();
    fd.append("latex_content", editor.getValue());

    save().then(function () {
      return fetch("/resume/" + resumeId + "/compile", { method: "POST", body: fd });
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        clearErrorMarks();
        clearErrorLines();
        if (d.success) {
          var url = "/resume/" + resumeId + "/pdf?t=" + Date.now();
          setStatus(d.pages ? "Ready · " + d.pages + "p" : "Ready", "saved", 2400);
          var pc = document.getElementById("page-count");
          if (pc) pc.textContent = d.pages ? d.pages + (d.pages === 1 ? " page" : " pages") : "";
          var ph = document.getElementById("pdf-placeholder");
          if (ph) ph.style.display = "none";
          var ep = document.getElementById("error-panel");
          if (ep) ep.remove();
          var dl = document.getElementById("download-pdf-btn");
          if (dl) dl.classList.remove("is-hidden");
          flashPreview();
          renderPDF(url);
        } else {
          setPreviewLoading(false);
          if (d.errors && d.errors.length) markErrorLines(d.errors);
          setStatus("compile failed", "error", 5000);
          if (!opts.quiet) showToast("Compilation failed", "error");
          var pane = document.getElementById("preview-pane");
          var ep2 = document.getElementById("error-panel");
          if (!ep2 && pane) {
            ep2 = document.createElement("div");
            ep2.id = "error-panel";
            pane.appendChild(ep2);
          }
          if (ep2) {
            ep2.innerHTML = '<div class="error-panel">' + esc(d.error) +
              (d.hint ? '<div class="error-hint">' + esc(d.hint) + "</div>" : "") +
              "</div>";
          }
        }
      })
      .catch(function () {
        setPreviewLoading(false);
        setStatus("Request failed", "error", 4000);
        showToast("Request failed", "error");
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = orig;
        }
        compiling = false;
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
            canvas.title = "Click to jump to source";
            var ctx = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            container.appendChild(canvas);

            canvas.addEventListener("click", function (e) {
              if (!synctexData || !synctexData.pages) return;
              var rect = canvas.getBoundingClientRect();
              var pdfX = ((e.clientX - rect.left) / rect.width) * pageSize.width;
              var pdfY = ((e.clientY - rect.top) / rect.height) * pageSize.height;
              var hits = synctexData.pages[String(pageNum)] || synctexData.pages[pageNum];
              if (!hits || !hits.length) return;
              var best = null;
              var bestDist = Infinity;
              for (var j = 0; j < hits.length; j++) {
                var h = hits[j];
                if (!h.line) continue;
                var d = Math.abs(pdfX - h.x) + Math.abs(pdfY - h.y) * 1.5;
                if (d < bestDist) { bestDist = d; best = h; }
              }
              if (best && bestDist <= 110) jumpToLine(best.line);
            });

            page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
              pending -= 1;
              if (pending <= 0 && token === pdfRenderToken) setPreviewLoading(false);
            });
          });
        })(i);
      }

      fetch("/resume/" + resumeId + "/synctex")
        .then(function (r) { return r.json(); })
        .then(function (d) { if (token === pdfRenderToken) synctexData = d; })
        .catch(function () { synctexData = null; });
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
    var paneH = edPane.getBoundingClientRect().height;
    var minH = 220;
    var maxH = Math.max(minH, paneH - 140);
    px = Math.max(minH, Math.min(maxH, Math.round(px)));
    aiPanel.style.height = px + "px";
    try { localStorage.setItem(LS_AI, String(px)); } catch (e) {}
    editor.refresh();
    return px;
  }

  (function restoreSizes() {
    var savedPct = parseFloat(localStorage.getItem(LS_SPLIT) || "");
    if (!isNaN(savedPct)) applySplitPct(savedPct);
    var savedAi = parseFloat(localStorage.getItem(LS_AI) || "");
    // Old saves often crushed the thread to ~20px — bump tiny values to the default.
    if (!isNaN(savedAi) && savedAi >= 220) applyAiHeight(savedAi);
    else applyAiHeight(260);
  })();

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

  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (aiInput) aiInput.focus();
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      applyFocus(!document.body.classList.contains("focus-mode"));
    }
  });

  (function autoRenderExisting() {
    var url = "/resume/" + resumeId + "/pdf?t=" + Date.now();
    fetch(url, { method: "HEAD" })
      .then(function (r) {
        if (r.ok && document.getElementById("pdf-pages")) {
          var ph = document.getElementById("pdf-placeholder");
          if (ph) ph.style.display = "none";
          setPreviewLoading(true);
          renderPDF(url);
        }
      })
      .catch(function () {});
  })();

  /* ── AI ──────────────────────────────────────────────────── */
  var aiThread = document.getElementById("ai-thread");
  var aiInput = document.getElementById("ai-input");
  var aiSend = document.getElementById("ai-send");
  var aiCount = document.getElementById("ai-msg-count");
  var aiRoleInput = document.getElementById("ai-target-role");

  function updateCount() {
    if (!aiCount || !aiThread) return;
    var n = aiThread.querySelectorAll(".ai-msg").length;
    aiCount.textContent = n ? String(n) : "";
  }
  updateCount();

  function clearEmptyState() {
    if (!aiThread) return;
    var empty = aiThread.querySelector(".ai-empty-state");
    if (empty) empty.remove();
  }

  function addMsg(role, text) {
    if (!aiThread) return;
    clearEmptyState();
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg-" + role;
    div.innerHTML = '<div class="ai-msg-head"><div class="ai-msg-role">' +
      (role === "user" ? "You" : "AI") +
      '</div></div><div class="ai-msg-text">' + esc(text) + "</div>";
    aiThread.appendChild(div);
    aiThread.scrollTop = aiThread.scrollHeight;
    updateCount();
    return div;
  }

  document.querySelectorAll(".ai-quick-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var prompt = btn.getAttribute("data-prompt");
      if (aiInput && prompt) {
        aiInput.value = prompt;
        sendAI();
      }
    });
  });

  if (aiSend && aiInput) {
    aiSend.addEventListener("click", function () { sendAI(); });
    aiInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAI();
      }
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
      compile({ quiet: true });
    });
    head.appendChild(btn);
    requestAnimationFrame(function () {
      last.scrollIntoView({ block: "nearest" });
    });
  }

  function sendAI() {
    var prompt = aiInput.value.trim();
    if (!prompt) return;

    var role = aiRoleInput ? aiRoleInput.value.trim() : "";
    var fullPrompt = role ? "[Target role: " + role + "] " + prompt : prompt;

    addMsg("user", prompt);
    aiInput.value = "";
    aiSend.disabled = true;
    aiSend.textContent = "…";

    var thinking = document.createElement("div");
    thinking.className = "ai-msg ai-msg-assistant ai-msg-thinking";
    thinking.innerHTML = '<div class="ai-msg-head"><div class="ai-msg-role">AI</div></div><div class="ai-msg-text"><span class="spinner"></span> Editing…</div>';
    clearEmptyState();
    aiThread.appendChild(thinking);
    aiThread.scrollTop = aiThread.scrollHeight;

    var fd = new FormData();
    fd.append("prompt", fullPrompt);

    fetch("/resume/" + resumeId + "/ai", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        thinking.remove();
        if (d.success && d.latex_content) {
          var snapshot = applyAI(d.latex_content);
          addMsg("assistant", d.ai_reply || "Updated.");
          if (snapshot !== null) attachRevertButton(snapshot);
          compile({ quiet: true });
        } else {
          addMsg("assistant", d.error || "Request failed");
          showToast(d.error || "AI request failed", "error");
        }
      })
      .catch(function () {
        thinking.remove();
        addMsg("assistant", "Request failed");
        showToast("AI request failed", "error");
      })
      .then(function () {
        aiSend.disabled = false;
        aiSend.textContent = "Send";
        updateCount();
      });
  }

  window.clearChat = function () {
    if (!confirm("Clear chat history?")) return;
    fetch("/resume/" + resumeId + "/clear-chat", { method: "POST" })
      .then(function () {
        if (aiThread) {
          aiThread.innerHTML = '<div class="ai-empty-state"><div class="ai-empty-text">Describe an edit. Structure and LaTeX commands stay intact.</div><div class="ai-empty-hint">Shortcuts above, or type a specific request</div></div>';
        }
        updateCount();
      });
  };
})();
