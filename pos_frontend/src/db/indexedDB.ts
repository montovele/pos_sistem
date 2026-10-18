import { ref } from 'vue'
import type { CartItem, Transaction } from '@/types'

const DB_NAME = 'POS_DB'
const DB_VERSION = 1

interface DBStore {
  name: string
  keyPath: string
}

class IndexedDBManager {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private stores: Record<string, DBStore> = {
    products: { name: 'products', keyPath: 'id' },
    transactions: { name: 'transactions', keyPath: 'codigoTransaccion' },
    cartItems: { name: 'cartItems', keyPath: 'id' },
    changeHistory: { name: 'changeHistory', keyPath: 'id' },
    cartVersion: { name: 'cartVersion', keyPath: 'key' },
    pendingTransactions: { name: 'pendingTransactions', keyPath: 'id' },
    syncQueue: { name: 'syncQueue', keyPath: 'id' },
    cache: { name: 'cache', keyPath: 'key' },
    cashSession: { name: 'cashSession', keyPath: 'id' }
  }

  private async ensureReady(): Promise<void> {
    if (this.db) return
    if (!this.initPromise) {
      this.initPromise = this.init()
    }
    await this.initPromise
  }

  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        Object.values(this.stores).forEach(store => {
          if (!db.objectStoreNames.contains(store.name)) {
            db.createObjectStore(store.name, { keyPath: store.keyPath })
          }
        })
      }
    }).catch((error) => {
      this.initPromise = null
      throw error
    })

    await this.initPromise
  }

  async addItem(storeName: string, item: any): Promise<void> {
    await this.ensureReady()

    if (!this.db) throw new Error('Database not initialized')

    let cloneableItem: any
    try {
      cloneableItem = typeof structuredClone === 'function'
        ? structuredClone(item)
        : JSON.parse(JSON.stringify(item))
    } catch {
      try {
        cloneableItem = JSON.parse(JSON.stringify(item))
      } catch {
        throw new Error(`El registro de ${storeName} contiene datos no serializables`)
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(cloneableItem)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getItem(storeName: string, key: any): Promise<any> {
    await this.ensureReady()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getAllItems(storeName: string): Promise<any[]> {
    await this.ensureReady()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async updateItem(storeName: string, key: any, value: any): Promise<void> {
    await this.ensureReady()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(value, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async deleteItem(storeName: string, key: any): Promise<void> {
    await this.ensureReady()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async clearStore(storeName: string): Promise<void> {
    await this.ensureReady()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

export const dbManager = new IndexedDBManager()

// Composable to use IndexedDB
export const useIndexedDB = () => {
  const isReady = ref(false)
  const error = ref<string | null>(null)

  const init = async () => {
    try {
      await dbManager.init()
      isReady.value = true
    } catch (err: any) {
      error.value = err.message
    }
  }

  return {
    isReady,
    error,
    init,
    dbManager
  }
}
