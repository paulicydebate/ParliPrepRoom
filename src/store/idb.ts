import type { UseStore } from 'idb-keyval';

/**
 * Like idb-keyval's createStore, but the connection closes when the browser
 * asks (another tab or the device wipe is deleting the database) and reopens
 * on next use. Without this an open connection blocks the delete.
 */
export function createStore(dbName: string, storeName: string): UseStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          if (dbp === p) dbp = null;
        };
        db.onclose = () => {
          if (dbp === p) dbp = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
    dbp = p;
    return p;
  };
  return (mode, callback) =>
    (dbp ?? open()).then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          tx.onerror = tx.onabort = () => reject(tx.error);
          Promise.resolve(callback(tx.objectStore(storeName))).then(resolve, reject);
        }),
    );
}
