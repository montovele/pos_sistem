// User Types
export interface User {
  id?: number
  username?: string
  email?: string
  role?: 'admin' | 'cashier' | 'manager' | string
  photo?: string
  nombreEmpleado?: string
  numeroEmpleado?: number
  organizationId?: number | null
  organizationName?: string | null
  active?: boolean
  [key: string]: unknown
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface SaleCustomer {
  nombre?: string
  rfc?: string
  email?: string
  [key: string]: unknown
}

export interface LegacyApiResponse<T = any> {
  success?: boolean
  data?: T
  message?: string
  error?: string
  total?: number
  page?: number
  perPage?: number
  totalPages?: number
}

// Product Types
export interface Product {
  id: number
  codigoProd: string
  codigoAltern?: string
  nombreProd: string
  price: number
  priceTot?: number
  stock: number
  org_id: number
  id_category: number
  description?: string
  image?: string
  category?: string
  cost?: number
  unit?: string
  saleByWeight?: boolean
  lowStockThreshold?: number
  active?: boolean
  discountRate?: number
  taxRate?: number
}

export type InventoryUnit = 'PZA' | 'KG' | 'LT' | 'CAJA' | 'M' | 'ROLLO' | 'L' | 'PAQUETE' | 'ML' | 'PAR'

export interface InventoryItem {
  id: number
  organizationId: number
  sku: string
  barcode?: string
  name: string
  category?: string
  unit: InventoryUnit
  stock: number
  minStock: number
  cost: number
  price: number
  supplier?: string
  warehouse: string
  active: boolean
}

export type ImportSource = 'csv' | 'json' | 'xlsx'
export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate'
export type MovementType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'IMPORT'

export interface ImportRowResult {
  index: number
  raw?: Record<string, unknown>
  sku: string
  status: ImportRowStatus
  errors: string[]
}

export interface ImportResult {
  source: ImportSource
  dryRun: boolean
  totalRows: number
  validRows: number
  invalidRows: number
  duplicates: number
  importedRows: number
  auditId: number | null
  rows: ImportRowResult[]
  imported?: InventoryItem[]
}

export interface InventorySummary {
  totalItems: number
  totalUnits: number
  inventoryCost: number
  inventoryValue: number
  lowStockItems: number
  activeItems: number
  inactiveItems: number
  byWarehouse: Array<{ warehouse: string; items: number; units: number; inventoryCost: number }>
  byCategory: Array<{ category: string; items: number; units: number }>
}

export interface InventoryMovement {
  id: number
  sku: string
  warehouse: string
  movementType: MovementType
  quantity: number
  stockBefore: number
  stockAfter: number
  reason?: string
  referenceType?: string
  referenceId?: string
  userId?: number
  username?: string
  createdAt?: string
}

// Cart Types
export interface CartItem {
  id: string
  product: Product
  productId?: number
  codigoProd?: string
  nombreProd?: string
  quantity: number
  unit?: string
  price?: number
  priceTot: number
  discountRate?: number
  subtotal?: number
  discount?: number
  total?: number
  fechaDeTrans: string
  codigoTransaccion: string
  codigoTicket: string
}

export interface Cart {
  items: CartItem[]
  total: number
  subtotal: number
  tax: number
  itemCount: number
}

// Transaction Types
export interface Transaction {
  codigoTransaccion: string
  codigoTicket: string
  fechaDeTrans: string
  items: CartItem[]
  total: number
  subtotal?: number
  discount?: number
  nombreCajero: string
  numeroEmpleado: number
  status: 'pending' | 'completed' | 'cancelled'
  timestamp: number
  paymentMethod?: string
  syncStatus?: 'pending' | 'syncing' | 'synced'
  printStatus?: 'pending' | 'printed' | 'unknown'
  drawerStatus?: 'pending' | 'opened' | 'skipped' | 'failed'
  printError?: string
  printedAt?: string
}

export interface PendingTransaction {
  id: string
  clientTransactionId: string
  deviceId: string
  codigoTransaccion: string
  codigoTicket: string
  fechaDeTrans: string
  items: CartItem[]
  total: number
  discount?: number
  paymentMethod: string
  employeeNumber?: number
  customer?: SaleCustomer
  status: 'pending' | 'failed' | 'syncing'
  syncStatus?: 'pending' | 'syncing' | 'synced'
  printStatus?: 'pending' | 'printed' | 'unknown'
  drawerStatus?: 'pending' | 'opened' | 'skipped' | 'failed'
  printError?: string
  printedAt?: string
  attempts: number
  lastError?: string
  timestamp: number
  payload?: Record<string, unknown>
}

export interface FacturaItem {
  id?: number | string
  productId?: number | string
  codigoProd?: string
  nombreProd?: string
  quantity?: number
  price?: number
  subtotal?: number
  discount?: number
  total?: number
}

export interface Factura {
  id?: number | string
  folio?: string
  codigoTransaccion?: string
  codigoTicket?: string
  status?: 'draft' | 'paid' | 'cancelled' | 'pending' | string
  total?: number
  paymentMethod?: string
  createdAt?: string | Date
  items?: FacturaItem[]
  cliente?: {
    nombre?: string
    rfc?: string
    [key: string]: unknown
  }
  tipo?: string
  serie?: string
  metodoPago?: string
  [key: string]: unknown
}

export interface FacturaRequest {
  id?: number | string
  folio?: string
  status?: string
  cliente?: {
    nombre?: string
    rfc?: string
    [key: string]: unknown
  }
  items?: FacturaItem[]
  paymentMethod?: string
  tipo?: string
  serie?: string
  metodoPago?: string
  total?: number
  discount?: number
}

export interface FacturaPreview {
  id?: number | string
  folio?: string
  status?: string
  total?: number
  items?: FacturaItem[]
  paymentMethod?: string
  cliente?: {
    nombre?: string
    rfc?: string
    [key: string]: unknown
  }
}

export interface FacturaListResponse {
  rows?: Factura[]
  data?: Factura[]
  total?: number
  page?: number
  limit?: number
  totalPages?: number
  [key: string]: unknown
}

// Report Types
export interface ReportFilter {
  startDate: string
  endDate: string
  cashierId?: number
  productId?: string
}

export interface ReportData {
  totalSales: number
  totalItems: number
  transactions: Transaction[]
  averageTicket: number
  topProducts: Product[]
  timestamp: number
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
  timestamp: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

// Error Types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
