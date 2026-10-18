const express = require('express')
const cors = require('cors')
const XLSX = require('xlsx')

const app = express()
const PORT = Number(process.env.PORT || 4000)

const organizations = [{
  id: 1,
  name: 'Comercializadora Norte',
  taxId: 'XAXX010101000',
  email: 'contacto@empresa.local',
  phone: '5550000000',
  address: 'Centro Comercial, Local 12',
  logo: '',
  status: 'active'
}]

const organizationSettings = {
  general: {
    businessName: 'Comercializadora Norte',
    email: 'contacto@empresa.local',
    phone: '5550000000',
    address: 'Centro Comercial, Local 12',
    logo: ''
  },
  fiscal: {
    taxId: 'XAXX010101000',
    regime: 'Régimen general',
    invoiceSeries: 'A'
  },
  sales: {
    currency: 'MXN',
    taxRate: 0.16,
    defaultDiscount: 0,
    roundTo: 0.05,
    sellByWeight: false
  },
  receipt: {
    header: 'Comercializadora Norte',
    footer: 'Gracias por su compra',
    printCopies: 1
  },
  hardware: {
    printerName: 'POS-01',
    agentEnabled: true,
    connected: true
  },
  backup: {
    autoBackup: true,
    retentionDays: 30,
    lastBackupAt: new Date().toISOString()
  }
}

const users = [
  {
    id: 1,
    username: 'admin',
    password: 'admin',
    role: 'admin',
    nombreEmpleado: 'Administrador',
    numeroEmpleado: 1,
    email: 'admin@pos.local',
    photo: '',
    organizationId: 1,
    organizationName: 'Comercializadora Norte',
    active: true
  },
  {
    id: 2,
    username: 'cajero',
    password: 'cajero',
    role: 'cashier',
    nombreEmpleado: 'Cajero Demo',
    numeroEmpleado: 2,
    email: 'cajero@pos.local',
    photo: '',
    organizationId: 1,
    organizationName: 'Comercializadora Norte',
    active: true
  }
]

// El catálogo POS y el inventario son contratos distintos: el primero conserva
// nombres heredados y el segundo sigue el modelo documentado de inventario.
const products = []
const inventory = [
  {
    id: 1,
    organizationId: 1,
    sku: 'SKU-001',
    barcode: '750000000001',
    name: 'Cafe molido',
    category: 'Bebidas',
    unit: 'PZA',
    stock: 25,
    minStock: 5,
    cost: 18.5,
    price: 29.99,
    supplier: 'Proveedor Demo',
    warehouse: 'PRINCIPAL',
    active: true
  },
  {
    id: 2,
    organizationId: 1,
    sku: 'SKU-002',
    name: 'Arroz',
    category: 'Abarrotes',
    unit: 'KG',
    stock: 3,
    minStock: 8,
    cost: 21,
    price: 32,
    warehouse: 'PRINCIPAL',
    active: true
  }
]
let nextInventoryId = inventory.length + 1
const inventoryMovements = []
const inventoryImports = []

const inventoryToPosProduct = (item) => ({
  id: Number(item.id),
  codigoProd: String(item.sku || item.codigoProd || item.id),
  codigoAltern: item.barcode ? String(item.barcode) : undefined,
  nombreProd: String(item.name || item.nombreProd || 'Producto'),
  price: Number(item.price || 0),
  stock: Number(item.stock || 0),
  org_id: Number(item.organizationId || item.org_id || 1),
  id_category: Number(item.categoryId || item.id_category || 0),
  description: item.description || '',
  category: item.category || 'Otros',
  cost: Number(item.cost || 0),
  unit: item.unit || 'PZA',
  saleByWeight: String(item.unit || '').toUpperCase() === 'KG',
  active: item.active !== false,
  discountRate: Number(item.discountRate || 0),
  taxRate: Number(item.taxRate || 0.16)
})

const getCatalogProducts = (organizationId = null) => {
  const catalogProducts = products.length ? products : inventory.map(inventoryToPosProduct)
  if (!organizationId) return catalogProducts
  return catalogProducts.filter((product) => Number(product.org_id || product.organizationId || 1) === Number(organizationId))
}

const transactions = []
const facturas = []
const sessions = new Map()
const cashSessions = new Map()
const cashHistory = new Map()
const backups = []
let nextBackupId = 1

const allowedOrigins = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:4174', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://127.0.0.1:4174']

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`Origen no permitido: ${origin}`))
  },
  credentials: true
}))
app.use(express.json())

const ok = (res, data, message = 'OK', extra = {}) => {
  return res.json({
    success: true,
    data,
    message,
    timestamp: Date.now(),
    ...extra
  })
}

const fail = (res, status, message, extra = {}) => {
  return res.status(status).json({
    success: false,
    message,
    timestamp: Date.now(),
    ...extra
  })
}

const normalizeEmployeeRole = (role) => {
  if (!role) return 'cashier'
  const normalized = String(role).toLowerCase()
  if (normalized === 'gerente') return 'manager'
  if (normalized === 'vendedor') return 'vendedor'
  if (normalized === 'cajero') return 'cashier'
  if (normalized === 'admin') return 'admin'
  return normalized
}

const normalizeEmployeePayload = (payload = {}) => {
  const firstName = String(payload.firstName || payload.nombre || '').trim()
  const lastName = String(payload.lastName || '').trim()
  const nombreEmpleado = String(payload.nombreEmpleado || payload.name || `${firstName} ${lastName}`.trim() || 'Empleado').trim()
  const employeeNumber = payload.employeeNumber ?? payload.numeroEmpleado ?? payload.cedula ?? ''
  const role = normalizeEmployeeRole(payload.role || payload.rol)

  return {
    username: String(payload.username || payload.userName || `emp-${Date.now()}`).trim(),
    email: String(payload.email || '').trim(),
    firstName,
    lastName,
    nombreEmpleado,
    employeeNumber: String(employeeNumber || ''),
    role,
    active: payload.active ?? payload.activo ?? true,
    phone: String(payload.phone || payload.telefono || '').trim(),
    password: payload.password || payload.temporaryPassword || 'temp1234',
    organizationId: Number(payload.organizationId || payload.organization_id || 1),
    organizationName: payload.organizationName || organizations[0]?.name || 'Empresa activa'
  }
}

const safeEmployee = (employee) => ({
  id: employee.id,
  username: employee.username,
  email: employee.email,
  nombre: employee.nombre || employee.firstName || employee.nombreEmpleado,
  apellido: employee.apellido || employee.lastName || '',
  nombreEmpleado: employee.nombreEmpleado || `${employee.nombre || employee.firstName || ''} ${employee.apellido || employee.lastName || ''}`.trim(),
  cedula: String(employee.employeeNumber ?? employee.numeroEmpleado ?? employee.cedula ?? ''),
  telefono: employee.phone || employee.telefono || '',
  rol: employee.role === 'manager' ? 'gerente' : employee.role === 'admin' ? 'admin' : employee.role === 'vendedor' ? 'vendedor' : 'cajero',
  role: employee.role,
  activo: employee.active ?? true,
  active: employee.active ?? true,
  employeeNumber: employee.employeeNumber ?? employee.numeroEmpleado,
  numeroEmpleado: employee.numeroEmpleado ?? employee.employeeNumber,
  organizationId: employee.organizationId || organizations[0].id,
  organization_id: employee.organizationId || organizations[0].id,
  organizationName: employee.organizationName || organizations[0].name,
  createdAt: employee.createdAt || new Date().toISOString(),
  updatedAt: employee.updatedAt || new Date().toISOString()
})

const getNextEmployeeNumber = () => {
  const usedNumbers = new Set(
    users
      .map((user) => Number(user.numeroEmpleado))
      .filter((number) => Number.isInteger(number) && number > 0)
  )

  let nextNumber = 1
  while (usedNumbers.has(nextNumber)) nextNumber += 1
  return nextNumber
}

const getUserFromToken = (token) => {
  if (!token) return null
  const userId = Number(token.replace('demo-token-', '').split('-')[0])
  return users.find((user) => user.id === userId) || null
}

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader

  if (!token) {
    return fail(res, 401, 'Token requerido')
  }

  const user = getUserFromToken(token)
  if (!user) {
    return fail(res, 401, 'Token inválido o expirado')
  }

  req.user = user
  next()
}

app.get('/api/health', (req, res) => {
  ok(res, { status: 'ok', port: PORT }, 'Backend funcionando')
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = users.find((item) => item.username === username && item.password === password)

  if (!user) {
    return fail(res, 401, 'Credenciales inválidas')
  }

  const token = `demo-token-${user.id}-${Date.now()}`
  sessions.set(token, user)

  return ok(res, { token, user }, 'Inicio de sesión exitoso')
})

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader

  if (token) {
    sessions.delete(token)
  }

  return ok(res, null, 'Sesión cerrada')
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return ok(res, req.user, 'Usuario autenticado')
})

app.get('/api/auth/current-user', authMiddleware, (req, res) => {
  return ok(res, req.user, 'Usuario actual')
})

app.get('/api/auth/verify-token', authMiddleware, (req, res) => {
  return ok(res, { valid: true, user: req.user }, 'Token válido')
})

app.get('/api/organization', authMiddleware, (req, res) => {
  const activeOrganization = organizations.find((organization) => Number(organization.id) === Number(req.user.organizationId || organizations[0].id)) || organizations[0]
  return ok(res, activeOrganization, 'Organización activa')
})

app.patch('/api/organization', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para editar la empresa')
  }

  const activeOrganization = organizations[0]
  const nextOrganization = {
    ...activeOrganization,
    name: String(req.body?.name || req.body?.businessName || activeOrganization.name),
    taxId: String(req.body?.taxId || req.body?.businessRuc || activeOrganization.taxId),
    email: String(req.body?.email || activeOrganization.email),
    phone: String(req.body?.phone || activeOrganization.phone),
    address: String(req.body?.address || activeOrganization.address),
    logo: String(req.body?.logo || activeOrganization.logo || ''),
    status: 'active'
  }

  organizations.splice(0, organizations.length, nextOrganization)
  organizationSettings.general = {
    businessName: nextOrganization.name,
    email: nextOrganization.email,
    phone: nextOrganization.phone,
    address: nextOrganization.address,
    logo: nextOrganization.logo
  }
  organizationSettings.fiscal = {
    ...organizationSettings.fiscal,
    taxId: nextOrganization.taxId
  }

  for (const user of users) {
    if (user.organizationId === nextOrganization.id) {
      user.organizationName = nextOrganization.name
    }
  }

  return ok(res, nextOrganization, 'Empresa actualizada')
})

app.get('/api/organization/settings', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para consultar la configuración de la empresa')
  }

  return ok(res, organizationSettings, 'Configuración de empresa obtenida')
})

app.patch('/api/organization/settings/:section', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para editar la configuración de la empresa')
  }

  const section = String(req.params.section || '').trim()
  const allowedSections = new Set(['general', 'fiscal', 'sales', 'receipt', 'hardware', 'backup'])
  if (!allowedSections.has(section)) {
    return fail(res, 400, 'Sección no soportada')
  }

  organizationSettings[section] = {
    ...organizationSettings[section],
    ...req.body
  }

  return ok(res, organizationSettings[section], 'Sección actualizada')
})

const backupFormats = new Set(['json', 'csv', 'xlsx'])

const createBackupSnapshot = () => ({
  generatedAt: new Date().toISOString(),
  organizationSettings,
  organizations,
  users: users.map(({ password, ...user }) => user),
  products,
  inventory,
  transactions,
  facturas,
  cashSessions: Array.from(cashSessions.values()),
  cashHistory: Array.from(cashHistory.values()).flat()
})

const csvEscape = (value) => {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

const snapshotToCsv = (snapshot) => {
  const rows = [['seccion', 'registro']]
  Object.entries(snapshot).forEach(([section, value]) => {
    if (Array.isArray(value)) {
      value.forEach((record) => rows.push([section, JSON.stringify(record)]))
    } else {
      rows.push([section, JSON.stringify(value)])
    }
  })
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

const snapshotToXlsx = (snapshot) => {
  const workbook = XLSX.utils.book_new()
  Object.entries(snapshot).forEach(([section, value]) => {
    const rows = Array.isArray(value) ? value : [value]
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}])
    XLSX.utils.book_append_sheet(workbook, worksheet, section.slice(0, 31))
  })
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

const serializeBackup = (snapshot, format) => {
  if (format === 'csv') return Buffer.from(snapshotToCsv(snapshot), 'utf8')
  if (format === 'xlsx') return snapshotToXlsx(snapshot)
  return Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8')
}

const canManageBackups = (user) => user?.role === 'admin'

app.get('/api/backups', authMiddleware, (req, res) => {
  if (!canManageBackups(req.user)) return fail(res, 403, 'Se requiere rol admin para gestionar respaldos')

  return ok(res, backups.map(({ snapshot, ...backup }) => backup), 'Respaldos obtenidos')
})

app.post('/api/backups', authMiddleware, (req, res) => {
  if (!canManageBackups(req.user)) return fail(res, 403, 'Se requiere rol admin para gestionar respaldos')

  const format = String(req.body?.format || 'json').toLowerCase()
  if (!backupFormats.has(format)) return fail(res, 400, 'Formato de respaldo no soportado')

  const snapshot = createBackupSnapshot()
  const backup = {
    id: nextBackupId++,
    format,
    size: serializeBackup(snapshot, format).length,
    createdAt: snapshot.generatedAt,
    createdBy: req.user.id,
    snapshot
  }
  backups.unshift(backup)

  return res.status(201).json({
    success: true,
    data: { id: backup.id, format: backup.format, size: backup.size, createdAt: backup.createdAt },
    message: 'Respaldo creado correctamente',
    timestamp: Date.now()
  })
})

app.get('/api/backups/:id/download', authMiddleware, (req, res) => {
  if (!canManageBackups(req.user)) return fail(res, 403, 'Se requiere rol admin para gestionar respaldos')

  const backup = backups.find((item) => item.id === Number(req.params.id))
  if (!backup) return fail(res, 404, 'Respaldo no encontrado')

  const format = String(req.query.format || backup.format).toLowerCase()
  if (!backupFormats.has(format)) return fail(res, 400, 'Formato de respaldo no soportado')

  const content = serializeBackup(backup.snapshot, format)
  const contentTypes = {
    json: 'application/json',
    csv: 'text/csv; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  res.setHeader('Content-Type', contentTypes[format])
  res.setHeader('Content-Disposition', `attachment; filename="respaldo-${backup.id}.${format}"`)
  return res.send(content)
})

app.post('/api/backups/:id/restore', authMiddleware, (req, res) => {
  if (!canManageBackups(req.user)) return fail(res, 403, 'Se requiere rol admin para gestionar respaldos')

  const backup = backups.find((item) => item.id === Number(req.params.id))
  if (!backup) return fail(res, 404, 'Respaldo no encontrado')

  const snapshot = backup.snapshot
  organizations.splice(0, organizations.length, ...snapshot.organizations)
  users.splice(0, users.length, ...snapshot.users.map((user) => ({
    ...user,
    password: users.find((currentUser) => currentUser.id === user.id)?.password || 'temp1234'
  })))
  products.splice(0, products.length, ...snapshot.products)
  inventory.splice(0, inventory.length, ...snapshot.inventory)
  transactions.splice(0, transactions.length, ...snapshot.transactions)
  facturas.splice(0, facturas.length, ...snapshot.facturas)

  return ok(res, { id: backup.id, restoredAt: new Date().toISOString() }, 'Respaldo restaurado correctamente')
})

app.get('/api/organization/summary', authMiddleware, (req, res) => {
  const activeOrganization = organizations[0]
  const employeeCount = users.filter((user) => Number(user.organizationId || organizations[0].id) === activeOrganization.id).length
  return ok(res, {
    id: activeOrganization.id,
    name: activeOrganization.name,
    employeeCount,
    activeUsers: users.filter((user) => Number(user.organizationId || organizations[0].id) === activeOrganization.id && user.active !== false).length,
    createdAt: new Date().toISOString()
  }, 'Resumen de empresa')
})

app.get('/api/employees', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para consultar empleados')
  }

  const organizationId = Number(req.user.organizationId || organizations[0].id)
  const search = String(req.query.search || '').trim().toLowerCase()
  const role = String(req.query.role || '').trim().toLowerCase()
  const activeRaw = req.query.active
  const active = activeRaw === undefined ? undefined : String(activeRaw).toLowerCase() === 'true'

  let rows = users.filter((user) => Number(user.organizationId || organizations[0].id) === organizationId)
    .map((user) => safeEmployee(user))

  if (search) {
    rows = rows.filter((user) => {
      const haystack = `${user.nombreEmpleado || ''} ${user.email || ''} ${user.cedula || ''}`.toLowerCase()
      return haystack.includes(search)
    })
  }

  if (role) {
    rows = rows.filter((user) => String(user.role || '').toLowerCase() === role)
  }

  if (active !== undefined) {
    rows = rows.filter((user) => Boolean(user.active) === active)
  }

  const page = Math.max(1, Number(req.query.page || 1))
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)))
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  const paginated = rows.slice(start, start + limit)

  return ok(res, paginated, 'Empleados obtenidos', { meta: { total, page, limit, totalPages } })
})

app.post('/api/employees', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para crear empleados')
  }

  const payload = normalizeEmployeePayload(req.body)
  if (!payload.username || !payload.email || !payload.nombreEmpleado || !payload.password) {
    return fail(res, 400, 'Usuario, nombre, email y contraseña son obligatorios')
  }

  const employeeNumber = getNextEmployeeNumber()

  const exists = users.some((user) => user.email === payload.email || user.username === payload.username || String(user.numeroEmpleado) === String(employeeNumber))
  if (exists) {
    return fail(res, 409, 'Ya existe un empleado con esos datos')
  }

  const nextId = (users.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1)
  const user = {
    id: nextId,
    username: payload.username,
    password: payload.password,
    role: payload.role,
    nombreEmpleado: payload.nombreEmpleado,
    nombre: payload.firstName,
    apellido: payload.lastName,
    numeroEmpleado: employeeNumber,
    email: payload.email,
    photo: '',
    organizationId: payload.organizationId,
    organizationName: organizations[0].name,
    active: payload.active,
    phone: payload.phone,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  users.push(user)

  return res.status(201).json({
    success: true,
    data: safeEmployee(user),
    message: 'Empleado creado correctamente',
    timestamp: Date.now()
  })
})

app.patch('/api/employees/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para actualizar empleados')
  }

  const employee = users.find((user) => Number(user.id) === Number(req.params.id) && Number(user.organizationId || organizations[0].id) === Number(req.user.organizationId || organizations[0].id))
  if (!employee) {
    return fail(res, 404, 'Empleado no encontrado')
  }

  const patch = normalizeEmployeePayload({
    ...employee,
    ...req.body,
    nombreEmpleado: req.body?.nombreEmpleado || req.body?.nombre || employee.nombreEmpleado,
    employeeNumber: employee.numeroEmpleado,
    role: req.body?.role || req.body?.rol || employee.role,
    active: req.body?.active ?? req.body?.activo ?? employee.active
  })

  const duplicate = users.find((user) => user.id !== employee.id && (
    user.email === patch.email ||
    user.username === patch.username ||
    String(user.numeroEmpleado) === String(patch.employeeNumber)
  ))
  if (duplicate) {
    return fail(res, 409, 'Ya existe otro empleado con esos datos')
  }

  employee.username = patch.username
  employee.email = patch.email || employee.email
  employee.firstName = patch.firstName
  employee.lastName = patch.lastName
  employee.nombre = patch.firstName || employee.nombre
  employee.apellido = patch.lastName
  employee.nombreEmpleado = `${patch.firstName} ${patch.lastName}`.trim() || employee.nombreEmpleado
  employee.role = patch.role
  employee.nombreEmpleado = patch.nombreEmpleado
  employee.numeroEmpleado = Number(patch.employeeNumber || employee.numeroEmpleado)
  employee.phone = patch.phone || employee.phone
  if (req.body?.password || req.body?.temporaryPassword) {
    employee.password = patch.password
  }
  employee.active = Boolean(patch.active)
  employee.organizationId = patch.organizationId
  employee.organizationName = organizations[0].name
  employee.updatedAt = new Date().toISOString()

  return ok(res, safeEmployee(employee), 'Empleado actualizado')
})

app.post('/api/employees/:id/activate', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para activar empleados')
  }

  const employee = users.find((user) => Number(user.id) === Number(req.params.id) && Number(user.organizationId || organizations[0].id) === Number(req.user.organizationId || organizations[0].id))
  if (!employee) {
    return fail(res, 404, 'Empleado no encontrado')
  }

  employee.active = true
  return ok(res, safeEmployee(employee), 'Empleado activado')
})

app.post('/api/employees/:id/deactivate', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Se requiere rol admin para desactivar empleados')
  }

  const employee = users.find((user) => Number(user.id) === Number(req.params.id) && Number(user.organizationId || organizations[0].id) === Number(req.user.organizationId || organizations[0].id))
  if (!employee) {
    return fail(res, 404, 'Empleado no encontrado')
  }

  employee.active = false
  return ok(res, safeEmployee(employee), 'Empleado desactivado')
})

const inventoryUnits = new Set(['PZA', 'KG', 'LT', 'CAJA'])
const movementTypes = new Set(['ENTRY', 'EXIT', 'ADJUSTMENT', 'IMPORT'])

const inventoryAdminMiddleware = (req, res, next) => {
  if (!isAdmin(req.user)) {
    return fail(res, 403, 'Se requiere rol admin para modificar el inventario')
  }
  next()
}

const normalizeInventoryPayload = (payload = {}, existing = {}) => ({
  ...existing,
  sku: String(payload.sku ?? existing.sku ?? '').trim(),
  barcode: payload.barcode ?? existing.barcode,
  name: String(payload.name ?? payload.nombre ?? existing.name ?? '').trim(),
  category: payload.category ?? existing.category,
  unit: String(payload.unit ?? payload.unidad ?? existing.unit ?? 'PZA').toUpperCase(),
  stock: Number(payload.stock ?? existing.stock ?? 0),
  minStock: Number(payload.minStock ?? payload.stock_minimo ?? existing.minStock ?? 0),
  cost: Number(payload.cost ?? payload.costo ?? existing.cost ?? 0),
  price: Number(payload.price ?? payload.precio_venta ?? existing.price ?? 0),
  supplier: payload.supplier ?? existing.supplier,
  warehouse: String(payload.warehouse ?? payload.almacen ?? existing.warehouse ?? 'PRINCIPAL').trim().toUpperCase(),
  active: payload.active ?? existing.active ?? true
})

const validateInventoryItem = (item) => {
  const errors = []
  if (!item.sku) errors.push('SKU requerido')
  if (!item.name) errors.push('Nombre requerido')
  if (!inventoryUnits.has(item.unit)) errors.push('Unidad no soportada')
  for (const field of ['stock', 'minStock', 'cost', 'price']) {
    if (!Number.isFinite(item[field]) || item[field] < 0) errors.push(`${field} debe ser un número no negativo`)
  }
  return errors
}

const inventoryMatchesSearch = (item, search) => {
  const text = `${item.sku} ${item.name} ${item.category || ''} ${item.warehouse}`.toLowerCase()
  return text.includes(search.toLowerCase())
}

const findInventoryItem = (sku, warehouse = '') => inventory.find((item) =>
  item.sku.toLowerCase() === String(sku).toLowerCase() && (!warehouse || item.warehouse === warehouse)
)

const parseCsv = (csv) => {
  const lines = String(csv || '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const parseLine = (line) => {
    const cells = []
    let cell = ''
    let quoted = false
    for (const character of line) {
      if (character === '"') quoted = !quoted
      else if (character === ',' && !quoted) { cells.push(cell.trim()); cell = '' }
      else cell += character
    }
    cells.push(cell.trim())
    return cells
  }
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase())
  return lines.slice(1).map((line) => {
    const values = parseLine(line)
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? ''
      return row
    }, {})
  })
}

const buildImportResult = (source, rows, dryRun) => {
  const seen = new Set()
  const results = rows.slice(0, 10000).map((row, index) => {
    const item = normalizeInventoryPayload(row)
    const key = `${item.sku.toLowerCase()}|${item.warehouse}`
    const errors = validateInventoryItem(item)
    const duplicate = key !== '|' && seen.has(key)
    if (key !== '|') seen.add(key)
    return {
      index,
      raw: row,
      sku: item.sku,
      status: errors.length ? 'invalid' : (duplicate ? 'duplicate' : 'valid'),
      errors: duplicate ? [...errors, 'SKU duplicado en el mismo almacen'] : errors,
      item
    }
  })
  const validRows = results.filter((row) => row.status === 'valid')
  const result = {
    source,
    dryRun,
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: results.filter((row) => row.status === 'invalid').length,
    duplicates: results.filter((row) => row.status === 'duplicate').length,
    importedRows: 0,
    auditId: null,
    rows: results.map(({ item, ...row }) => row)
  }
  return { result, validRows }
}

app.get('/api/inventario', authMiddleware, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1))
  const perPage = Math.min(100, Math.max(1, Number(req.query.perPage || 20)))
  const search = String(req.query.search || '').trim()
  const filtered = search ? inventory.filter((item) => inventoryMatchesSearch(item, search)) : [...inventory]
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const data = filtered.slice((page - 1) * perPage, page * perPage)
  return ok(res, data, 'Inventario obtenido', { meta: { total, page, perPage, totalPages } })
})

app.get('/api/inventario/stock-bajo', authMiddleware, (req, res) => {
  return ok(res, inventory.filter((item) => item.stock <= item.minStock), 'Stock bajo obtenido')
})

app.get('/api/inventario/:sku', authMiddleware, (req, res) => {
  const item = findInventoryItem(req.params.sku, String(req.query.warehouse || '').toUpperCase())
  return item ? ok(res, item, 'Producto de inventario encontrado') : fail(res, 404, 'Producto de inventario no encontrado')
})

app.post('/api/inventario', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const item = normalizeInventoryPayload(req.body)
  const errors = validateInventoryItem(item)
  if (errors.length) return fail(res, 400, errors.join('; '), { errors })
  if (findInventoryItem(item.sku, item.warehouse)) return fail(res, 400, 'SKU duplicado en el mismo almacen')
  const created = { id: nextInventoryId++, organizationId: req.user.organizationId || 1, ...item }
  inventory.push(created)
  return res.status(201).json({ success: true, data: created, message: 'Producto creado', timestamp: Date.now() })
})

app.put('/api/inventario/:id', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const item = inventory.find((entry) => entry.id === Number(req.params.id))
  if (!item) return fail(res, 404, 'Producto de inventario no encontrado')
  const updated = normalizeInventoryPayload(req.body, item)
  const errors = validateInventoryItem(updated)
  if (errors.length) return fail(res, 400, errors.join('; '), { errors })
  const duplicate = inventory.find((entry) => entry.id !== item.id && entry.sku.toLowerCase() === updated.sku.toLowerCase() && entry.warehouse === updated.warehouse)
  if (duplicate) return fail(res, 400, 'SKU duplicado en el mismo almacen')
  Object.assign(item, updated)
  return ok(res, item, 'Producto actualizado')
})

app.get('/api/inventario/reportes/resumen', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const warehouse = String(req.query.warehouse || '').trim().toUpperCase()
  const rows = warehouse ? inventory.filter((item) => item.warehouse === warehouse) : inventory
  const byWarehouse = [...new Set(rows.map((item) => item.warehouse))].map((name) => {
    const group = rows.filter((item) => item.warehouse === name)
    return { warehouse: name, items: group.length, units: group.reduce((sum, item) => sum + item.stock, 0), inventoryCost: group.reduce((sum, item) => sum + item.stock * item.cost, 0) }
  })
  return ok(res, {
    totalItems: rows.length,
    totalUnits: rows.reduce((sum, item) => sum + item.stock, 0),
    inventoryCost: rows.reduce((sum, item) => sum + item.stock * item.cost, 0),
    inventoryValue: rows.reduce((sum, item) => sum + item.stock * item.price, 0),
    lowStockItems: rows.filter((item) => item.stock <= item.minStock).length,
    activeItems: rows.filter((item) => item.active).length,
    inactiveItems: rows.filter((item) => !item.active).length,
    byWarehouse,
    byCategory: []
  }, 'Resumen de inventario obtenido')
})

app.get('/api/inventario/reportes/bajo-stock', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const warehouse = String(req.query.warehouse || '').trim().toUpperCase()
  const limit = Math.max(1, Number(req.query.limit || 100))
  const rows = inventory.filter((item) => item.stock <= item.minStock && (!warehouse || item.warehouse === warehouse))
    .slice(0, limit)
    .map((item) => ({ ...item, shortage: item.minStock - item.stock }))
  return ok(res, rows, 'Reporte de bajo stock obtenido')
})

app.get('/api/inventario/movimientos', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const sku = String(req.query.sku || '').trim().toLowerCase()
  const warehouse = String(req.query.warehouse || '').trim().toUpperCase()
  const rows = inventoryMovements.filter((movement) => (!sku || movement.sku.toLowerCase() === sku) && (!warehouse || movement.warehouse === warehouse))
  return ok(res, rows, 'Movimientos obtenidos', { meta: { total: rows.length, page: 1, perPage: rows.length || 20, totalPages: 1 } })
})

app.post('/api/inventario/movimientos', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const { sku, warehouse = 'PRINCIPAL', movementType, reason, referenceType, referenceId } = req.body || {}
  const quantity = Number(req.body?.quantity)
  const item = findInventoryItem(sku, String(warehouse).toUpperCase())
  if (!item) return fail(res, 404, 'Producto de inventario no encontrado')
  if (!movementTypes.has(movementType) || movementType === 'IMPORT') return fail(res, 400, 'Tipo de movimiento no válido')
  if (!Number.isFinite(quantity) || quantity < 0) return fail(res, 400, 'La cantidad debe ser un número no negativo')
  const stockBefore = item.stock
  const stockAfter = movementType === 'ENTRY' ? stockBefore + quantity : movementType === 'EXIT' ? stockBefore - quantity : quantity
  if (stockAfter < 0) return fail(res, 400, 'El movimiento dejaría el stock en negativo')
  item.stock = stockAfter
  const movement = { id: inventoryMovements.length + 1, sku: item.sku, warehouse: item.warehouse, movementType, quantity, stockBefore, stockAfter, reason, referenceType, referenceId, userId: req.user.id, username: req.user.username, createdAt: new Date().toISOString() }
  inventoryMovements.unshift(movement)
  return res.status(201).json({ success: true, data: movement, message: 'Movimiento registrado', timestamp: Date.now() })
})

app.post('/api/inventario/import/json', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : Array.isArray(req.body?.data) ? req.body.data : []
  if (!rows.length) return fail(res, 400, 'El archivo JSON no contiene filas')
  if (rows.length > 10000) return fail(res, 400, 'El archivo supera el máximo de 10.000 filas')
  const dryRun = req.body?.dryRun !== false
  const { result, validRows } = buildImportResult('json', rows, dryRun)
  if (!dryRun) {
    validRows.forEach(({ item }) => {
      const existing = findInventoryItem(item.sku, item.warehouse)
      if (existing) Object.assign(existing, item)
      else inventory.push({ id: nextInventoryId++, organizationId: req.user.organizationId || 1, ...item })
    })
    result.importedRows = validRows.length
    result.auditId = inventoryImports.length + 1
    inventoryImports.unshift({ id: result.auditId, ...result, createdAt: new Date().toISOString(), userId: req.user.id })
  }
  return ok(res, result, dryRun ? 'Vista previa generada' : 'Importación confirmada')
})

app.post('/api/inventario/import/csv', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const rows = parseCsv(req.body?.csv)
  if (!rows.length) return fail(res, 400, 'El archivo CSV no contiene filas')
  if (rows.length > 10000) return fail(res, 400, 'El archivo supera el máximo de 10.000 filas')
  req.body.rows = rows
  req.body.data = undefined
  req.url = '/api/inventario/import/json'
  const dryRun = req.body?.dryRun !== false
  const { result, validRows } = buildImportResult('csv', rows, dryRun)
  if (!dryRun) {
    validRows.forEach(({ item }) => inventory.push({ id: nextInventoryId++, organizationId: req.user.organizationId || 1, ...item }))
    result.importedRows = validRows.length
    result.auditId = inventoryImports.length + 1
    inventoryImports.unshift({ id: result.auditId, ...result, createdAt: new Date().toISOString(), userId: req.user.id })
  }
  return ok(res, result, dryRun ? 'Vista previa generada' : 'Importación confirmada')
})

app.post('/api/inventario/import/xlsx', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const content = String(req.body?.content || '')
  if (!content) return fail(res, 400, 'El archivo XLSX no contiene contenido')
  if (content.length > Math.ceil(10 * 1024 * 1024 * 4 / 3)) return fail(res, 400, 'El archivo supera el máximo de 10 MB')
  let rows
  try {
    const workbook = XLSX.read(Buffer.from(content, 'base64'), { type: 'buffer' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    rows = firstSheet ? XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) : []
  } catch {
    return fail(res, 400, 'El archivo XLSX no es válido')
  }
  if (!rows.length) return fail(res, 400, 'El archivo XLSX no contiene filas')
  if (rows.length > 10000) return fail(res, 400, 'El archivo supera el máximo de 10.000 filas')
  const dryRun = req.body?.dryRun !== false
  const { result, validRows } = buildImportResult('xlsx', rows, dryRun)
  if (!dryRun) {
    validRows.forEach(({ item }) => {
      const existing = findInventoryItem(item.sku, item.warehouse)
      if (existing) Object.assign(existing, item)
      else inventory.push({ id: nextInventoryId++, organizationId: req.user.organizationId || 1, ...item })
    })
    result.importedRows = validRows.length
    result.auditId = inventoryImports.length + 1
    inventoryImports.unshift({ id: result.auditId, ...result, createdAt: new Date().toISOString(), userId: req.user.id })
  }
  return ok(res, result, dryRun ? 'Vista previa generada' : 'Importación confirmada')
})

app.get('/api/inventario/importaciones', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  return ok(res, inventoryImports, 'Importaciones obtenidas', { meta: { total: inventoryImports.length, page: 1, perPage: inventoryImports.length || 20, totalPages: 1 } })
})

app.get('/api/inventario/reportes/importaciones/:id', authMiddleware, inventoryAdminMiddleware, (req, res) => {
  const audit = inventoryImports.find((entry) => entry.id === Number(req.params.id))
  return audit ? ok(res, audit, 'Auditoría encontrada') : fail(res, 404, 'Importación no encontrada')
})

app.get('/api/products', (req, res) => {
  const page = Number(req.query.page || 1)
  const perPage = Number(req.query.perPage || 50)
  const search = String(req.query.search || '').trim().toLowerCase()

  let filtered = getCatalogProducts(req.query.organizationId ? Number(req.query.organizationId) : null)

  if (search) {
    filtered = filtered.filter((product) => {
      const text = `${product.nombreProd} ${product.codigoProd}`.toLowerCase()
      return text.includes(search)
    })
  }

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const start = (page - 1) * perPage
  const paginated = filtered.slice(start, start + perPage)

  return ok(res, {
    items: paginated,
    total,
    page,
    perPage,
    totalPages
  }, 'Productos obtenidos')
})

app.get('/api/products/by-code', (req, res) => {
  const code = String(req.query.code || '').trim()
  const product = getCatalogProducts(req.query.organizationId ? Number(req.query.organizationId) : null).find((item) =>
    String(item.codigoProd || '').toLowerCase() === code.toLowerCase() ||
    String(item.codigoAltern || '').toLowerCase() === code.toLowerCase()
  )

  if (!product) {
    return fail(res, 404, 'Producto no encontrado')
  }

  return ok(res, product, 'Producto encontrado')
})

app.get('/api/products/category/:categoryId', (req, res) => {
  const categoryId = Number(req.params.categoryId)
  const items = getCatalogProducts(req.query.organizationId ? Number(req.query.organizationId) : null).filter((product) => product.id_category === categoryId)
  return ok(res, items, 'Productos por categoría')
})

app.get('/api/products/:id', (req, res) => {
  const id = Number(req.params.id)
  const product = getCatalogProducts(req.query.organizationId ? Number(req.query.organizationId) : null).find((item) => Number(item.id) === id)

  if (!product) {
    return fail(res, 404, 'Producto no encontrado')
  }

  return ok(res, product, 'Producto obtenido')
})

const getCashSessionKey = (user) => String(user.numeroEmpleado)

const getCashSession = (user) => cashSessions.get(getCashSessionKey(user)) || null

const isAdmin = (user) => user?.role === 'admin'

const canAccessTransaction = (user, transaction) =>
  isAdmin(user) || transaction.numeroEmpleado === user.numeroEmpleado

const getVisibleTransactions = (user) =>
  isAdmin(user)
    ? [...transactions]
    : transactions.filter((transaction) => transaction.numeroEmpleado === user.numeroEmpleado)

const getVisibleCashHistory = (user) => {
  if (!isAdmin(user)) {
    const session = getCashSession(user)
    const history = cashHistory.get(getCashSessionKey(user)) || []
    return session ? [session, ...history] : history
  }

  const activeSessions = Array.from(cashSessions.values())
  const closedSessions = Array.from(cashHistory.values()).flat()
  return [...activeSessions, ...closedSessions]
    .sort((a, b) => new Date(b.fechaCierre || b.fechaArqueo || b.fechaApertura).getTime() - new Date(a.fechaCierre || a.fechaArqueo || a.fechaApertura).getTime())
}

const getSessionTransactions = (session) => transactions.filter((transaction) => {
  return transaction.cashSessionId === session.id
})

const summarizeCashSession = (session) => {
  const sales = getSessionTransactions(session)
  const totalVentas = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const totalEfectivo = sales
    .filter((sale) => ['cash', 'efectivo', 'money'].includes(String(sale.paymentMethod || '').toLowerCase()))
    .reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const totalEsperado = Number(session.base || 0) + totalEfectivo

  return {
    totalVentas,
    totalEfectivo,
    totalEsperado,
    totalTransacciones: sales.length,
    efectivoContado: session.efectivoContado,
    diferencia: session.efectivoContado === null
      ? null
      : Number((session.efectivoContado - totalEsperado).toFixed(2))
  }
}

app.get('/api/transactions', authMiddleware, (req, res) => {
  const { startDate, endDate } = req.query

  let items = getVisibleTransactions(req.user)
  const cashierId = req.query.cashierId ? Number(req.query.cashierId) : null

  if (isAdmin(req.user) && cashierId) {
    items = items.filter((transaction) => transaction.numeroEmpleado === cashierId)
  }

  if (startDate || endDate) {
    items = items.filter((transaction) => {
      const fecha = new Date(transaction.fechaDeTrans)
      if (startDate && fecha < new Date(startDate)) return false
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999`)
        if (fecha > end) return false
      }
      return true
    })
  }

  return ok(res, items, 'Historial de transacciones')
})

const registerTransaction = (req, res) => {
  const {
    items = [],
    total = 0,
    paymentMethod = 'cash',
    clientTransactionId = null,
    deviceId = null,
    discount = 0,
    customer = { nombre: 'Consumidor final' }
  } = req.body || {}
  const cashSession = getCashSession(req.user)

  if (clientTransactionId) {
    const existing = transactions.find((transaction) =>
      transaction.clientTransactionId === clientTransactionId &&
      transaction.deviceId === deviceId
    )

    if (existing) {
      return ok(res, existing, 'Venta ya sincronizada', { idempotent: true })
    }
  }

  if (!cashSession?.abierta) {
    return fail(res, 409, 'Debe abrir la caja antes de registrar una venta')
  }

  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, 400, 'La venta debe contener al menos un producto')
  }

  if (!Number.isFinite(Number(total)) || Number(total) < 0) {
    return fail(res, 400, 'El total de la venta no es válido')
  }

  const transaction = {
    codigoTransaccion: `TX-${Date.now()}`,
    codigoTicket: `TICKET-${Date.now()}`,
    fechaDeTrans: new Date().toISOString(),
    items,
    total: Number(total),
    discount: Number(discount || 0),
    customer,
    nombreCajero: req.user.nombreEmpleado,
    numeroEmpleado: req.user.numeroEmpleado,
    cashSessionId: cashSession.id,
    status: 'completed',
    timestamp: Date.now(),
    paymentMethod,
    clientTransactionId,
    deviceId
  }

  transactions.push(transaction)

  return ok(res, transaction, 'Venta registrada correctamente')
}

app.post('/api/transactions', authMiddleware, registerTransaction)
app.post('/api/transactions/sync', authMiddleware, registerTransaction)

app.get('/api/caja/status', authMiddleware, (req, res) => {
  const session = getCashSession(req.user)
  const data = session ? { ...session, ...summarizeCashSession(session) } : {
    abierta: false,
    cajero: req.user.nombreEmpleado,
    numeroEmpleado: req.user.numeroEmpleado,
    base: 0,
    horaApertura: '',
    horaCierre: '',
    fechaArqueo: '',
    efectivoContado: null,
    diferencia: null,
    totalVentas: 0,
    totalEfectivo: 0,
    totalEsperado: 0,
    totalTransacciones: 0
  }
  return ok(res, data, 'Estado de caja obtenido')
})

app.post('/api/caja/open', authMiddleware, (req, res) => {
  const clientSessionId = String(req.body?.clientSessionId || '')
  if (clientSessionId) {
    const history = cashHistory.get(getCashSessionKey(req.user)) || []
    const existing = [getCashSession(req.user), ...history].find((session) => session?.clientSessionId === clientSessionId)
    if (existing) return ok(res, existing, 'Apertura ya sincronizada', { idempotent: true })
  }

  if (getCashSession(req.user)?.abierta) {
    return fail(res, 409, 'El usuario ya tiene una caja abierta')
  }

  const base = Number(req.body?.baseCaja ?? req.body?.montoApertura)
  if (!Number.isFinite(base) || base < 0) {
    return fail(res, 400, 'La base de caja no es válida')
  }

  const now = new Date().toISOString()
  const session = {
    id: `CAJA-${Date.now()}-${req.user.numeroEmpleado}`,
    clientSessionId: clientSessionId || null,
    abierta: true,
    cajero: req.user.nombreEmpleado,
    numeroEmpleado: req.user.numeroEmpleado,
    base,
    fechaApertura: now,
    horaApertura: now,
    horaCierre: '',
    efectivoContado: null,
    diferencia: 0
  }

  cashSessions.set(getCashSessionKey(req.user), session)
  return ok(res, session, 'Caja abierta correctamente')
})

app.get('/api/caja/ventas', authMiddleware, (req, res) => {
  const sales = isAdmin(req.user)
    ? getVisibleTransactions(req.user)
    : (() => {
      const session = getCashSession(req.user)
      return session ? getSessionTransactions(session) : []
    })()
  return ok(res, sales, 'Ventas de caja obtenidas')
})

app.get('/api/caja/arqueo', authMiddleware, (req, res) => {
  const session = getCashSession(req.user)
  return ok(res, session
    ? { ...session, ...summarizeCashSession(session) }
    : { efectivoContado: null, diferencia: null, totalEsperado: 0 }, 'Arqueo obtenido')
})

app.post('/api/caja/arqueo', authMiddleware, (req, res) => {
  const session = getCashSession(req.user)
  if (!session?.abierta) return fail(res, 409, 'No hay una caja abierta')

  const efectivoContado = Number(req.body?.efectivoContado)
  if (!Number.isFinite(efectivoContado) || efectivoContado < 0) {
    return fail(res, 400, 'El efectivo contado no es válido')
  }

  const summary = summarizeCashSession({ ...session, efectivoContado })
  session.efectivoContado = efectivoContado
  session.fechaArqueo = new Date().toISOString()
  session.diferencia = summary.diferencia
  return ok(res, { ...session, ...summary }, 'Arqueo guardado correctamente')
})

app.get('/api/caja/history', authMiddleware, (req, res) => {
  return ok(res, getVisibleCashHistory(req.user), 'Historial de caja obtenido')
})

app.post('/api/caja/close', authMiddleware, (req, res) => {
  const session = getCashSession(req.user)
  if (!session?.abierta) return fail(res, 409, 'No hay una caja abierta')

  const efectivoContado = Number(req.body?.efectivoContado ?? session.efectivoContado)
  if (!Number.isFinite(efectivoContado) || efectivoContado < 0) {
    return fail(res, 400, 'Debe guardar el arqueo antes de cerrar la caja')
  }

  const summary = summarizeCashSession({ ...session, efectivoContado })

  session.abierta = false
  session.horaCierre = new Date().toISOString()
  session.fechaCierre = session.horaCierre
  session.efectivoContado = efectivoContado
  session.totalVentas = summary.totalVentas
  session.totalEfectivo = summary.totalEfectivo
  session.totalEsperado = summary.totalEsperado
  session.diferencia = summary.diferencia
  const history = cashHistory.get(getCashSessionKey(req.user)) || []
  cashHistory.set(getCashSessionKey(req.user), [session, ...history])
  cashSessions.delete(getCashSessionKey(req.user))
  return ok(res, session, 'Caja cerrada correctamente')
})

app.get('/api/reports', authMiddleware, (req, res) => {
  const startDate = req.query.startDate ? new Date(`${req.query.startDate}T00:00:00`) : null
  const endDate = req.query.endDate ? new Date(`${req.query.endDate}T23:59:59.999`) : null
  const cashierId = req.query.cashierId ? Number(req.query.cashierId) : null
  const reportTransactions = getVisibleTransactions(req.user).filter((transaction) => {
    const date = new Date(transaction.fechaDeTrans)
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    if (cashierId && transaction.numeroEmpleado !== cashierId) return false
    return true
  })
  const totalSales = reportTransactions.reduce((sum, transaction) => sum + Number(transaction.total || 0), 0)
  const totalItems = reportTransactions.reduce((sum, transaction) => sum + transaction.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0)
  return ok(res, {
    totalSales,
    totalItems,
    averageTicket: reportTransactions.length ? totalSales / reportTransactions.length : 0,
    transactions: reportTransactions,
    topProducts: [],
    timestamp: Date.now()
  }, 'Reporte generado')
})

app.get('/api/transactions/:id', authMiddleware, (req, res) => {
  const transaction = transactions.find((item) => item.codigoTransaccion === req.params.id && canAccessTransaction(req.user, item))

  if (!transaction) {
    return fail(res, 404, 'Transacción no encontrada')
  }

  return ok(res, transaction, 'Transacción encontrada')
})

app.post('/api/transactions/:id/confirm', authMiddleware, (req, res) => {
  const transaction = transactions.find((item) => item.codigoTransaccion === req.params.id && canAccessTransaction(req.user, item))

  if (!transaction) {
    return fail(res, 404, 'Transacción no encontrada')
  }

  transaction.status = 'completed'
  return ok(res, transaction, 'Transacción confirmada')
})

app.post('/api/transactions/:id/cancel', authMiddleware, (req, res) => {
  const transaction = transactions.find((item) => item.codigoTransaccion === req.params.id && canAccessTransaction(req.user, item))

  if (!transaction) {
    return fail(res, 404, 'Transacción no encontrada')
  }

  transaction.status = 'cancelled'
  return ok(res, transaction, 'Transacción cancelada')
})

const normalizeFacturaPayload = (payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items.map((item, index) => {
    const quantity = Number(item.quantity ?? item.qty ?? 1)
    const price = Number(item.price ?? item.product?.price ?? 0)
    const subtotal = Number(item.subtotal ?? (price * quantity))
    const discount = Number(item.discount ?? 0)
    const total = Number(item.total ?? (subtotal - discount))

    return {
      id: item.id ?? item.productId ?? item.product?.id ?? index + 1,
      productId: item.productId ?? item.product?.id ?? item.id ?? index + 1,
      codigoProd: item.codigoProd ?? item.product?.codigoProd ?? `PROD-${index + 1}`,
      nombreProd: item.nombreProd ?? item.product?.nombreProd ?? `Producto ${index + 1}`,
      quantity,
      price,
      subtotal,
      discount,
      total
    }
  }) : []

  const total = Number(payload.total ?? items.reduce((sum, item) => sum + Number(item.total || 0), 0))

  return {
    id: payload.id ?? `FAC-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    folio: payload.folio ?? `FAC-${Math.floor(1000 + Math.random() * 9000)}`,
    codigoTransaccion: payload.codigoTransaccion ?? `TRX-${Date.now()}`,
    status: payload.status ?? 'paid',
    cliente: payload.cliente ?? { nombre: 'Consumidor final', rfc: 'XAXX010101000' },
    items,
    total,
    paymentMethod: payload.paymentMethod ?? 'cash',
    tipo: payload.tipo ?? 'ingreso',
    serie: payload.serie ?? 'A',
    metodoPago: payload.metodoPago ?? 'PUE',
    createdAt: new Date().toISOString()
  }
}

app.get('/api/facturas', authMiddleware, (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase()
  const status = String(req.query.status || req.query.estatus || '').trim()

  let rows = [...facturas]

  if (status) {
    rows = rows.filter((factura) => (factura.status || '').toLowerCase() === status.toLowerCase())
  }

  if (search) {
    rows = rows.filter((factura) => {
      const text = `${factura.folio || ''} ${factura.cliente?.nombre || ''} ${factura.codigoTransaccion || ''}`.toLowerCase()
      return text.includes(search)
    })
  }

  return ok(res, {
    rows,
    total: rows.length,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || rows.length || 20),
    totalPages: Math.max(1, Math.ceil(rows.length / Math.max(1, Number(req.query.limit || rows.length || 20))))
  }, 'Facturas obtenidas')
})

app.post('/api/facturas/preview', authMiddleware, (req, res) => {
  const factura = normalizeFacturaPayload(req.body || {})
  return ok(res, factura, 'Vista previa de factura')
})

app.post('/api/facturas/generate', authMiddleware, (req, res) => {
  const factura = normalizeFacturaPayload(req.body || {})
  facturas.unshift(factura)
  return ok(res, factura, 'Factura generada correctamente')
})

app.get('/api/facturas/:id', authMiddleware, (req, res) => {
  const factura = facturas.find((item) => String(item.id) === String(req.params.id))

  if (!factura) {
    return fail(res, 404, 'Factura no encontrada')
  }

  return ok(res, factura, 'Factura encontrada')
})

app.post('/api/facturas/:id/cancel', authMiddleware, (req, res) => {
  const factura = facturas.find((item) => String(item.id) === String(req.params.id))

  if (!factura) {
    return fail(res, 404, 'Factura no encontrada')
  }

  factura.status = 'cancelled'
  return ok(res, factura, 'Factura cancelada')
})

app.listen(PORT, () => {
  console.log(`Backend POS escuchando en http://localhost:${PORT}`)
})
