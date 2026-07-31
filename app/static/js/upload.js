/* Resumate — dashboard upload / drag-drop */
(function () {
  "use strict";

  var input = document.getElementById("upload-input");
  var drop = document.getElementById("upload-drop");
  var submit = document.querySelector(".upload-submit");
  var titleInput = document.querySelector(".upload-title-input");
  var tplSelect = document.querySelector(".upload-tpl-select");
  var form = document.querySelector(".upload-form");
  var panel = document.getElementById("upload-panel");
  if (!panel) return;

  var dropError = document.getElementById("upload-drop-error");
  var allowed = { ".pdf": 1, ".docx": 1, ".txt": 1, ".tex": 1 };
  var dragDepth = 0;
  var maxBytes = 10 * 1024 * 1024;

  function showPanel(e) {
    if (e) e.preventDefault();
    panel.classList.add("visible");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (drop) drop.focus();
  }

  function setDropError(msg) {
    if (!dropError) return;
    if (!msg) {
      dropError.hidden = true;
      dropError.textContent = "";
      if (drop) drop.classList.remove("has-error");
      return;
    }
    dropError.hidden = false;
    dropError.textContent = msg;
    if (drop) drop.classList.add("has-error");
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function acceptFile(f) {
    if (!f || !drop || !submit) return;
    var ext = ("." + (f.name.split(".").pop() || "")).toLowerCase();
    if (!allowed[ext]) {
      setDropError("Unsupported type. Use PDF, DOCX, TXT, or TEX.");
      return;
    }
    if (f.size > maxBytes) {
      setDropError("File too large (max 10 MB).");
      return;
    }
    setDropError("");
    var isTex = ext === ".tex";
    drop.classList.add("has-file");
    drop.classList.remove("drag-over", "drag-active");
    drop.querySelector(".upload-drop-text").textContent = f.name;
    drop.querySelector(".upload-drop-hint").textContent =
      formatSize(f.size) + (isTex ? " · ready to import" : " · will convert via AI");
    submit.disabled = false;
    submit.textContent = isTex ? "Import .tex" : "Convert with AI";
    if (tplSelect) tplSelect.style.display = isTex ? "none" : "";
    if (titleInput && (titleInput.value === "Uploaded Resume" || !titleInput.dataset.touched)) {
      titleInput.value = f.name.replace(/\.[^.]+$/, "");
    }
    panel.classList.add("visible");
  }

  ["home-upload-btn", "home-empty-upload"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", showPanel);
  });
  document.querySelectorAll(".upload-btn").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      showPanel();
    });
  });

  if (input) {
    input.addEventListener("change", function () {
      if (input.files.length > 0) acceptFile(input.files[0]);
    });
  }
  if (titleInput) {
    titleInput.addEventListener("input", function () {
      titleInput.dataset.touched = "1";
    });
  }

  if (form && submit && drop) {
    form.addEventListener("submit", function () {
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span> Working…';
      drop.classList.add("is-busy");
    });
  }

  if (drop && input) {
    drop.addEventListener("dragenter", function (e) {
      e.preventDefault();
      dragDepth += 1;
      drop.classList.add("drag-over", "drag-active");
    });
    drop.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    drop.addEventListener("dragleave", function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) drop.classList.remove("drag-over", "drag-active");
    });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      dragDepth = 0;
      drop.classList.remove("drag-over", "drag-active");
      if (e.dataTransfer.files.length > 0) {
        try {
          var dt = new DataTransfer();
          dt.items.add(e.dataTransfer.files[0]);
          input.files = dt.files;
        } catch (err) { /* DataTransfer unsupported */ }
        acceptFile(e.dataTransfer.files[0]);
        if (!input.files || !input.files.length) {
          setDropError("Select the file again to confirm upload.");
          input.click();
        }
      }
    });
    drop.addEventListener("click", function () {
      input.click();
    });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
  }

  var pageDrag = 0;
  window.addEventListener("dragenter", function (e) {
    if (!e.dataTransfer || !e.dataTransfer.types) return;
    if ([].indexOf.call(e.dataTransfer.types, "Files") === -1) return;
    pageDrag += 1;
    document.body.classList.add("page-dragging");
    panel.classList.add("visible");
  });
  window.addEventListener("dragleave", function () {
    pageDrag = Math.max(0, pageDrag - 1);
    if (pageDrag === 0) document.body.classList.remove("page-dragging");
  });
  window.addEventListener("drop", function () {
    pageDrag = 0;
    document.body.classList.remove("page-dragging");
  });
})();
