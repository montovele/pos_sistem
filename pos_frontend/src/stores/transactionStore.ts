import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PendingTransaction, Transaction } from '@/types'
import transactionService from '@/services/transactionService'
import { useIndexedDB } from '@/db/indexedDB'

export const useTransactionStore = defineStore('transactions', () => {
  const transactions = ref<Transaction[]>([])
  const pendingTransactions = ref<PendingTransaction[]>([])
  const currentTransaction = ref<Transaction | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const savePendingTransaction = async (items: any[], total: number, paymentMethod = 'cash') => {
    const { dbManager } = useIndexedDB()

    const user = localStorage.getItem('user')
    const userData = user ? JSON.parse(user) : null
    const deviceId = localStorage.getItem('pos_device_id') || 'legacy-device'
    const clientTransactionId = `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const createdAt = new Date().toISOString()
    const payload = {
      items,
      total: Number(total || 0),
      discount: 0,
      paymentMethod,
      employeeNumber: userData?.numeroEmpleado,
      customer: { nombre: 'Consumidor final' },
      clientTransactionId,
      deviceId,
      createdAt
    }

    const pending: PendingTransaction = {
      id: clientTransactionId,
      clientTransactionId,
      deviceId,
      codigoTransaccion: `TRX-${Date.now()}`,
      codigoTicket: `TKT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      fechaDeTrans: createdAt,
      items,
      total: Number(total || 0),
      paymentMethod,
      employeeNumber: userData?.numeroEmpleado,
      customer: { nombre: 'Consumidor final' },
      status: 'pending',
      attempts: 0,
      timestamp: Date.now(),
      payload
    }

    await dbManager.addItem('pendingTransactions', pending)
    pendingTransactions.value = await dbManager.getAllItems('pendingTransactions')
    return pending
  }

  const loadPendingTransactions = async () => {
    try {
      const { dbManager, init } = useIndexedDB()
      await init()
      pendingTransactions.value = await dbManager.getAllItems('pendingTransactions')
    } catch (err: any) {
      console.error('Error cargando transacciones pendientes:', err)
    }
  }

  const loadTransactions = async (startDate?: string, endDate?: string, cashierId?: number) => {
    isLoading.value = true
    error.value = null
    try {
      transactions.value = await transactionService.getTransactionHistory(startDate || '', endDate || '', cashierId)
      return transactions.value
    } catch (err: any) {
      error.value = err.message || 'No se pudieron cargar las transacciones'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const syncPendingTransactions = async () => {
    if (!navigator.onLine) return

    try {
      const { dbManager, init } = useIndexedDB()
      await init()
      const pending = await dbManager.getAllItems('pendingTransactions')

      if (!pending.length) {
        pendingTransactions.value = []
        return
      }

      for (const item of [...pending]) {
        const payload = item.payload && Object.keys(item.payload).length
          ? item.payload
          : {
              items: item.items ?? [],
              total: Number(item.total ?? 0),
              discount: Number(item.discount ?? 0),
              paymentMethod: item.paymentMethod ?? 'cash',
              employeeNumber: item.employeeNumber,
              customer: item.customer ?? { nombre: 'Consumidor final' },
              clientTransactionId: item.clientTransactionId,
              deviceId: item.deviceId,
              createdAt: item.fechaDeTrans || new Date().toISOString()
            }

        try {
          item.status = 'syncing'
          item.syncStatus = 'syncing'
          item.lastError = undefined
          await dbManager.addItem('pendingTransactions', item)
          const response = await transactionService.syncTransaction(payload as Record<string, unknown>)

          const syncedTransaction: Transaction = {
            ...response,
            syncStatus: 'synced',
            printStatus: item.printStatus ?? 'pending',
            drawerStatus: item.drawerStatus ?? 'pending',
            printError: item.printError,
            printedAt: item.printedAt
          }
          await dbManager.addItem('transactions', syncedTransaction)
          await dbManager.deleteItem('pendingTransactions', item.id)
          transactions.value = [syncedTransaction, ...transactions.value.filter((transaction) => transaction.codigoTransaccion !== response?.codigoTransaccion)]
        } catch (syncError: any) {
          item.attempts = (item.attempts || 0) + 1
          item.status = 'failed'
          item.syncStatus = 'pending'
          item.lastError = syncError?.message || 'No se pudo sincronizar'
          await dbManager.addItem('pendingTransactions', item)
        }
      }

      pendingTransactions.value = await dbManager.getAllItems('pendingTransactions')
    } catch (err: any) {
      console.error('Error sincronizando cola offline:', err)
    }
  }

  const createTransaction = async (
    items: any[],
    total: number,
    paymentMethod = 'cash',
    saleDiscount = 0,
    customer?: Record<string, unknown>
  ) => {
    isLoading.value = true
    error.value = null

    try {
      const transaction = await transactionService.createTransaction(
        items,
        total,
        paymentMethod,
        saleDiscount,
        customer
      )
      currentTransaction.value = transaction
      transactions.value.push(transaction)
      return transaction
    } catch (err: any) {
      const message = String(err?.message || '')
      const isOffline = !navigator.onLine || !!err?.offline || /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED/i.test(message)

      if (isOffline) {
        const pending = await savePendingTransaction(items, total, paymentMethod)
        if (pending) {
          pending.discount = saleDiscount
          pending.customer = customer ?? { nombre: 'Consumidor final' }
        }
        error.value = 'Sin conexión. La venta quedó guardada y se enviará cuando haya internet.'
        return pending
      }

      error.value = err?.message || 'Failed to create transaction'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const confirmTransaction = async (id: string) => {
    isLoading.value = true
    error.value = null

    try {
      const transaction = await transactionService.confirmTransaction(id)
      const index = transactions.value.findIndex(t => t.codigoTransaccion === id)
      if (index > -1) {
        transactions.value[index] = transaction
      }
      currentTransaction.value = transaction
      return transaction
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const cancelTransaction = async (id: string, reason: string) => {
    isLoading.value = true
    error.value = null

    try {
      await transactionService.cancelTransaction(id, reason)
      const transaction = transactions.value.find(t => t.codigoTransaccion === id)
      if (transaction) {
        transaction.status = 'cancelled'
      }
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    transactions,
    pendingTransactions,
    currentTransaction,
    isLoading,
    error,
    createTransaction,
    confirmTransaction,
    cancelTransaction,
    savePendingTransaction,
    loadPendingTransactions,
    loadTransactions,
    syncPendingTransactions
  }
})
