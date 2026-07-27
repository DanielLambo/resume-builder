/* Resumate — app.js */
(function () {
  "use strict";

  /* ── Toasts ─────────────────────────────────────────────── */
  window.showToast = function (msg, type, ms) {
    type = type || "info";
    ms = ms || 3500;
    var c = document.getElementById("toasts");
    if (!c) return;
    var t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () {
      t.classList.add("leaving");
      setTimeout(function () { t.remove(); }, 250);
    }, ms);
  };

  /* ── Editor (only on editor page) ───────────────────────── */
  var cmEl = document.getElementById("latex-editor");
  if (!cmEl) return;

  var resumeId = cmEl.getAttribute("data-resume-id");

  var editor = CodeMirror.fromTextArea(cmEl, {
    mode: "stex",
    theme: "material-darker",
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
    cursorEl.textContent = "Ln " + (p.line + 1) + ", Col " + (p.ch + 1);
  });

  var saveTimer;
  editor.on("change", function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2000);
  });

  /* ── Save ────────────────────────────────────────────────── */
  var saving = false;
  function save() {
    if (saving) return;
    saving = true;
    var pill = document.getElementById("status-pill");
    pill.className = "status-pill visible";
    pill.innerHTML = '<span class="spinner"></span> Saving...';

    var fd = new FormData();
    fd.append("latex_content", editor.getValue());

    fetch("/resume/" + resumeId + "/save", { method: "POST", body: fd })
      .then(function (r) {
        if (!r.ok) throw new Error("bad");
        pill.className = "status-pill visible saved";
        pill.textContent = "Saved";
        setTimeout(function () { pill.className = "status-pill"; }, 2000);
      })
      .catch(function () {
        pill.className = "status-pill visible error";
        pill.textContent = "Save failed";
        showToast("Failed to save", "error");
      })
      .then(function () { saving = false; });
  }
  window.resumateSave = save;

  /* ── Compile ─────────────────────────────────────────────── */
  var compiling = false;
  function compile() {
    if (compiling) return;
    compiling = true;

    var btn = document.getElementById("compile-btn");
    var pill = document.getElementById("status-pill");
    var orig = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Compiling';
    pill.className = "status-pill visible compiling";
    pill.textContent = "Compiling...";

    var content = editor.getValue();
    var fd = new FormData();
    fd.append("latex_content", content);

    fetch("/resume/" + resumeId + "/save", { method: "POST", body: new URLSearchParams({latex_content: content}).toString(), headers: {"Content-Type": "application/x-www-form-urlencoded"} })
      .then(function () {
        return fetch("/resume/" + resumeId + "/compile", { method: "POST", body: fd });
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        clearErrorMarks();
        clearErrorLines();
        if (d.success) {
          var url = "/resume/" + resumeId + "/pdf?t=" + Date.now();
          pill.className = "status-pill visible saved";
          var pg = d.pages ? " (" + d.pages + " page" + (d.pages > 1 ? "s" : "") + ")" : "";
          pill.textContent = "Compiled" + pg;
          showToast("PDF compiled" + pg, "success");
          setTimeout(function () { pill.className = "status-pill"; }, 3000);
          var pc = document.getElementById("page-count");
          if (pc) pc.textContent = d.pages ? d.pages + " page" + (d.pages > 1 ? "s" : "") : "";
          var ph = document.getElementById("pdf-placeholder");
          if (ph) ph.style.display = "none";
          var ep = document.getElementById("error-panel");
          if (ep) ep.remove();
          setTimeout(function () { try { renderPDF(url); } catch (e) { console.error(e); } }, 50);
        } else {
          if (d.errors && d.errors.length) {
            markErrorLines(d.errors);
          }
          pill.className = "status-pill visible error";
          pill.textContent = "Error";
          showToast("Compilation failed", "error");
          var ep = document.getElementById("error-panel");
          if (!ep) {
            ep = document.createElement("div");
            ep.id = "error-panel";
            document.getElementById("preview-pane").appendChild(ep);
          }
          ep.innerHTML = '<div class="error-panel">' + esc(d.error) +
            (d.hint ? '<div class="error-hint">' + esc(d.hint) + "</div>" : "") +
            "</div>";
        }
      })
      .catch(function () {
        pill.className = "status-pill visible error";
        pill.textContent = "Error";
        showToast("Request failed", "error");
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = orig;
        compiling = false;
      });
  }
  window.resumateCompile = compile;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  /* ── PDF.js rendering ────────────────────────────────────── */
  var synctexData = null;
  var errorMarks = [];

  function clearErrorMarks() {
    for (var i = 0; i < errorMarks.length; i++) {
      errorMarks[i].clear();
    }
    errorMarks = [];
  }

  function markErrorLines(errors) {
    clearErrorLines();
    if (!errors || !errors.length) return;
    for (var i = 0; i < errors.length; i++) {
      var e = errors[i];
      if (e.line && e.line > 0) {
        var lineIdx = Math.min(e.line - 1, editor.lastLine());
        var lineContent = editor.getLine(lineIdx);
        if (lineContent && lineContent.length > 0) {
          var mark = editor.markText(
            { line: lineIdx, ch: 0 },
            { line: lineIdx, ch: lineContent.length },
            { className: "cm-error-squiggly", attributes: { title: e.message } }
          );
          errorMarks.push(mark);
        }
        editor.setGutterMarker(lineIdx, "CodeMirror-linenumber", (function(msg) {
          var span = document.createElement("div");
          span.className = "cm-error-gutter";
          span.title = msg;
          span.textContent = "!";
          return span;
        })(e.message));
      }
    }
  }

  function clearErrorLines() {
    for (var i = 0; i <= editor.lastLine(); i++) {
      editor.setGutterMarker(i, "CodeMirror-linenumber", null);
    }
  }

  function renderPDF(url) {
    var container = document.getElementById("pdf-pages");
    if (!container) return;
    container.innerHTML = "";

    if (typeof pdfjsLib === "undefined") {
      showToast("PDF viewer not loaded yet", "error");
      return;
    }

    pdfjsLib.getDocument(url).promise.then(function (pdf) {
      var scale = 1.5;
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (pageNum) {
          pdf.getPage(pageNum).then(function (page) {
            var viewport = page.getViewport({ scale: scale });
            var canvas = document.createElement("canvas");
            canvas.className = "pdf-page";
            canvas.setAttribute("data-page", pageNum);
            var ctx = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            container.appendChild(canvas);

            canvas.addEventListener("click", function (e) {
              if (!synctexData || !synctexData.pages) return;
              var rect = canvas.getBoundingClientRect();
              var cssX = e.clientX - rect.left;
              var cssY = e.clientY - rect.top;
              var pdfX = cssX * (viewport.width / rect.width);
              var pdfY = (rect.height - cssY) * (viewport.height / rect.height);
              var hits = synctexData.pages[String(pageNum)];
              if (!hits || !hits.length) return;
              var best = null;
              var bestDist = Infinity;
              for (var j = 0; j < hits.length; j++) {
                var h = hits[j];
                var d = Math.abs(pdfX - h.x) + Math.abs(pdfY - h.y);
                if (d < bestDist) {
                  bestDist = d;
                  best = h;
                }
              }
              if (best && best.line) {
                var lineIdx = Math.max(0, best.line - 1);
                editor.setCursor(lineIdx, 0);
                editor.scrollIntoView({ line: lineIdx, ch: 0 }, 100);
                editor.focus();
              }
            });

            page.render({ canvasContext: ctx, viewport: viewport });
          });
        })(i);
      }

      fetch("/resume/" + resumeId + "/synctex")
        .then(function (r) { return r.json(); })
        .then(function (d) { synctexData = d; })
        .catch(function () { synctexData = null; });
    }).catch(function (err) {
      console.error("PDF render error:", err);
      showToast("Failed to render PDF", "error");
    });
  }

  /* ── Split pane drag ─────────────────────────────────────── */
  var divider = document.getElementById("editor-divider");
  var edPane = document.getElementById("editor-pane");
  var pvPane = document.getElementById("preview-pane");
  var split = document.querySelector(".editor-split");
  var overlay = document.getElementById("split-overlay");
  var dragging = false;

  divider.addEventListener("mousedown", function (e) {
    e.preventDefault();
    dragging = true;
    divider.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.body.style.pointerEvents = "none";
    if (overlay) overlay.style.display = "block";
  });

  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var rect = split.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var pct = (x / rect.width) * 100;
    pct = Math.max(25, Math.min(75, pct));
    edPane.style.flex = "none";
    edPane.style.width = pct + "%";
    pvPane.style.flex = "1";
  });

  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.body.style.pointerEvents = "";
    if (overlay) overlay.style.display = "none";
    editor.refresh();
  });

  /* ── Global shortcuts ────────────────────────────────────── */
  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      var inp = document.getElementById("ai-input");
      if (inp) inp.focus();
    }
  });

  /* ── AI Chat ─────────────────────────────────────────────── */
  var aiThread = document.getElementById("ai-thread");
  var aiInput = document.getElementById("ai-input");
  var aiSend = document.getElementById("ai-send");
  var aiCount = document.getElementById("ai-msg-count");
  var aiRoleInput = document.getElementById("ai-target-role");

  var THINKING_PHRASES = [
    "Percolating on that one...",
    "Stroking my beard thoughtfully...",
    "Consulting the resume gods...",
    "Channeling inner recruiter energy...",
    "Polishing imaginary spectacles...",
    "Flipping through mental rolodex...",
    "Adjusting monocle, reading closely...",
    "Summoning ATS optimization spirits...",
    "Muttering action verbs under breath...",
    "Counting quantifiable achievements...",
    "Rearranging bullet points telepathically...",
    "Downloading hiring manager brainwaves...",
    "Debugging your career narrative...",
    "Injecting STAR method ruthlessly...",
    "Removing filler words with extreme prejudice...",
    "Calculating resume-to-interview odds...",
    "Running on recruiter neural pathways...",
    "Warming up the thesaurus engine...",
    "Cross-referencing with 100K resumes...",
    "Applying laser-focused edits...",
  ];

  var thinkingInterval = null;

  function startThinking(el) {
    var idx = Math.floor(Math.random() * THINKING_PHRASES.length);
    el.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-text"><span class="spinner"></span> <span class="thinking-text">' + THINKING_PHRASES[idx] + '</span></div>';
    aiThread.scrollTop = aiThread.scrollHeight;
    thinkingInterval = setInterval(function () {
      idx = (idx + 1) % THINKING_PHRASES.length;
      var textEl = el.querySelector(".thinking-text");
      if (textEl) {
        textEl.style.opacity = "0";
        setTimeout(function () {
          textEl.textContent = THINKING_PHRASES[idx];
          textEl.style.opacity = "1";
        }, 180);
      }
      aiThread.scrollTop = aiThread.scrollHeight;
    }, 2200);
  }

  function stopThinking() {
    if (thinkingInterval) { clearInterval(thinkingInterval); thinkingInterval = null; }
  }

  function updateCount() {
    var n = aiThread ? aiThread.children.length : 0;
    if (aiCount) aiCount.textContent = n > 0 ? n + " messages" : "";
  }
  updateCount();

  function addMsg(role, text) {
    if (!aiThread) return;
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg-" + role;
    div.innerHTML = '<div class="ai-msg-role">' + (role === "user" ? "You" : "AI") +
      '</div><div class="ai-msg-text">' + esc(text) + "</div>";
    aiThread.appendChild(div);
    aiThread.scrollTop = aiThread.scrollHeight;
    updateCount();
  }

  /* ── Quick actions ────────────────────────────────────────── */
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

  function sendAI() {
    var prompt = aiInput.value.trim();
    if (!prompt) return;

    var role = aiRoleInput ? aiRoleInput.value.trim() : "";
    var fullPrompt = prompt;
    if (role) fullPrompt = "[Target role: " + role + "] " + prompt;

    addMsg("user", prompt);
    aiInput.value = "";
    aiSend.disabled = true;
    aiSend.textContent = "...";

    var thinking = document.createElement("div");
    thinking.className = "ai-msg ai-msg-assistant ai-msg-thinking";
    startThinking(thinking);
    aiThread.appendChild(thinking);
    aiThread.scrollTop = aiThread.scrollHeight;

    var fd = new FormData();
    fd.append("prompt", fullPrompt);

    fetch("/resume/" + resumeId + "/ai", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        stopThinking();
        thinking.remove();
        if (d.success && d.latex_content) {
          editor.setValue(d.latex_content);
          addMsg("assistant", d.ai_reply || "Updated your resume.");
          showToast("AI updated your resume", "success");
          compile();
        } else {
          addMsg("assistant", "Error: " + (d.error || "request failed"));
          showToast(d.error || "AI request failed", "error");
        }
      })
      .catch(function () {
        stopThinking();
        thinking.remove();
        addMsg("assistant", "Error: request failed");
        showToast("AI request failed", "error");
      })
      .then(function () {
        aiSend.disabled = false;
        aiSend.textContent = "Ask AI";
      });
  }

  window.clearChat = function () {
    if (!confirm("Clear chat history?")) return;
    fetch("/resume/" + resumeId + "/clear-chat", { method: "POST" })
      .then(function () {
        if (aiThread) aiThread.innerHTML = "";
        updateCount();
        showToast("Chat cleared", "info");
      });
  };
})();
