import type {
  ImportResult,
  InventoryItem,
  InventoryMovement,
  InventorySummary,
  MovementType,
  PaginatedResponse
} from '@/types'
import { normalizeInventoryUnit } from '@/utils/helpers'
import http from './http'

interface InventoryListMeta {
  total?: number
  page?: number
  perPage?: number
  totalPages?: number
}

interface InventoryListResponse {
  success?: boolean
  data?: InventoryItem[]
  meta?: InventoryListMeta
  message?: string
}

interface InventoryEnvelope<T> {
  success?: boolean
  data?: T
  message?: string
}

class InventoryService {
  private unwrap<T>(response: { success?: boolean; data?: T; message?: string } | T): T {
    if (response && typeof response === 'object' && 'success' in response) {
      if (response.success === false) {
        throw new Error(response.message || 'Error al consultar el inventario')
      }
      return (response.data ?? response) as T
    }

    return response as T
  }

  private normalizeImportedRow(row: Record<string, unknown>): Record<string, unknown> {
    const clone = { ...row }
    const unitKeyCandidates = ['unit', 'unidad', 'Unidad', 'UNIDAD', 'unitMeasure', 'unidadMedida']

    for (const key of unitKeyCandidates) {
      if (key in clone && clone[key] !== undefined && clone[key] !== null && clone[key] !== '') {
        clone[key] = normalizeInventoryUnit(clone[key])
        clone.unit = normalizeInventoryUnit(clone[key])
        clone.unidad = normalizeInventoryUnit(clone[key])
      }
    }

    return clone
  }

  private normalizeCsvUnitValues(csv: string): string {
    const lines = csv.split(/\r?\n/)
    if (!lines.length) return csv

    const firstLine = lines[0]
    const headers = firstLine.split(',').map(value => value.trim().toLowerCase())
    const unitIndex = headers.findIndex(header => ['unit', 'unidad', 'unidad_medida', 'medida'].includes(header))

    if (unitIndex === -1) return csv

    return lines.map((line, index) => {
      if (index === 0) return line
      const columns = line.split(',')
      if (columns.length <= unitIndex) return line
      columns[unitIndex] = normalizeInventoryUnit(columns[unitIndex])
      return columns.join(',')
    }).join('\n')
  }

  async getItems(search = '', page = 1, perPage = 20): Promise<PaginatedResponse<InventoryItem>> {
    const response = await http.get<InventoryListResponse>('/inventario', {
      params: { search: search.trim() || undefined, page, perPage }
    })

    if (response.success === false) {
      throw new Error(response.message || 'Error al consultar el inventario')
    }

    const items = Array.isArray(response.data) ? response.data : []
    const meta = response.meta || {}
    const total = Number(meta.total ?? items.length)
    const resolvedPerPage = Number(meta.perPage ?? perPage)

    return {
      data: items,
      total,
      page: Number(meta.page ?? page),
      perPage: resolvedPerPage,
      totalPages: Number(meta.totalPages ?? Math.max(1, Math.ceil(total / resolvedPerPage)))
    }
  }

  async getLowStock(): Promise<InventoryItem[]> {
    const response = await http.get<{ success?: boolean; data?: InventoryItem[]; message?: string }>('/inventario/stock-bajo')
    return this.unwrap<InventoryItem[]>(response) || []
  }

  async findBySku(sku: string, warehouse?: string): Promise<InventoryItem> {
    const response = await http.get<InventoryEnvelope<InventoryItem>>(`/inventario/${encodeURIComponent(sku)}`, {
      params: warehouse ? { warehouse } : undefined
    })
    return this.unwrap<InventoryItem>(response)
  }

  async createItem(payload: Partial<InventoryItem>): Promise<InventoryItem> {
    const response = await http.post<InventoryEnvelope<InventoryItem>>('/inventario', payload)
    return this.unwrap<InventoryItem>(response)
  }

  async updateItem(id: number, payload: Partial<InventoryItem>): Promise<InventoryItem> {
    const response = await http.put<InventoryEnvelope<InventoryItem>>(`/inventario/${id}`, payload)
    return this.unwrap<InventoryItem>(response)
  }

  async importJson(rows: unknown, dryRun = true): Promise<ImportResult> {
    const normalizedRows = Array.isArray(rows)
      ? rows.map((row) => this.normalizeImportedRow((row as Record<string, unknown>) || {}))
      : rows

    const response = await http.post<InventoryEnvelope<ImportResult>>('/inventario/import/json', { rows: normalizedRows, dryRun })
    return this.unwrap<ImportResult>(response)
  }

  async importCsv(filename: string, csv: string, dryRun = true): Promise<ImportResult> {
    const normalizedCsv = this.normalizeCsvUnitValues(csv)
    const response = await http.post<InventoryEnvelope<ImportResult>>('/inventario/import/csv', {
      filename,
      mimetype: 'text/csv',
      csv: normalizedCsv,
      dryRun
    })
    return this.unwrap<ImportResult>(response)
  }

  async importXlsx(file: File, dryRun = true): Promise<ImportResult> {
    const buffer = await file.arrayBuffer()
    let binary = ''
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
    const response = await http.post<InventoryEnvelope<ImportResult>>('/inventario/import/xlsx', {
      filename: file.name,
      mimetype: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: btoa(binary),
      dryRun
    })
    return this.unwrap<ImportResult>(response)
  }

  async getSummary(warehouse = ''): Promise<InventorySummary> {
    const response = await http.get<InventoryEnvelope<InventorySummary>>('/inventario/reportes/resumen', {
      params: warehouse ? { warehouse } : undefined
    })
    return this.unwrap<InventorySummary>(response)
  }

  async getLowStockReport(warehouse = '', limit = 100): Promise<InventoryItem[]> {
    const response = await http.get<InventoryEnvelope<InventoryItem[]>>('/inventario/reportes/bajo-stock', {
      params: { warehouse: warehouse || undefined, limit }
    })
    return this.unwrap<InventoryItem[]>(response) || []
  }

  async getMovements(params: { sku?: string; warehouse?: string } = {}): Promise<InventoryMovement[]> {
    const response = await http.get<InventoryEnvelope<InventoryMovement[]>>('/inventario/movimientos', { params })
    return this.unwrap<InventoryMovement[]>(response) || []
  }

  async getImports(): Promise<Array<Record<string, unknown>>> {
    const response = await http.get<InventoryEnvelope<Array<Record<string, unknown>>>>('/inventario/importaciones')
    return this.unwrap<Array<Record<string, unknown>>>(response) || []
  }

  async createMovement(payload: {
    sku: string
    warehouse: string
    movementType: MovementType
    quantity: number
    reason?: string
    referenceType?: string
    referenceId?: string
  }): Promise<InventoryMovement> {
    const response = await http.post<InventoryEnvelope<InventoryMovement>>('/inventario/movimientos', payload)
    return this.unwrap<InventoryMovement>(response)
  }
}

export default new InventoryService()
