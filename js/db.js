// IndexedDB 打开/升级 + 事务封装
// 库名 trainmaster，四个对象仓：files / messages / meals / settings

const DB_NAME = 'trainmaster';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const s = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_date', 'date');
      }
      if (!db.objectStoreNames.contains('meals')) {
        const m = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        m.createIndex('by_date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * 事务包裹助手：tx('files', 'readwrite', store => store.getAll())
 * 支持 handler 返回 Promise（等 Promise 完成后再提交判断）。
 */
export function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(
      result && typeof result.then === 'function' ? undefined : result
    );
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('事务中止'));
    if (result && typeof result.then === 'function') {
      result.then(resolve, reject);
    }
  }));
}

/** 把 IDBRequest 包成 Promise（事务助手内部常用） */
export function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
