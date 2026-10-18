# Frontend Vue 3 para POS con arquitectura compatible con el backend actual

## 1. Objetivo

Crear un frontend en Vue 3 + Vite compatible con la arquitectura actual del backend Express que ya existe en este proyecto, respetando:

- contratos REST actuales
- autenticación con JWT/Bearer
- respuestas con formato `success: true/false`
- endpoints de productos, empleados, caja, ventas, reportes y facturación
- estructura de datos en módulos y tiendas de estado (Pinia)
- patrón de venta y flujo de caja del POS

---

## 2. Arquitectura objetivo

### 2.1 Stack sugerido

- Vue 3
- Vite
- Vue Router
- Pinia
- Axios
- Tailwind CSS o Bootstrap 5
- ESLint + Prettier
- Day.js para fechas
- VueUse opcional para composables reutilizables

### 2.2 Capas

1. Presentación
   - Componentes de página y UI
   - Vistas por módulo
   - Formularios y tablas

2. Estado global
   - authStore
   - productsStore
   - cartStore
   - salesStore
   - cajaStore
   - reportsStore
   - invoiceStore

3. Servicios/API
   - apiClient
   - authApi
   - productsApi
   - transactionsApi
   - cajaApi
   - reportsApi
   - facturasApi

4. Utilidades
   - helpers para moneda, fechas, stock, descuentos
   - validators para cantidades y productos
   - toasts y manejadores de errores

---

## 3. Base URL y contrato de la API

### 3.1 Base URL

```env
VITE_API_URL=http://localhost:3000/api
```

### 3.2 Respuesta estándar

Todas las respuestas exitosas siguen este patrón:

```json
{
  "success": true,
  "data": {},
  "message": "Operación exitosa"
}
```

Errores:

```json
{
  "success": false,
  "message": "Mensaje descriptivo"
}
```

### 3.3 Autenticación

El backend espera un token Bearer en el header `Authorization`.

```http
Authorization: Bearer <token>
```

---

## 4. Endpoints reales del backend a soportar

### 4.1 Auth

```http
POST /api/auth/login
GET /api/auth/me
GET /api/auth/verify-token
POST /api/auth/logout
```

Login esperado:

```json
{
  "username": "admin",
  "password": "1234"
}
```

Respuesta esperada:

```json
{
  "success": true,
  "data": {
    "token": "demo-token-1",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@pos.local",
      "nombreEmpleado": "Administrador",
      "numeroEmpleado": 1,
      "role": "admin",
      "photo": ""
    }
  }
}
```

### 4.2 Productos

```http
GET /api/products?page=1&perPage=50
GET /api/products/by-code?code=P001
GET /api/products/category/1
GET /api/products/:id
PUT /api/products/:id
```

### 4.3 Empleados

```http
GET /api/employees
POST /api/employees
PUT /api/employees/:id
DELETE /api/employees/:id
```

### 4.4 Caja

```http
GET /api/caja/status
POST /api/caja/open
POST /api/caja/close
```

### 4.5 Transacciones / ventas

```http
GET /api/transactions
POST /api/transactions
GET /api/transactions/:id
POST /api/transactions/:id/confirm
POST /api/transactions/:id/cancel
```

Payload recomendado para venta:

```json
{
  "items": [
    {
      "productId": 1,
      "codigoProd": "P001",
      "nombreProd": "Laptop Pro 14",
      "quantity": 2,
      "price": 12999,
      "discountRate": 10
    }
  ],
  "discount": 5,
  "paymentMethod": "cash",
  "employeeNumber": 1,
  "customer": {
    "nombre": "Consumidor final"
  }
}
```

### 4.6 Reportes

```http
GET /api/reports
```

### 4.7 Facturas

```http
POST /api/facturas/preview
POST /api/facturas/generate
GET /api/facturas/:id
```

---

## 5. Estructura recomendada del frontend

```text
src/
  api/
    client.js
    authApi.js
    productsApi.js
    transactionsApi.js
    cajaApi.js
    reportsApi.js
    facturasApi.js

  stores/
    authStore.js
    productsStore.js
    cartStore.js
    salesStore.js
    cajaStore.js
    reportsStore.js
    invoiceStore.js

  router/
    index.js
    routes.js

  views/
    LoginView.vue
    DashboardView.vue
    ProductsView.vue
    PosView.vue
    SalesView.vue
    EmployeesView.vue
    CajaView.vue
    ReportsView.vue
    FacturasView.vue

  components/
    layout/
      AppShell.vue
      Sidebar.vue
      Topbar.vue
    auth/
      LoginForm.vue
    products/
      ProductCard.vue
      ProductTable.vue
      ProductSearch.vue
    pos/
      ProductScanner.vue
      CartPanel.vue
      PaymentPanel.vue
      SaleSummary.vue
    sales/
      SalesTable.vue
      TransactionDetail.vue
    reports/
      KPIGrid.vue
      SalesChart.vue
      LowStockTable.vue
    facturas/
      InvoicePreview.vue
      InvoiceDialog.vue

  composables/
    useAuth.js
    useProducts.js
    useCart.js
    useCurrency.js
    useAlerts.js

  utils/
    formatters.js
    validators.js
    constants.js

  app.vue
  main.js
  styles.css
```

---

## 6. Configuración del cliente HTTP

### 6.1 apiClient.js

```js
import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_session')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
```

---

## 7. Stores de Pinia

### 7.1 authStore

Responsable de:

- login
- logout
- refresh de sesión
- guardar usuario y token
- proteger rutas

```js
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('auth_token') || '',
    user: JSON.parse(localStorage.getItem('user_session') || 'null'),
    loading: false
  }),
  actions: {
    async login(credentials) {
      const { data } = await authApi.login(credentials)
      this.token = data.data.token
      this.user = data.data.user
      localStorage.setItem('auth_token', this.token)
      localStorage.setItem('user_session', JSON.stringify(this.user))
      return data
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_session')
    }
  }
})
```

### 7.2 productsStore

Responsable de:

- listado de productos
- búsqueda por código o nombre
- cargar por categoría
- stock bajo

```js
export const useProductsStore = defineStore('products', {
  state: () => ({
    list: [],
    loading: false,
    page: 1,
    total: 0
  }),
  actions: {
    async fetchProducts(filters = {}) {
      const { data } = await productsApi.list(filters)
      this.list = data.data || []
      this.total = data.total || 0
    }
  }
})
```

### 7.3 cartStore

Responsable de:

- carrito de compra
- sumar/restar cantidad
- total y descuento
- validación de stock

```js
export const useCartStore = defineStore('cart', {
  state: () => ({
    items: []
  }),
  getters: {
    subtotal: (state) => state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    total: (state) => state.items.reduce((sum, item) => sum + item.total, 0)
  },
  actions: {
    addItem(product) {
      const exists = this.items.find(item => item.productId === product.id)
      if (exists) {
        if (exists.quantity >= product.stock) return
        exists.quantity += 1
        exists.subtotal = exists.quantity * exists.price
        exists.total = exists.subtotal - exists.discount
      } else {
        this.items.push({
          productId: product.id,
          codigoProd: product.codigoProd,
          nombreProd: product.nombreProd,
          quantity: 1,
          price: Number(product.price),
          discountRate: Number(product.discountRate || 0),
          subtotal: Number(product.price),
          discount: 0,
          total: Number(product.price)
        })
      }
    }
  }
})
```

### 7.4 salesStore

Responsable de:

- crear transacción
- consultar historial
- confirmar/cancelar venta
- dashboard de ventas

### 7.5 cajaStore

Responsable de:

- estado de caja
- abrir/cerrar caja
- monto de apertura
- historial de operación

---

## 8. Router y protección de rutas

### 8.1 Rutas recomendadas

```js
const routes = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/productos', name: 'products', component: ProductsView, meta: { requiresAuth: true } },
  { path: '/pos', name: 'pos', component: PosView, meta: { requiresAuth: true } },
  { path: '/ventas', name: 'sales', component: SalesView, meta: { requiresAuth: true } },
  { path: '/empleados', name: 'employees', component: EmployeesView, meta: { requiresAuth: true } },
  { path: '/caja', name: 'caja', component: CajaView, meta: { requiresAuth: true } },
  { path: '/reportes', name: 'reports', component: ReportsView, meta: { requiresAuth: true } },
  { path: '/facturas', name: 'invoices', component: FacturasView, meta: { requiresAuth: true } }
]
```

### 8.2 Guard de autenticación

```js
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)

  if (requiresAuth && !authStore.token) {
    next('/login')
    return
  }

  next()
})
```

---

## 9. Vistas principales

### 9.1 LoginView

- formulario de usuario/password
- guardado de token
- mostrador de errores
- manejo de 401 y 403

### 9.2 DashboardView

- KPIs del día
- total ventas
- promedio ticket
- items vendidos
- productos con stock bajo
- acceso rápido a POS y reportes

### 9.3 ProductsView

- búsqueda por nombre/código
- filtros por categoria
- tarjetas de productos
- stock visible
- botones: ver detalle, editar, agregar al carrito

### 9.4 PosView

- buscador de producto
- listado con cards/productos
- carrito a la derecha
- calculadora de subtotal, descuento y total
- método de pago
- botón “Finalizar compra”

### 9.5 SalesView

- historial de transacciones
- filtro por fechas
- detalle por venta
- botones: confirmar, cancelar, ver factura

### 9.6 ReportsView

- ventas
- descuentos
- productos más vendidos
- inventario bajo
- KPIs de caja

### 9.7 FacturasView

- previsualización de factura
- generación desde venta actual
- descarga XML/PDF si aplica

---

## 10. Lógica de venta recomendada

### 10.1 Cálculo del subtotal

```js
const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
```

### 10.2 Cálculo del descuento por producto

```js
const discountByItem = cart.items.reduce((sum, item) => {
  const lineSubtotal = item.price * item.quantity
  return sum + (lineSubtotal * (item.discountRate || 0) / 100)
}, 0)
```

### 10.3 Descuento global

```js
const globalDiscount = subtotal * ((saleDiscountPercent || 0) / 100)
```

### 10.4 Total final

```js
const total = subtotal - discountByItem - globalDiscount
```

### 10.5 Validaciones UI

- cantidad >= 1
- no permitir venta si stock insuficiente
- no permitir descuento > 100%
- validar producto existente antes de vender
- alertar si el stock está bajo el mínimo configurado

---

## 11. Reglas operativas de negocio para el frontend

### 11.1 Productos

- mostrar stock disponible
- si stock <= 0, bloquear la venta
- si stock <= lowStockThreshold, marcar en amarillo o rojo
- permitir búsqueda por código y nombre

### 11.2 Caja

- la caja debe abrirse antes de ventas
- la transacción debe registrarse con `employeeNumber`
- resolver el usuario logueado desde la sesión

### 11.3 Ventas

- cada item debe incluir al menos:
  - productId
  - codigoProd
  - nombreProd
  - quantity
  - price
  - discountRate
- cuando se envía al backend, la propiedad `items` debe ser una lista exacta del carrito

### 11.4 Facturas

- se pueden generar desde la venta o como flujo independiente
- el frontend debe enviar la venta y luego usar `transaction` como referencia

---

## 12. Modelo de datos sugerido en Vue

```ts
interface UserSession {
  id: number
  username: string
  email: string
  nombreEmpleado: string
  numeroEmpleado: number
  role: string
  photo: string
}

interface Product {
  id: number
  codigoProd: string
  codigoAltern?: string
  nombreProd: string
  price: number
  stock: number
  category?: string
  lowStockThreshold?: number
  discountRate?: number
}

interface CartItem {
  productId: number
  codigoProd: string
  nombreProd: string
  quantity: number
  price: number
  discountRate: number
  subtotal: number
  discount: number
  total: number
}

interface SalePayload {
  items: CartItem[]
  discount?: number
  paymentMethod: 'cash' | 'card' | 'transfer'
  employeeNumber?: number
  customer?: Record<string, unknown>
}
```

---

## 13. Servicio API recomendado

### 13.1 authApi.js

```js
import apiClient from './client'

export const authApi = {
  login: (payload) => apiClient.post('/auth/login', payload),
  me: () => apiClient.get('/auth/me'),
  verify: () => apiClient.get('/auth/verify-token'),
  logout: () => apiClient.post('/auth/logout')
}
```

### 13.2 productsApi.js

```js
import apiClient from './client'

export const productsApi = {
  list: (params = {}) => apiClient.get('/products', { params }),
  byCode: (code) => apiClient.get('/products/by-code', { params: { code } }),
  byId: (id) => apiClient.get(`/products/${id}`),
  update: (id, payload) => apiClient.put(`/products/${id}`, payload)
}
```

### 13.3 transactionsApi.js

```js
import apiClient from './client'

export const transactionsApi = {
  list: (params = {}) => apiClient.get('/transactions', { params }),
  create: (payload) => apiClient.post('/transactions', payload),
  findById: (id) => apiClient.get(`/transactions/${id}`),
  confirm: (id) => apiClient.post(`/transactions/${id}/confirm`),
  cancel: (id) => apiClient.post(`/transactions/${id}/cancel`)
}
```

### 13.4 facturasApi.js

```js
import apiClient from './client'

export const facturasApi = {
  preview: (payload) => apiClient.post('/facturas/preview', payload),
  generate: (payload) => apiClient.post('/facturas/generate', payload),
  getById: (id) => apiClient.get(`/facturas/${id}`)
}
```

---

## 14. Recomendación de diseño visual

Se recomienda un diseño tipo POS profesional con:

- sidebar izquierda para navegación
- contenido central para productos y ventas
- panel derecho para carrito y resumen
- card de producto con precio, código y stock
- botones representativos: `Agregar`, `Quitar`, `Cobrar`, `Facturar`
- color de alerta para stock bajo
- tabs para `Productos`, `Ventas`, `Inventario`, `Reportes`, `Facturas`

---

## 15. Flujo de usuario recomendado

1. Usuario hace login
2. Verifica sesión
3. Abre caja
4. Busca producto por nombre, código o categoría
5. Agrega al carrito
6. Ajusta cantidades
7. Aplica descuentos
8. Selecciona método de pago
9. Confirma venta
10. Genera factura si aplica
11. Ve historial de ventas y reportes

---

## 16. Consideraciones de compatibilidad con el backend actual

### 16.1 Esto sí debe respetarse

- usar `Authorization: Bearer <token>`
- usar `success`/`message` para manejar respuestas
- no romper la estructura de `data`
- enviar `items` con `productId` y `codigoProd`
- manejar `discountRate` en cada item y `discount` global
- enviar `paymentMethod` según el backend

### 16.2 Esto necesita especial cuidado

- los productos y transacciones hacen uso de nombres con `nombreProd`, `codigoProd`, `productId`
- hay una mezcla de campos en español/inglés
- la integración de facturación aún no está conectada con un PAC real
- si se usa MySQL, el stock debe mantenerse persistido y no reiniciarse desde seed

---

## 17. MVP recomendado para arrancar

### Módulos mínimos

1. Login
2. Dashboard
3. Productos
4. POS / Carrito
5. Historial de ventas
6. Reportes básicos
7. Facturación preview/generate

### Objetivo del MVP

- vender con validación de stock
- mantener sesión
- mostrar historial de transacciones
- visualizar inventario y reportes simples

---

## 18. Conclusión

El frontend Vue 3 debe construirse como una capa de presentación sobre la API actual del backend Express, con:

- autenticación por token
- gestión de estado por Pinia
- arquitectura modular
- flujo de venta y facturación compatible con la API ya existente
- validaciones estrictas de stock, cantidades y descuentos

Este diseño permite crear una interfaz moderna y mantenible con mínima fricción y máxima compatibilidad con el backend actual.

---

## 19. Siguiente paso recomendado

Se recomienda iniciar con:

1. proyecto Vue 3 + Vite
2. configuración del cliente HTTP
3. store de autenticación
4. pantalla de login
5. pantalla POS con carrito
6. integración con ventas y productos
7. después reportes y facturación
