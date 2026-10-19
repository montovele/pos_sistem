# Documentación para integrar el módulo de facturas en Vue 3

## 1. Objetivo

Este documento describe cómo conectar de forma funcional y profesional un frontend Vue 3 con el módulo de facturas del backend que está en la carpeta `facturas` del proyecto.

Se cubren dos escenarios reales que existen en este repositorio:

1. Módulo de facturación empresarial/admin:
   - rutas bajo `/api/facturas/...`
   - operaciones de folios, clientes fiscales, dashboard, PDF/XML, cancelación, etc.

2. Rutas generales de POS/ventas:
   - montadas en `src/routes/facturas.routes.js`
   - endpoints de preview y generación de facturas desde el flujo de ventas.

---

## 2. Base URL y CORS

El backend principal expone la API en:

```text
http://localhost:4080/api
```

Y en el `app.js` del proyecto se habilita CORS para:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

Esto permite que un frontend Vue corriendo en Vite pueda consumir la API sin problemas.

### Variables de entorno recomendadas

```env
VITE_API_URL=http://localhost:4080/api
VITE_APP_NAME=POS Professional
VITE_ENV=development
```

---

## 3. Estructura real del backend de facturas

Existe más de una capa de rutas para facturas:

### 3.1 Rutas del módulo `facturas`

Archivo principal:

- `facturas/routes/facturasRoutes.js`
- `facturas/routes/admin.facturas.routes.js`

Estas rutas suelen usarse para operaciones administrativas y de facturación electrónica, por ejemplo:

- `/admin/pedidos/:id`
- `/admin/pedidos/:id/preview`
- `/admin/folios`
- `/admin/facturas/generar`
- `/admin/facturas`
- `/admin/facturas/:id`
- `/admin/facturas/:id/pdf`
- `/admin/facturas/:id/xml`
- `/admin/dashboard/facturacion`
- `/admin/clientes-fiscales`
- `/admin/facturas/:id/cancelar`
- `/ordenes/sin-facturar`
- `/configuracion`

Cuando se montan en la app principal, estas rutas quedan bajo:

```text
/api/facturas/... 
```

### 3.2 Rutas del flujo POS general

Archivo:

- `src/routes/facturas.routes.js`

Estas rutas están pensadas para el flujo de ventas del sistema POS y son más simples:

```text
GET    /api/facturas
POST   /api/facturas/preview
POST   /api/facturas/generate
GET    /api/facturas/:id
```

> Importante: las rutas del módulo de facturas y las rutas del POS no son exactamente lo mismo. Para integrar en Vue, conviene separar claramente dos módulos: `facturasAdmin` y `facturasPos`.

---

## 4. Comportamiento esperado de las respuestas

Las respuestas exitosas del backend suelen seguir este formato:

```json
{
  "success": true,
  "data": {},
  "message": "Operación exitosa"
}
```

En algunos endpoints del módulo administrativo la respuesta incluye `rows`, `total`, `pagination`, `filters`, etc.

Ejemplo:

```json
{
  "success": true,
  "data": [],
  "rows": [],
  "total": 0,
  "limit": 10,
  "offset": 0,
  "page": 1,
  "totalPages": 1,
  "pagination": {
    "total": 0,
    "limit": 10,
    "offset": 0,
    "page": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "filters": {
    "estatus": null,
    "search": null
  },
  "meta": {
    "count": 0
  }
}
```

Los errores suelen devolver:

```json
{
  "success": false,
  "message": "Factura no encontrada"
}
```

---

## 5. Autenticación recomendada en Vue 3

El backend espera el token en el header `Authorization`:

```http
Authorization: Bearer <token>
```

### Cliente HTTP centralizado con Axios

```ts
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

export default api
```

---

## 6. Servicios de facturas para Vue 3

La forma más profesional es crear un archivo dedicado por módulo.

### 6.1 Archivo sugerido: `src/api/facturasApi.js`

```ts
import api from './client'

export const facturasApi = {
  list: (params = {}) => api.get('/facturas/admin/facturas', { params }),
  getById: (id) => api.get(`/facturas/admin/facturas/${id}`),
  generate: (payload) => api.post('/facturas/admin/facturas/generar', payload),
  previewPedido: (pedidoId) => api.get(`/facturas/admin/pedidos/${pedidoId}/preview`),
  getPedido: (pedidoId) => api.get(`/facturas/admin/pedidos/${pedidoId}`),
  getPdfUrl: (id) => api.get(`/facturas/admin/facturas/${id}/pdf`),
  getXmlUrl: (id) => api.get(`/facturas/admin/facturas/${id}/xml`),
  cancel: (id, payload = {}) => api.post(`/facturas/admin/facturas/${id}/cancelar`, payload),
  dashboard: () => api.get('/facturas/admin/dashboard/facturacion'),
  salesDashboard: () => api.get('/facturas/admin/dashboard/facturacion/ventas'),
  clientes: (params = {}) => api.get('/facturas/admin/clientes-fiscales', { params }),
  crearCliente: (payload) => api.post('/facturas/admin/clientesFiscales', payload),
  listarFolios: () => api.get('/facturas/admin/folios'),
  ordenesSinFacturar: () => api.get('/facturas/ordenes/sin-facturar'),
  previewPos: (payload) => api.post('/facturas/preview', payload),
  generatePos: (payload) => api.post('/facturas/generate', payload)
}
```

### 6.2 Archivo sugerido: `src/modules/facturas/useFacturas.js`

```ts
import { ref, computed } from 'vue'
import { facturasApi } from '@/api/facturasApi'

export function useFacturas() {
  const facturas = ref([])
  const loading = ref(false)
  const error = ref(null)

  const fetchFacturas = async (params = {}) => {
    loading.value = true
    error.value = null

    try {
      const { data } = await facturasApi.list(params)
      facturas.value = data.rows ?? data.data ?? []
      return data
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchFactura = async (id) => {
    const { data } = await facturasApi.getById(id)
    return data.data ?? data
  }

  const generateFactura = async (payload) => {
    const { data } = await facturasApi.generate(payload)
    return data.data ?? data
  }

  return {
    facturas,
    loading,
    error,
    fetchFacturas,
    fetchFactura,
    generateFactura
  }
}
```

---

## 7. Rutas y navegación de facturas en Vue 3

Se recomienda definir un módulo dedicado para facturas en el router.

### Ejemplo de rutas

```ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/facturas',
      name: 'facturas-index',
      component: () => import('@/views/facturas/FacturasIndexView.vue')
    },
    {
      path: '/facturas/:id',
      name: 'factura-detalle',
      component: () => import('@/views/facturas/FacturaDetalleView.vue')
    },
    {
      path: '/facturas/generar',
      name: 'factura-generar',
      component: () => import('@/views/facturas/FacturaGenerarView.vue')
    },
    {
      path: '/facturas/preview/:pedidoId',
      name: 'factura-preview',
      component: () => import('@/views/facturas/FacturaPreviewView.vue')
    }
  ]
})

export default router
```

### Recomendación de estructura de archivos

```text
src/
  api/
    client.ts
    facturasApi.ts
  stores/
    facturasStore.ts
  views/
    facturas/
      FacturasIndexView.vue
      FacturaDetalleView.vue
      FacturaGenerarView.vue
      FacturaPreviewView.vue
  components/
    facturas/
      FacturasTable.vue
      FacturaStatusBadge.vue
      FacturaFilters.vue
      FacturaDownloadButtons.vue
```

---

## 8. Endpoints reales del módulo de facturas

### 8.1 Módulo administrativo / facturación electrónica

#### Listar facturas

```http
GET /api/facturas/admin/facturas?page=1&limit=10&estatus=timbrada&search=ABC
Authorization: Bearer <token>
```

#### Obtener factura por ID

```http
GET /api/facturas/admin/facturas/123
Authorization: Bearer <token>
```

#### Generar factura

```http
POST /api/facturas/admin/facturas/generar
Authorization: Bearer <token>
Content-Type: application/json
```

Body sugerido:

```json
{
  "pedido_id": 101,
  "cliente_fiscal_id": 5,
  "metodo_pago": "PUE",
  "uso_cfdi": "G01",
  "tipo_comprobante": "I",
  "moneda": "MXN"
}
```

#### Obtener PDF

```http
GET /api/facturas/admin/facturas/123/pdf
Authorization: Bearer <token>
```

#### Obtener XML

```http
GET /api/facturas/admin/facturas/123/xml
Authorization: Bearer <token>
```

#### Cancelar factura

```http
POST /api/facturas/admin/facturas/123/cancelar
Authorization: Bearer <token>
Content-Type: application/json
```

#### Listar clientes fiscales

```http
GET /api/facturas/admin/clientes-fiscales
Authorization: Bearer <token>
```

#### Crear cliente fiscal

```http
POST /api/facturas/admin/clientesFiscales
Authorization: Bearer <token>
Content-Type: application/json
```

Body ejemplo:

```json
{
  "rfc": "XAXX010101000",
  "nombre": "Consumidor Final",
  "correo": "cliente@correo.com",
  "regimen_fiscal": "601",
  "codigo_postal": "76000"
}
```

#### Obtener dashboard de facturación

```http
GET /api/facturas/admin/dashboard/facturacion
Authorization: Bearer <token>
```

#### Ordenes sin facturar

```http
GET /api/facturas/ordenes/sin-facturar
Authorization: Bearer <token>
```

---

### 8.2 Módulo POS general

#### Generar preview de factura

```http
POST /api/facturas/preview
Authorization: Bearer <token>
Content-Type: application/json
```

Body ejemplo:

```json
{
  "id": 1001,
  "folio": "F-1001",
  "status": "draft",
  "cliente": {
    "nombre": "Consumidor final",
    "rfc": "XAXX010101000"
  },
  "items": [
    {
      "id": 1,
      "productId": 1,
      "codigoProd": "P001",
      "nombreProd": "Laptop Pro 14",
      "quantity": 1,
      "price": 12999,
      "subtotal": 12999,
      "discount": 0,
      "total": 12999
    }
  ],
  "paymentMethod": "cash",
  "tipo": "ingreso",
  "serie": "A",
  "metodoPago": "PUE"
}
```

#### Generar factura desde venta

```http
POST /api/facturas/generate
Authorization: Bearer <token>
Content-Type: application/json
```

Body ejemplo:

```json
{
  "items": [
    {
      "id": 1,
      "productId": 1,
      "codigoProd": "P001",
      "nombreProd": "Laptop Pro 14",
      "quantity": 1,
      "price": 12999,
      "subtotal": 12999,
      "discount": 0,
      "total": 12999
    }
  ],
  "total": 12999,
  "paymentMethod": "cash",
  "discount": 0
}
```

---

## 9. Patrón recomendado para la UI en Vue 3

### 9.1 Página de listado

En la vista de listado:

- mostrar tabla con columnas: folio, cliente, total, estatus, fecha
- filtros por estatus, búsqueda, rango de fechas
- paginación
- botón para ver detalle
- botón para descargar PDF/XML
- botón para cancelar factura si aplica

### 9.2 Página de detalle

En la vista detalle:

- mostrar datos de la factura
- mostrar cliente fiscal
- mostrar líneas conceptuales o productos
- mostrar subtotal, descuento, total
- mostrar estado: emitida, timbrada, cancelada, error
- mostrar botones de descarga y cancelación

### 9.3 Página de generación

En la vista de generación:

- seleccionar pedido o venta
- seleccionar cliente fiscal
- validar datos necesarios
- llamada a `generate`
- mostrar loading
- redirigir al detalle una vez emitida

---

## 10. Manejo de descarga de PDF y XML

El backend devuelve una URL o entrega el archivo si está guardado localmente.

### Opción 1: abrir en nueva pestaña

```ts
const openPdf = async (facturaId: number) => {
  const { data } = await facturasApi.getPdfUrl(facturaId)
  const url = data.url || data.data?.url

  if (url) {
    window.open(url, '_blank')
  }
}
```

### Opción 2: descarga directa

```ts
const downloadPdf = async (facturaId: number) => {
  const response = await api.get(`/facturas/admin/facturas/${facturaId}/pdf`, {
    responseType: 'blob'
  })

  const blob = new Blob([response.data], { type: 'application/pdf' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `factura-${facturaId}.pdf`
  link.click()
}
```

---

## 11. Pinia Store sugerido

```ts
import { defineStore } from 'pinia'
import { facturasApi } from '@/api/facturasApi'

export const useFacturasStore = defineStore('facturas', {
  state: () => ({
    facturas: [],
    facturaActual: null,
    loading: false,
    error: null
  }),

  actions: {
    async fetchFacturas(params = {}) {
      this.loading = true
      this.error = null

      try {
        const { data } = await facturasApi.list(params)
        this.facturas = data.rows ?? data.data ?? []
        return data
      } catch (err) {
        this.error = err
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchFactura(id) {
      const { data } = await facturasApi.getById(id)
      this.facturaActual = data.data ?? data
      return this.facturaActual
    },

    async generateFactura(payload) {
      const { data } = await facturasApi.generate(payload)
      return data.data ?? data
    }
  }
})
```

---

## 12. Buenas prácticas profesionales

### Recomendaciones clave

- Separar el módulo de facturas del módulo general de ventas.
- Crear un cliente Axios centralizado y reutilizable.
- Manejar estados `loading`, `error`, `success` en cada vista.
- Validar `pedido_id`, `cliente_fiscal_id`, `total`, `items` antes de enviar.
- Usar una vista de detalle para mostrar la respuesta real del backend.
- No mezclar rutas de administración con rutas de POS en el mismo componente.
- Manejar nombres consistentes entre frontend y backend: `generate`, `preview`, `list`, `detail`.

### Recomendación de nomenclatura

```text
facturasApi.list()
facturasApi.getById()
facturasApi.generate()
facturasApi.previewPedido()
facturasApi.cancel()
```

Esto es más limpio y más mantenible que usar endpoints sueltos en cada componente.

---

## 13. Flujo recomendado de integración

### Flujo 1: listado

```ts
onMounted(async () => {
  try {
    await facturasStore.fetchFacturas({ page: 1, limit: 10 })
  } catch (error) {
    console.error('Error al cargar facturas', error)
  }
})
```

### Flujo 2: generar factura

```ts
const onGenerate = async () => {
  try {
    const result = await facturasStore.generateFactura({
      pedido_id: 101,
      cliente_fiscal_id: 5,
      metodo_pago: 'PUE',
      uso_cfdi: 'G01',
      tipo_comprobante: 'I'
    })

    console.log('Factura emitida', result)
    await router.push({ name: 'factura-detalle', params: { id: result.id } })
  } catch (error) {
    console.error('No se pudo generar la factura', error)
  }
}
```

### Flujo 3: ver detalle

```ts
const route = useRoute()

onMounted(async () => {
  const facturaId = route.params.id
  await facturasStore.fetchFactura(facturaId)
})
```

---

## 14. Diferencias clave entre rutas del repositorio

### Ruta del módulo administrativo

```text
/api/facturas/admin/facturas
```

Es la más cercana al flujo de facturación fiscal real y tiene endpoints de negocio más completos.

### Ruta del módulo POS

```text
/api/facturas
```

Es más ligera y útil para operaciones rápidas dentro del flujo de caja/ventas.

> En una app profesional, conviene que el frontend use una capa `facturasApi` que centralice ambas fuentes y no haga llamadas sueltas desde los componentes.

---

## 15. Recomendación final de arquitectura

Para un frontend Vue 3 profesional, la estructura ideal es:

- `api/facturasApi.ts` para endpoints
- `stores/facturasStore.ts` para estado global
- `views/facturas/*` para pantallas
- `components/facturas/*` para reutilización
- `router` con rutas separadas por módulo
- manejo centralizado de errores y toasts
- validación de formularios con Vuelidate o `zod` o `vee-validate`

---

## 16. Resumen corto de conexión

Para conectar facturas en Vue 3:

1. Crear base `api` con Axios.
2. Configurar `Authorization` con token Bearer.
3. Crear `facturasApi` con endpoints de listado, preview, generate, detalle y descarga.
4. Crear `Pinia` store para manejar el estado.
5. Añadir un módulo de router para `/facturas` y `/facturas/:id`.
6. Usar componentes para tabla, detalle, filtros y descarga.
7. Centralizar la lógica en un servicio para evitar llamadas repetidas desde componentes.

---

## 17. Conclusión

El módulo de facturas del backend ya define una estructura base clara para integrar un frontend Vue 3 de forma ordenada y profesional. La clave está en separar:

- facturación administrativa (`/admin`),
- facturación del flujo POS (`/api/facturas`),
- y encapsular toda la lógica en un servicio y store bien definidos.

Con esta estructura, el frontend puede escalar sin mezclar responsabilidades y manteniendo buenas prácticas de arquitectura y UX.
