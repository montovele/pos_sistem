import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLocalCart } from './useLocalCart'

export interface SyncQueueItem {
  id: string
  action: 'add' | 'update' | 'remove'
  data: any
  timestamp: string
  attempts: number
  lastError?: string
}

export interface OfflineSyncStatus {
  isOnline: boolean
  isSyncing: boolean
  queueSize: number
  lastSync?: string
  syncErrors: number
  connection: 'online' | 'offline' | 'reconnecting'
}

export const useOfflineSync = () => {
  const localCart = useLocalCart()

  // Estado
  const isOnline = ref(navigator.onLine)
  const isSyncing = ref(false)
  const syncQueueRef = ref<SyncQueueItem[]>([])
  const lastSync = ref<Date | null>(null)
  const syncErrors = ref(0)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000 // 3 segundos

  // Config
  const autoSyncEnabled = ref(true)
  const syncInterval = ref(30000) // 30 segundos
  let syncTimer: ReturnType<typeof setInterval> | null = null
  let connectionCheckTimer: ReturnType<typeof setInterval> | null = null

  /**
   * Detectar cambio de conexión
   */
  const handleOnline = async () => {
    console.log('🌐 Conexión restaurada')
    isOnline.value = true
    reconnectAttempts.value = 0

    if (autoSyncEnabled.value) {
      await processSyncQueue(null)
    }
  }

  /**
   * Detectar pérdida de conexión
   */
  const handleOffline = () => {
    console.log('📴 Conexión perdida')
    isOnline.value = false
  }

  /**
   * Agregar a cola de sincronización
   */
  const enqueueChange = (action: 'add' | 'update' | 'remove', data: any) => {
    const item: SyncQueueItem = {
      id: `${Date.now()}-${Math.random()}`,
      action,
      data,
      timestamp: new Date().toISOString(),
      attempts: 0
    }

    syncQueueRef.value.push(item)
    console.log(`⏳ Cambio encolado: ${action} (total en cola: ${syncQueueRef.value.length})`)

    // Si está online, sincronizar inmediatamente
    if (isOnline.value && autoSyncEnabled.value) {
      processSyncQueue(null)
    }

    return item.id
  }

  /**
   * Sincronizar cola con servidor
   */
  const processSyncQueue = async (endpoint: string | null) => {
    if (isSyncing.value) {
      console.log('⏳ Sincronización en progreso...')
      return
    }

    if (syncQueueRef.value.length === 0) {
      console.log('✅ Nada que sincronizar')
      return
    }

    if (!isOnline.value) {
      console.log('📴 Sin conexión. Cambios guardados localmente.')
      return
    }

    isSyncing.value = true
    const startTime = Date.now()

    try {
      // Sincronizar todos los cambios pendientes
      await localCart.syncAllPending(endpoint || '/transactions')

      // Limpiar cola exitosa
      const successfulItems = syncQueueRef.value.filter(item => !item.lastError)
      successfulItems.forEach(item => {
        const idx = syncQueueRef.value.indexOf(item)
        if (idx > -1) {
          syncQueueRef.value.splice(idx, 1)
        }
      })

      lastSync.value = new Date()
      const duration = Date.now() - startTime

      console.log(
        `✅ Sincronización exitosa: ${successfulItems.length} cambios en ${duration}ms`
      )

      // Reset errores en éxito
      syncErrors.value = Math.max(0, syncErrors.value - 1)
    } catch (error: any) {
      syncErrors.value++

      console.error(`❌ Error sincronizando (intento ${syncErrors.value}):`, error)

      // Marcar items con error
      syncQueueRef.value.forEach(item => {
        item.attempts++
        item.lastError = error.message
      })

      // Si online pero falla, puede ser temporal
      if (isOnline.value && syncErrors.value < 3) {
        console.log(`🔄 Reintentando en ${reconnectDelay}ms...`)
        await sleep(reconnectDelay)
        await processSyncQueue(endpoint)
      }
    } finally {
      isSyncing.value = false
    }
  }

  /**
   * Sincronización periódica
   */
  const startAutoSync = (endpoint: string | null = null) => {
    if (syncTimer) clearInterval(syncTimer)

    syncTimer = setInterval(async () => {
      if (isOnline.value && !isSyncing.value) {
        await processSyncQueue(endpoint)
      }
    }, syncInterval.value)

    console.log(`⏰ Auto-sync iniciado cada ${syncInterval.value}ms`)
  }

  /**
   * Detener sincronización periódica
   */
  const stopAutoSync = () => {
    if (syncTimer) {
      clearInterval(syncTimer)
      syncTimer = null
      console.log('⏸️  Auto-sync detenido')
    }
  }

  /**
   * Verificación de conexión periódica (ping)
   */
  const startConnectionCheck = (interval = 10000) => {
    if (connectionCheckTimer) clearInterval(connectionCheckTimer)

    connectionCheckTimer = setInterval(async () => {
      try {
        const response = await fetch(window.location.origin, { method: 'HEAD' })
        if (!isOnline.value && response.ok) {
          handleOnline()
        }
      } catch (error) {
        if (isOnline.value) {
          handleOffline()
        }
      }
    }, interval)

    console.log(`🔍 Health check iniciado cada ${interval}ms`)
  }

  /**
   * Detener verificación de conexión
   */
  const stopConnectionCheck = () => {
    if (connectionCheckTimer) {
      clearInterval(connectionCheckTimer)
      connectionCheckTimer = null
      console.log('⏸️  Health check detenido')
    }
  }

  /**
   * Reintentar cambio específico
   */
  const retryItem = async (itemId: string, endpoint: string | null = null) => {
    const item = syncQueueRef.value.find(i => i.id === itemId)
    if (!item) {
      console.error(`Cambio no encontrado: ${itemId}`)
      return false
    }

    item.attempts++
    console.log(`🔄 Reintentando: ${item.action} (intento ${item.attempts})`)

    try {
      if (item.action === 'add') {
        await localCart.addItemAndTrack(item.data.product, item.data.quantity)
      } else if (item.action === 'update') {
        await localCart.updateItemAndTrack(item.data.itemId, item.data.quantity)
      } else if (item.action === 'remove') {
        await localCart.removeItemAndTrack(item.data.itemId)
      }

      delete item.lastError
      return true
    } catch (error: any) {
      item.lastError = error.message
      return false
    }
  }

  /**
   * Limpiar cola de cambios fallidos
   */
  const clearFailedItems = () => {
    const count = syncQueueRef.value.length
    syncQueueRef.value = []
    console.log(`🧹 Limpiados ${count} cambios fallidos`)
  }

  /**
   * Obtener resumen de cola
   */
  const getQueueSummary = () => {
    const summary = {
      total: syncQueueRef.value.length,
      byAction: {
        add: syncQueueRef.value.filter(i => i.action === 'add').length,
        update: syncQueueRef.value.filter(i => i.action === 'update').length,
        remove: syncQueueRef.value.filter(i => i.action === 'remove').length
      },
      failed: syncQueueRef.value.filter(i => i.lastError).length,
      lastItem: syncQueueRef.value[syncQueueRef.value.length - 1] || null
    }
    return summary
  }

  /**
   * Dormir (utility)
   */
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  /**
   * Configurar sync endpoint global
   */
  const setSyncEndpoint = (endpoint: string) => {
    localCart.syncWithServer(endpoint)
    startAutoSync(endpoint)
  }

  /**
   * Cambiar intervalo de sincronización
   */
  const setSyncInterval = (ms: number) => {
    syncInterval.value = ms
    if (syncTimer) {
      stopAutoSync()
      startAutoSync()
    }
  }

  // Computed
  const status = computed((): OfflineSyncStatus => {
    return {
      isOnline: isOnline.value,
      isSyncing: isSyncing.value,
      queueSize: syncQueueRef.value.length,
      lastSync: lastSync.value?.toISOString(),
      syncErrors: syncErrors.value,
      connection: !isOnline.value ? 'offline' : isSyncing.value ? 'reconnecting' : 'online'
    }
  })

  const statusMessage = computed(() => {
    if (isSyncing.value) {
      return `⏳ Sincronizando (${syncQueueRef.value.length} pendientes)...`
    }
    if (!isOnline.value) {
      return `📴 Sin conexión (${syncQueueRef.value.length} cambios guardados)`
    }
    if (syncQueueRef.value.length > 0) {
      return `⚠️  ${syncQueueRef.value.length} cambios pendientes`
    }
    if (lastSync.value) {
      const minutes = Math.floor((Date.now() - lastSync.value.getTime()) / 60000)
      return `✅ Sincronizado hace ${minutes} min`
    }
    return '✅ Sincronizado'
  })

  const queueStats = computed(() => {
    return {
      total: syncQueueRef.value.length,
      adds: syncQueueRef.value.filter(i => i.action === 'add').length,
      updates: syncQueueRef.value.filter(i => i.action === 'update').length,
      removes: syncQueueRef.value.filter(i => i.action === 'remove').length,
      failed: syncQueueRef.value.filter(i => i.lastError).length
    }
  })

  // Lifecycle
  onMounted(() => {
    // Listeners de conexión
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Iniciar auto-sync
    if (autoSyncEnabled.value) {
      startAutoSync()
      startConnectionCheck()
    }
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    stopAutoSync()
    stopConnectionCheck()
  })

  return {
    // Estado
    isOnline,
    isSyncing,
    syncQueue: syncQueueRef,
    lastSync,
    syncErrors,
    status,
    statusMessage,
    queueStats,

    // Configuración
    autoSyncEnabled,
    syncInterval,

    // Métodos de cola
    enqueueChange,
    processSyncQueue,
    retryItem,
    clearFailedItems,
    getQueueSummary,

    // Métodos de sincronización
    startAutoSync,
    stopAutoSync,
    startConnectionCheck,
    stopConnectionCheck,

    // Configuración
    setSyncEndpoint,
    setSyncInterval
  }
}
