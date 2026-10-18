import type { Transaction, CartItem } from '@/types'
import http from './http'
import { normalizeSaleItem } from '@/utils/helpers'

class TransactionService {
  private unwrapPayload<T = any>(response: any): T {
    const payload = response?.data ?? response

    if (payload && typeof payload === 'object' && 'success' in payload) {
      if (payload.success === false) {
        throw new Error(payload.message || 'Error en la operación')
      }
      return (payload.data ?? payload) as T
    }

    return payload as T
  }

  /**
   * Crear una nueva transacción
   * @param items Items del carrito
   * @param total Total de la transacción
   * @param paymentMethod Método de pago
   */
  async createTransaction(
    items: CartItem[],
    total: number,
    paymentMethod = 'cash',
    saleDiscount = 0,
    customer: Record<string, unknown> = { nombre: 'Consumidor final' }
  ): Promise<Transaction> {
    const user = localStorage.getItem('user_session') || localStorage.getItem('user')
    const userData = user ? JSON.parse(user) : null

    try {
      const response: any = await http.post('/transactions', {
        items: items.map(item => normalizeSaleItem(item)),
        total: Number(total),
        discount: Number(saleDiscount || 0),
        paymentMethod,
        employeeNumber: userData?.numeroEmpleado,
        customer
      })

      return this.unwrapPayload<Transaction>(response)
    } catch (error: any) {
      const message = error?.message || 'Error al crear transacción'
      const normalized = new Error(message) as Error & { offline?: boolean }
      normalized.offline = !navigator.onLine || /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED/i.test(message)
      throw normalized
    }
  }

  async syncTransaction(pending: Record<string, unknown>): Promise<Transaction> {
    const response = await http.post('/transactions/sync', pending)
    return this.unwrapPayload<Transaction>(response)
  }

  /**
   * Obtener historial de transacciones
   * @param startDate Fecha inicio (YYYY-MM-DD)
   * @param endDate Fecha fin (YYYY-MM-DD)
   */
  async getTransactionHistory(startDate: string, endDate: string, cashierId?: number): Promise<Transaction[]> {
    const response = await http.get('/transactions', {
      params: {
        startDate,
        endDate,
        ...(cashierId ? { cashierId } : {})
      }
    })

    return this.unwrapPayload<Transaction[]>(response)
  }

  /**
   * Obtener transacción por ID
   * @param id ID de la transacción
   */
  async getTransactionById(id: string): Promise<Transaction> {
    const response = await http.get(`/transactions/${id}`)
    return this.unwrapPayload<Transaction>(response)
  }

  /**
   * Confirmar transacción
   * @param id ID de la transacción
   */
  async confirmTransaction(id: string): Promise<Transaction> {
    const response = await http.post(`/transactions/${id}/confirm`)
    return this.unwrapPayload<Transaction>(response)
  }

  /**
   * Cancelar transacción
   * @param id ID de la transacción
   * @param reason Motivo de cancelación
   */
  async cancelTransaction(id: string, reason: string): Promise<void> {
    const response = await http.post(`/transactions/${id}/cancel`, { reason })
    this.unwrapPayload(response)
  }
}

export default new TransactionService()
