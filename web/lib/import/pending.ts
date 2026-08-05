import {
  PENDING_IMPORT_DB,
  PENDING_IMPORT_KEY,
  PENDING_IMPORT_STORE,
  type ImportKind,
} from "@/lib/import/constants";

export type PendingImport = {
  filename: string;
  mime: string;
  kind: ImportKind;
  bytes: ArrayBuffer;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PENDING_IMPORT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_IMPORT_STORE)) {
        db.createObjectStore(PENDING_IMPORT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export async function savePendingImport(file: File, kind: ImportKind): Promise<void> {
  const bytes = await file.arrayBuffer();
  const record: PendingImport = {
    filename: file.name,
    mime: file.type || "",
    kind,
    bytes,
    savedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING_IMPORT_STORE, "readwrite");
    tx.objectStore(PENDING_IMPORT_STORE).put(record, PENDING_IMPORT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not stash import"));
  });
  db.close();
}

export async function loadPendingImport(): Promise<PendingImport | null> {
  const db = await openDb();
  const record = await new Promise<PendingImport | null>((resolve, reject) => {
    const tx = db.transaction(PENDING_IMPORT_STORE, "readonly");
    const req = tx.objectStore(PENDING_IMPORT_STORE).get(PENDING_IMPORT_KEY);
    req.onsuccess = () => resolve((req.result as PendingImport | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Could not read pending import"));
  });
  db.close();
  if (!record?.bytes || Date.now() - record.savedAt > 1000 * 60 * 60 * 6) {
    return null;
  }
  return record;
}

export async function clearPendingImport(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING_IMPORT_STORE, "readwrite");
    tx.objectStore(PENDING_IMPORT_STORE).delete(PENDING_IMPORT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not clear pending import"));
  });
  db.close();
}

export async function peekPendingImport(): Promise<boolean> {
  try {
    const pending = await loadPendingImport();
    return Boolean(pending);
  } catch {
    return false;
  }
}
