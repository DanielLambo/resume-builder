/* Resumate — dashboard / gallery (browser-owned library) */
(function () {
  "use strict";

  var Store = window.ResumateStore;
  if (!Store) return;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return iso.slice(0, 10);
    }
  }

  async function createFromTemplate(templateId, title) {
    var tid = templateId == null ? "" : String(templateId);
    var resp = await fetch("/api/templates/" + encodeURIComponent(tid));
    if (!resp.ok) throw new Error("Template not found");
    var tpl = await resp.json();
    var row = await Store.createResume({
      title: title || "My Resume",
      latex: tpl.latex_content || "",
    });
    window.location.href = "/edit/" + encodeURIComponent(row.id);
  }

  function wireCreateForms() {
    document.querySelectorAll("form[data-create-template]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var tid = form.querySelector('[name="template_id"]');
        var title = form.querySelector('[name="title"]');
        var btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Opening…";
        }
        createFromTemplate(
          tid ? tid.value : null,
          title ? title.value : "My Resume"
        ).catch(function (err) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Try again";
          }
          if (window.showToast) window.showToast(err.message || "Could not create resume", "error");
          else alert(err.message || "Could not create resume");
        });
      });
    });
  }

  async function renderLibrary() {
    var list = document.getElementById("resume-library-list");
    var empty = document.getElementById("home-empty");
    var library = document.getElementById("home-library");
    if (!list) return;

    var rows = await Store.listResumes();
    list.innerHTML = "";

    if (!rows.length) {
      if (library) library.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }

    if (library) library.hidden = false;
    if (empty) empty.hidden = true;

    rows.forEach(function (r) {
      var card = document.createElement("article");
      card.className = "resume-card";
      card.innerHTML =
        '<div class="resume-card-main">' +
        '<div class="resume-card-icon" aria-hidden="true"></div>' +
        "<div>" +
        "<h3>" + esc(r.title || "Untitled") + "</h3>" +
        '<p class="resume-meta">' + esc(fmtDate(r.updatedAt)) + " · saved in this browser</p>" +
        "</div></div>" +
        '<div class="resume-card-actions">' +
        '<a class="btn btn-primary btn-sm" href="/edit/' + encodeURIComponent(r.id) + '">Open</a>' +
        '<button type="button" class="btn-danger-text" data-delete="' + esc(r.id) + '">Delete</button>' +
        "</div>";
      list.appendChild(card);
    });

    list.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete");
        if (!confirm("Delete this resume from this browser?")) return;
        Store.deleteResume(id).then(renderLibrary);
      });
    });
  }

  function wireUpload() {
    var form = document.querySelector(".upload-form");
    if (!form) return;
    form.setAttribute("action", "#");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("upload-input");
      var titleInput = form.querySelector(".upload-title-input");
      var tplSelect = form.querySelector(".upload-tpl-select");
      var submit = form.querySelector(".upload-submit");
      if (!input || !input.files || !input.files[0]) return;

      var fd = new FormData();
      fd.append("file", input.files[0]);
      fd.append("title", titleInput ? titleInput.value : "Uploaded Resume");
      if (tplSelect) fd.append("template_id", tplSelect.value);

      if (submit) {
        submit.disabled = true;
        submit.innerHTML = '<span class="spinner"></span> Working…';
      }

      fetch("/api/convert", { method: "POST", body: fd })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.d.success) {
            throw new Error((res.d && res.d.error) || "Upload failed");
          }
          return Store.createResume({
            title: res.d.title || "Uploaded Resume",
            latex: res.d.latex_content || "",
          });
        })
        .then(function (row) {
          window.location.href = "/edit/" + encodeURIComponent(row.id);
        })
        .catch(function (err) {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "Import";
          }
          if (window.showToast) window.showToast(err.message || "Upload failed", "error");
          else alert(err.message || "Upload failed");
        });
    });
  }

  wireCreateForms();
  wireUpload();
  if (document.getElementById("resume-library-list")) {
    renderLibrary().catch(function () {});
  }
})();
