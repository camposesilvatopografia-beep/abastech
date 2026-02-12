import { useState, useEffect, useCallback } from 'react';

const DB_NAME = 'abastech_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_records';
const CACHE_STORE = 'cached_data';

export type OfflineRecordType = 'fuel_record' | 'horimeter_reading' | 'service_order';

export interface OfflineRecord {
  id: string;
  data: Record<string, any>;
  createdAt: string;
  type: OfflineRecordType;
  userId: string;
  syncAttempts: number;
  lastSyncAttempt?: string;
}

class OfflineDB {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }

        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return this.dbReady;
  }

  async addRecord(record: OfflineRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(record);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getRecordsByUser(userId: string): Promise<OfflineRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('userId');
      const request = index.getAll(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async getAllRecords(): Promise<OfflineRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async deleteRecord(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async updateRecord(record: OfflineRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getRecordCount(userId?: string): Promise<number> {
    const records = userId 
      ? await this.getRecordsByUser(userId)
      : await this.getAllRecords();
    return records.length;
  }

  async clearAllRecords(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Cache reference data
  async setCacheData(key: string, data: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_STORE], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE);
      const request = store.put({ key, data, updatedAt: new Date().toISOString() });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getCacheData<T = any>(key: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_STORE], 'readonly');
      const store = transaction.objectStore(CACHE_STORE);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.data ?? null);
    });
  }
}

// Singleton instance
const offlineDB = new OfflineDB();

export { offlineDB };

export function useOfflineStorage(userId?: string) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSupported, setIsSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSupport = async () => {
      try {
        if (!('indexedDB' in window)) {
          setIsSupported(false);
          setIsLoading(false);
          return;
        }

        await offlineDB.getDB();
        setIsSupported(true);
        
        if (userId) {
          const count = await offlineDB.getRecordCount(userId);
          setPendingCount(count);
        }
      } catch (error) {
        console.error('IndexedDB not available:', error);
        setIsSupported(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkSupport();
  }, [userId]);

  const refreshCount = useCallback(async () => {
    if (!userId) return;
    try {
      const count = await offlineDB.getRecordCount(userId);
      setPendingCount(count);
    } catch (error) {
      console.error('Error refreshing count:', error);
    }
  }, [userId]);

  const saveOfflineRecord = useCallback(async (
    data: Record<string, any>,
    type: OfflineRecordType = 'fuel_record'
  ): Promise<string> => {
    if (!userId) throw new Error('User ID required');
    if (!isSupported) throw new Error('IndexedDB not supported');

    const record: OfflineRecord = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data,
      createdAt: new Date().toISOString(),
      type,
      userId,
      syncAttempts: 0,
    };

    await offlineDB.addRecord(record);
    await refreshCount();
    
    return record.id;
  }, [userId, isSupported, refreshCount]);

  const getPendingRecords = useCallback(async (): Promise<OfflineRecord[]> => {
    if (!userId) return [];
    if (!isSupported) return [];
    
    return offlineDB.getRecordsByUser(userId);
  }, [userId, isSupported]);

  const markRecordSynced = useCallback(async (id: string): Promise<void> => {
    await offlineDB.deleteRecord(id);
    await refreshCount();
  }, [refreshCount]);

  const markSyncFailed = useCallback(async (id: string): Promise<void> => {
    const records = await offlineDB.getAllRecords();
    const record = records.find(r => r.id === id);
    
    if (record) {
      record.syncAttempts += 1;
      record.lastSyncAttempt = new Date().toISOString();
      await offlineDB.updateRecord(record);
    }
  }, []);

  const clearAllPending = useCallback(async (): Promise<void> => {
    await offlineDB.clearAllRecords();
    setPendingCount(0);
  }, []);

  // Cache helpers
  const cacheData = useCallback(async (key: string, data: any) => {
    await offlineDB.setCacheData(key, data);
  }, []);

  const getCachedData = useCallback(async <T = any>(key: string): Promise<T | null> => {
    return offlineDB.getCacheData<T>(key);
  }, []);

  return {
    isSupported,
    isLoading,
    pendingCount,
    saveOfflineRecord,
    getPendingRecords,
    markRecordSynced,
    markSyncFailed,
    clearAllPending,
    refreshCount,
    cacheData,
    getCachedData,
  };
}
