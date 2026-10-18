import { dbManager } from '@/db/indexedDB'
import { api } from '@/services/api'

interface PendingCashOpen {
  id: string
  type: 'open'
  clientSessionId: string
  employeeNumber: number | string
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
  lastError?: string
}

const createClientSessionId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `cash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export async function enqueueCashOpening(
  payload: Record<string, unknown>,
  employeeNumber: number | string
) {
  await dbManager.init()

  const clientSessionId = createClientSessionId()
  const operation: PendingCashOpen = {
    id: `cash-open:${clientSessionId}`,
    type: 'open',
    clientSessionId,
    employeeNumber,
    payload: { ...payload, clientSessionId },
    createdAt: new Date().toISOString(),
    attempts: 0
  }

  await dbManager.addItem('cashSession', operation)
  return operation
}

export async function syncPendingCashOpenings(employeeNumber?: number | string) {
  await dbManager.init()
  const pending = (await dbManager.getAllItems('cashSession') as PendingCashOpen[])
    .filter((item) => item.type === 'open' && (employeeNumber == null || String(item.employeeNumber) === String(employeeNumber)))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  if (!pending.length) return true
  if (!navigator.onLine) return false

  for (const operation of pending) {
    try {
      const response = await api.post('/caja/open', operation.payload)
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'No se pudo sincronizar la apertura de caja')
      }

      await dbManager.deleteItem('cashSession', operation.id)

      const stateKey = `pos_cash_session_${operation.employeeNumber}`
      const storedState = localStorage.getItem(stateKey)
      if (storedState) {
        const state = JSON.parse(storedState)
        if (state.clientSessionId === operation.clientSessionId) {
          localStorage.setItem(stateKey, JSON.stringify({
            ...state,
            syncStatus: 'synced',
            backendSessionId: response.data.data?.id || null,
            updatedAt: new Date().toISOString()
          }))
        }
      }
    } catch (error: any) {
      operation.attempts += 1
      operation.lastError = error?.message || 'No se pudo sincronizar la apertura de caja'
      await dbManager.addItem('cashSession', operation)
      return false
    }
  }

  return true
}