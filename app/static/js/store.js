/* Resumate — browser-owned resume library (IndexedDB). Nothing personal is stored on the server. */
(function (global) {
  "use strict";

  var DB_NAME = "resumate";
  var DB_VERSION = 1;
  var STORE = "resumes";
  var VERSION_LIMIT = 20;

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  async function listResumes() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).getAll();
      req.onsuccess = function () {
        var rows = req.result || [];
        rows.sort(function (a, b) {
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        });
        resolve(rows);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function getResume(id) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function putResume(resume) {
    var db = await openDb();
    var row = Object.assign({}, resume, { updatedAt: now() });
    if (!row.createdAt) row.createdAt = row.updatedAt;
    if (!Array.isArray(row.chatHistory)) row.chatHistory = [];
    if (!Array.isArray(row.versions)) row.versions = [];
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    await txDone(tx);
    return row;
  }

  async function createResume(opts) {
    opts = opts || {};
    var row = {
      id: uuid(),
      title: (opts.title || "Untitled Resume").slice(0, 120),
      latex: opts.latex || "",
      chatHistory: [],
      versions: [],
      createdAt: now(),
      updatedAt: now(),
    };
    return putResume(row);
  }

  async function deleteResume(id) {
    var db = await openDb();
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  }

  async function saveLatex(id, latex) {
    var row = await getResume(id);
    if (!row) throw new Error("Resume not found");
    row.latex = latex;
    return putResume(row);
  }

  async function saveTitle(id, title) {
    var row = await getResume(id);
    if (!row) throw new Error("Resume not found");
    row.title = (title || "Untitled Resume").slice(0, 120);
    return putResume(row);
  }

  async function saveChat(id, history) {
    var row = await getResume(id);
    if (!row) throw new Error("Resume not found");
    row.chatHistory = (history || []).slice(-40);
    return putResume(row);
  }

  async function snapshot(id, latex, label) {
    var row = await getResume(id);
    if (!row) throw new Error("Resume not found");
    var versions = Array.isArray(row.versions) ? row.versions.slice() : [];
    versions.unshift({
      id: uuid(),
      label: (label || "").slice(0, 80),
      latex: latex,
      createdAt: now(),
    });
    row.versions = versions.slice(0, VERSION_LIMIT);
    return putResume(row);
  }

  async function restoreVersion(id, versionId) {
    var row = await getResume(id);
    if (!row) throw new Error("Resume not found");
    var v = (row.versions || []).find(function (x) { return x.id === versionId; });
    if (!v) throw new Error("Version not found");
    await snapshot(id, row.latex, "before restore");
    row = await getResume(id);
    row.latex = v.latex;
    return putResume(row);
  }

  global.ResumateStore = {
    listResumes: listResumes,
    getResume: getResume,
    putResume: putResume,
    createResume: createResume,
    deleteResume: deleteResume,
    saveLatex: saveLatex,
    saveTitle: saveTitle,
    saveChat: saveChat,
    snapshot: snapshot,
    restoreVersion: restoreVersion,
    uuid: uuid,
  };
})(window);
