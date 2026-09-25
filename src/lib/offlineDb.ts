import { openDB, IDBPDatabase } from 'idb';

interface PendingAction {
  id?: number;
  type: 'delivery_complete' | 'sitio_add' | 'truck_location' | 'resident_add';
  data: any;
  timestamp: number;
}

const DB_NAME = 'inhapi-offline-db';
const STORE_NAME = 'pending-sync';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export const offlineDb = {
  async addAction(type: PendingAction['type'], data: any) {
    const db = await getDB();
    return db.add(STORE_NAME, {
      type,
      data,
      timestamp: Date.now(),
    });
  },

  async getAllActions(): Promise<PendingAction[]> {
    const db = await getDB();
    return db.getAll(STORE_NAME);
  },

  async deleteAction(id: number) {
    const db = await getDB();
    return db.delete(STORE_NAME, id);
  },

  async clearAll() {
    const db = await getDB();
    return db.clear(STORE_NAME);
  }
};
