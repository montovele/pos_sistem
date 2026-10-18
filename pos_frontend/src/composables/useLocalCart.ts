import { ref, computed } from 'vue'
import { useCartStore } from '@/stores/cartStore'
import { useIndexedDB } from '@/db/indexedDB'
import type { CartItem } from '@/types'

export interface ChangeEntry {
  id: string
  type: 'add' | 'update' | 'remove'
  itemId: string
  before?: any
  after?: any
  timestamp: string
  synced: boolean
  syncAttempts: number
}

export interface CartConflict {
  itemId: string
  local: CartItem
  remote: CartItem
  resolvedBy: 'local' | 'remote' | 'merge'
  timestamp: string
}

export const useLocalCart = () => {
  const cartStore = useCartStore()
  const { dbManager } = useIndexedDB()

  // Estado de sincronización
  const isSynced = ref(true)
  const syncError = ref<string | null>(null)
  const pendingChanges = ref<number>(0)
  const cartVersion = ref<number>(0)

  // Historial y reintentos
  const changeHistory = ref<ChangeEntry[]>([])
  const conflictLog = ref<CartConflict[]>([])
  const retryQueue = ref<Set<string>>(new Set())
  const maxRetries = 3
  const retryDelayMs = 1000

  /**
   * Registrar cambio en historial
   */
  const recordChange = async (
    type: 'add' | 'update' | 'remove',
    itemId: string,
    before?: any,
    after?: any
  ) => {
    const change: ChangeEntry = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      itemId,
      before,
      after,
      timestamp: new Date().toISOString(),
      synced: false,
      syncAttempts: 0
    }

    changeHistory.value.push(change)
    retryQueue.value.add(change.id)

    // Guardar historial en IndexedDB
    try {
      await dbManager.addItem('changeHistory', change)
    } catch (error) {
      console.error('Error grabando cambio en historial:', error)
    }
  }

  /**
   * Cargar carrito desde IndexedDB
   */
  const loadFromLocal = async () => {
    try {
      const savedItems = await dbManager.getAllItems('cartItems')
      const versionData = await dbManager.getItem('cartVersion', 'version')

      cartStore.clear()

      if (savedItems && savedItems.length > 0) {
        savedItems.forEach(item => {
          cartStore.addItem(item.product, item.quantity)
        })
        console.log('✅ Carrito restaurado desde IndexedDB')
      }

      // Restaurar versión
      if (versionData) {
        cartVersion.value = versionData.value || 0
      }

      // Cargar historial
      const history = await dbManager.getAllItems('changeHistory')
      if (history) {
        changeHistory.value = history
        retryQueue.value = new Set(
          history
            .filter(c => !c.synced)
            .map(c => c.id)
        )
        pendingChanges.value = retryQueue.value.size
      }
    } catch (error) {
      console.error('Error cargando carrito desde IndexedDB:', error)
      syncError.value = 'Error al cargar carrito guardado'
    }
  }

  /**
   * Guardar carrito en IndexedDB
   */
  const saveToLocal = async () => {
    try {
      await dbManager.clearStore('cartItems')

      for (const item of cartStore.items) {
        await dbManager.addItem('cartItems', {
          ...item,
          timestamp: new Date().toISOString()
        })
      }

      // Incrementar versión
      cartVersion.value++
      await dbManager.addItem('cartVersion', {
        key: 'version',
        value: cartVersion.value
      })

      isSynced.value = true
      syncError.value = null
      console.log('✅ Carrito guardado en IndexedDB (v' + cartVersion.value + ')')
    } catch (error) {
      console.error('Error guardando carrito:', error)
      syncError.value = 'Error al guardar carrito'
      isSynced.value = false
    }
  }

  /**
   * Detectar conflictos comparando versiones
   */
  const detectConflict = (localItem: CartItem, remoteItem: any): boolean => {
    const localPrice = localItem.product?.price ?? 0
    const remotePrice = remoteItem.product?.price ?? remoteItem.price ?? 0

    return (
      localItem.quantity !== remoteItem.quantity ||
      localPrice !== remotePrice ||
      (localItem.product?.id !== remoteItem.product?.id)
    )
  }

  /**
   * Resolver conflicto (usar versión local por defecto)
   */
  const resolveConflict = (
    itemId: string,
    localItem: CartItem,
    remoteItem: any,
    strategy: 'local' | 'remote' | 'merge' = 'local'
  ) => {
    const conflict: CartConflict = {
      itemId,
      local: localItem,
      remote: remoteItem,
      resolvedBy: strategy,
      timestamp: new Date().toISOString()
    }

    conflictLog.value.push(conflict)

    if (strategy === 'remote') {
      cartStore.updateItemQuantity(itemId, remoteItem.quantity)
    } else if (strategy === 'merge') {
      // Mezclar: tomar cantidad más alta
      const maxQty = Math.max(localItem.quantity, remoteItem.quantity)
      cartStore.updateItemQuantity(itemId, maxQty)
    }
    // 'local' no hace nada, mantiene el valor local
  }

  /**
   * Sincronizar con servidor con reintentos automáticos
   */
  const syncWithServer = async (endpoint: string, forceRetry = false) => {
    try {
      isSynced.value = false
      const requestEndpoint = endpoint || '/transactions'

      // Obtener cambios pendientes
      const pendingSyncs = Array.from(retryQueue.value)
      if (pendingSyncs.length === 0 && !forceRetry) {
        isSynced.value = true
        return
      }

      // Preparar payload
      const payload = {
        endpoint: requestEndpoint,
        items: cartStore.items,
        changes: changeHistory.value.filter(c => !c.synced),
        version: cartVersion.value,
        timestamp: new Date().toISOString()
      }

      // Simular sincronización con servidor
      // En producción, aquí iría: const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify(payload) })
      const response = await new Promise<any>((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: { itemsUpdated: payload.changes.length }
          })
        }, 500)
      })

      if (response.success) {
        // Marcar cambios como sincronizados
        changeHistory.value.forEach(change => {
          if (change.synced === false) {
            change.synced = true
            change.syncAttempts = 0
          }
        })

        // Limpiar cola de reintentos
        retryQueue.value.clear()
        pendingChanges.value = 0
        isSynced.value = true
        syncError.value = null

        console.log('✅ Carrito sincronizado con servidor (v' + cartVersion.value + ')')
      }
    } catch (error) {
      console.error('Error sincronizando con servidor:', error)
      syncError.value = 'Error al sincronizar: ' + (error as any).message
      isSynced.value = false
      // Los cambios se quedan pendientes para reintentar
    }
  }

  /**
   * Reintentar sincronización con backoff exponencial
   */
  const retrySync = async (changeId: string, endpoint: string): Promise<boolean> => {
    const change = changeHistory.value.find(c => c.id === changeId)
    if (!change) return false

    const delay = retryDelayMs * Math.pow(2, change.syncAttempts)

    if (change.syncAttempts < maxRetries) {
      change.syncAttempts++
      console.log(`⏳ Reintentando sincronización (intento ${change.syncAttempts}/${maxRetries})...`)

      await new Promise(resolve => setTimeout(resolve, delay))

      try {
        await syncWithServer(endpoint)
        return true
      } catch (error) {
        console.error(`Reintento ${change.syncAttempts} fallido:`, error)
        return false
      }
    } else {
      console.error(`❌ Máximo de reintentos alcanzado para cambio ${changeId}`)
      return false
    }
  }

  /**
   * Sincronizar todos los cambios pendientes
   */
  const syncAllPending = async (endpoint: string) => {
    const pending = Array.from(retryQueue.value)

    for (const changeId of pending) {
      const success = await retrySync(changeId, endpoint)
      if (!success) {
        break // Detener en el primer fallo
      }
    }

    pendingChanges.value = retryQueue.value.size
  }

  /**
   * Agregar item y registrar cambio
   */
  const addItemAndTrack = async (product: any, quantity: number) => {
    const before = cartStore.items.length
    cartStore.addItem(product, quantity)
    const after = cartStore.items.length

    pendingChanges.value++
    await recordChange('add', product.id, { itemCount: before }, { itemCount: after })
    await saveToLocal()
  }

  /**
   * Actualizar cantidad y registrar cambio
   */
  const updateItemAndTrack = async (itemId: string, quantity: number) => {
    const item = cartStore.items.find(i => i.id === itemId)
    const before = item ? { quantity: item.quantity } : null

    cartStore.updateItemQuantity(itemId, quantity)

    const updated = cartStore.items.find(i => i.id === itemId)
    const after = updated ? { quantity: updated.quantity } : null

    pendingChanges.value++
    await recordChange('update', itemId, before, after)
    await saveToLocal()
  }

  /**
   * Eliminar item y registrar cambio
   */
  const removeItemAndTrack = async (itemId: string) => {
    const item = cartStore.items.find(i => i.id === itemId)
    const before = item ? { ...item } : null

    cartStore.removeItem(itemId)

    pendingChanges.value++
    await recordChange('remove', itemId, before, null)
    await saveToLocal()
  }

  /**
   * Limpiar carrito y sincronizar
   */
  const clearAndSync = async () => {
    const itemCount = cartStore.items.length
    cartStore.clear()
    pendingChanges.value = 0

    await recordChange('remove', 'all', { itemCount }, { itemCount: 0 })
    await saveToLocal()
  }

  /**
   * Obtener historial de cambios
   */
  const getChangeHistory = (limit = 50) => {
    return changeHistory.value.slice(-limit)
  }

  /**
   * Obtener historial de conflictos
   */
  const getConflictLog = (limit = 20) => {
    return conflictLog.value.slice(-limit)
  }

  /**
   * Limpiar historial antiguo (más de 24 horas)
   */
  const cleanOldHistory = async () => {
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000

    const oldChanges = changeHistory.value.filter(change => {
      const changeTime = new Date(change.timestamp).getTime()
      return (now - changeTime) > dayInMs && change.synced
    })

    oldChanges.forEach(change => {
      const idx = changeHistory.value.indexOf(change)
      if (idx > -1) {
        changeHistory.value.splice(idx, 1)
      }
    })

    console.log(`🧹 Limpiados ${oldChanges.length} cambios antiguos`)
  }

  /**
   * Detectar cambios
   */
  const hasChanges = computed(() => pendingChanges.value > 0)

  /**
   * Estado de sincronización
   */
  const syncStatus = computed(() => {
    if (isSynced.value && pendingChanges.value === 0) {
      return '✅ Sincronizado'
    }
    if (syncError.value) {
      return `❌ ${syncError.value}`
    }
    if (pendingChanges.value > 0) {
      return `⏳ ${pendingChanges.value} cambios pendientes`
    }
    return '⏳ Sincronizando...'
  })

  /**
   * Progreso de sincronización
   */
  const syncProgress = computed(() => {
    const total = retryQueue.value.size + changeHistory.value.filter(c => c.synced).length
    if (total === 0) return 0
    return Math.round(
      (changeHistory.value.filter(c => c.synced).length / total) * 100
    )
  })

  return {
    // Estado base
    isSynced,
    syncError,
    pendingChanges,
    hasChanges,
    syncStatus,
    syncProgress,
    cartVersion,

    // Historial y conflictos
    changeHistory,
    conflictLog,
    retryQueue,

    // Métodos principales
    loadFromLocal,
    saveToLocal,
    syncWithServer,
    syncAllPending,

    // Métodos de tracking
    addItemAndTrack,
    updateItemAndTrack,
    removeItemAndTrack,
    clearAndSync,
    recordChange,

    // Métodos de reintentos y conflictos
    retrySync,
    detectConflict,
    resolveConflict,

    // Métodos de historial
    getChangeHistory,
    getConflictLog,
    cleanOldHistory,

    // Acceso al store
    cartItems: computed(() => cartStore.items),
    cartTotal: computed(() => cartStore.total)
  }
}
