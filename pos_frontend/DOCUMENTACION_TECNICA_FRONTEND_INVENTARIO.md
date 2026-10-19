# Documento tecnico del frontend de inventario

## 1. Objetivo

Este documento define una arquitectura de referencia para construir un frontend funcional del modulo de inventario. Esta pensado para Vue 3, pero las reglas aplican tambien a React u otro framework.

El frontend consume exclusivamente la API HTTP. El engine permanece en el backend y no debe duplicarse en el navegador.

## 2. Requisitos tecnicos

- Node.js 18 o superior.
- Vue 3.
- Vue Router.
- Pinia o un store equivalente.
- Cliente HTTP basado en `fetch` o Axios.
- Soporte para seleccionar archivos CSV, JSON y XLSX.
- Capacidad de convertir XLSX a Base64 antes de enviarlo.
- Manejo global de expiracion de sesion y errores HTTP.

## 3. Estructura recomendada

```text
src/
  app/
    router.ts
    guards.ts
    httpClient.ts
  modules/
    auth/
      auth.store.ts
      auth.service.ts
      auth.types.ts
    inventory/
      inventory.routes.ts
      inventory.types.ts
      inventory.service.ts
      inventory.store.ts
      inventory.permissions.ts
      components/
        InventoryFilters.vue
        InventoryTable.vue
        InventoryForm.vue
        ImportWizard.vue
        ImportPreview.vue
        ImportRowErrors.vue
        InventorySummary.vue
        LowStockTable.vue
        MovementForm.vue
        MovementTable.vue
        ImportAuditTable.vue
      views/
        InventoryView.vue
        InventoryImportView.vue
        InventoryReportsView.vue
        InventoryMovementsView.vue
  shared/
    components/
    formatters/
    types/
```

## 4. Configuracion de API

Variable recomendada:

```env
VITE_API_URL=http://localhost:4080/api
```

Constante:

```ts
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4080/api';
export const INVENTORY_URL = `${API_URL}/inventario`;
```

## 5. Cliente HTTP

El cliente debe adjuntar el token en cada solicitud protegida.

```ts
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));

  if (response.status === 401) {
    localStorage.removeItem('access_token');
    window.location.assign('/login');
    throw new Error('Sesion expirada');
  }

  if (!response.ok) {
    const error = new Error(body.message || 'Error de API');
    Object.assign(error, { status: response.status, body });
    throw error;
  }

  return body;
}
```

## 6. Tipos principales

```ts
export type InventoryUnit = 'PZA' | 'KG' | 'LT' | 'CAJA';
export type ImportSource = 'csv' | 'json' | 'xlsx';
export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';
export type MovementType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'IMPORT';

export interface InventoryItem {
  id: number;
  organizationId: number;
  sku: string;
  barcode?: string;
  name: string;
  category?: string;
  unit: InventoryUnit;
  stock: number;
  minStock: number;
  cost: number;
  price: number;
  supplier?: string;
  warehouse: string;
  active: boolean;
}

export interface ImportRowResult {
  index: number;
  raw?: Record<string, unknown>;
  sku: string;
  status: ImportRowStatus;
  errors: string[];
}

export interface ImportResult {
  source: ImportSource;
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  importedRows: number;
  auditId: number | null;
  rows: ImportRowResult[];
  imported?: InventoryItem[];
}

export interface InventorySummary {
  totalItems: number;
  totalUnits: number;
  inventoryCost: number;
  inventoryValue: number;
  lowStockItems: number;
  activeItems: number;
  inactiveItems: number;
  byWarehouse: Array<{ warehouse: string; items: number; units: number; inventoryCost: number }>;
  byCategory: Array<{ category: string; items: number; units: number }>;
}

export interface InventoryMovement {
  id: number;
  sku: string;
  warehouse: string;
  movementType: MovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  userId?: number;
  username?: string;
  createdAt?: string;
}
```

## 7. Rutas de inventario

Base URL:

```text
/api/inventario
```

Todas las rutas requieren:

```http
Authorization: Bearer <token>
```

### 7.1 Consultas generales

| Metodo | Ruta | Rol | Uso |
| --- | --- | --- | --- |
| `GET` | `/api/inventario` | autenticado | Listado paginado |
| `GET` | `/api/inventario/:sku` | autenticado | Buscar por SKU |
| `GET` | `/api/inventario/stock-bajo` | autenticado | Alertas simples |

Listado:

```http
GET /api/inventario?search=cafe&page=1&perPage=20
```

Respuesta:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "perPage": 20,
    "totalPages": 1
  }
}
```

### 7.2 CRUD

| Metodo | Ruta | Rol | Uso |
| --- | --- | --- | --- |
| `POST` | `/api/inventario` | `admin` | Crear producto |
| `PUT` | `/api/inventario/:id` | `admin` | Actualizar producto |

Crear producto:

```ts
await apiRequest('/inventario', {
  method: 'POST',
  body: JSON.stringify({
    sku: 'SKU-100',
    name: 'Cafe molido',
    category: 'Bebidas',
    unit: 'PZA',
    stock: 25,
    minStock: 5,
    cost: 18.5,
    price: 29.99,
    warehouse: 'PRINCIPAL',
    active: true
  })
});
```

No enviar `organizationId`; lo define el backend a partir del usuario autenticado.

### 7.3 Importaciones

| Metodo | Ruta | Rol | Formato |
| --- | --- | --- | --- |
| `POST` | `/api/inventario/import/csv` | `admin` | Texto CSV |
| `POST` | `/api/inventario/import/json` | `admin` | JSON |
| `POST` | `/api/inventario/import/xlsx` | `admin` | Base64 |

CSV:

```ts
await apiRequest('/inventario/import/csv', {
  method: 'POST',
  body: JSON.stringify({
    filename: 'inventario.csv',
    mimetype: 'text/csv',
    csv: csvText,
    dryRun: true
  })
});
```

JSON:

```ts
await apiRequest('/inventario/import/json', {
  method: 'POST',
  body: JSON.stringify({
    filename: 'inventario.json',
    mimetype: 'application/json',
    rows,
    dryRun: true
  })
});
```

XLSX:

```ts
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const content = await fileToBase64(file);

await apiRequest('/inventario/import/xlsx', {
  method: 'POST',
  body: JSON.stringify({
    filename: file.name,
    mimetype: file.type,
    content,
    dryRun: true
  })
});
```

Flujo obligatorio:

```text
Seleccionar archivo
  -> Validar extension y tamano en frontend
  -> Enviar dryRun=true
  -> Mostrar resumen y filas con errores
  -> Confirmar con dryRun=false
  -> Mostrar auditId
```

### 7.4 Reportes administrativos

| Metodo | Ruta | Rol | Uso |
| --- | --- | --- | --- |
| `GET` | `/api/inventario/reportes/resumen` | `admin` | KPIs |
| `GET` | `/api/inventario/reportes/bajo-stock` | `admin` | Productos bajo minimo |
| `GET` | `/api/inventario/importaciones` | `admin` | Historial de cargas |
| `GET` | `/api/inventario/reportes/importaciones/:id` | `admin` | Detalle de carga |

Resumen:

```ts
const response = await apiRequest<{ success: true; data: InventorySummary }>(
  '/inventario/reportes/resumen?warehouse=PRINCIPAL'
);
```

Bajo stock:

```text
GET /api/inventario/reportes/bajo-stock?warehouse=PRINCIPAL&limit=100
```

Detalle de importacion:

```text
GET /api/inventario/reportes/importaciones/42
```

### 7.5 Movimientos

| Metodo | Ruta | Rol | Uso |
| --- | --- | --- | --- |
| `GET` | `/api/inventario/movimientos` | `admin` | Historial |
| `POST` | `/api/inventario/movimientos` | `admin` | Entrada, salida o ajuste |

Crear entrada:

```ts
await apiRequest('/inventario/movimientos', {
  method: 'POST',
  body: JSON.stringify({
    sku: 'SKU-001',
    warehouse: 'PRINCIPAL',
    movementType: 'ENTRY',
    quantity: 10,
    reason: 'Recepcion de proveedor',
    referenceType: 'PURCHASE',
    referenceId: 'OC-1001'
  })
});
```

Tipos:

- `ENTRY`: suma unidades.
- `EXIT`: resta unidades.
- `ADJUSTMENT`: establece el stock final.
- `IMPORT`: reservado para importaciones automaticas.

El backend rechaza movimientos que dejen stock negativo.

## 8. Servicios frontend

Archivo sugerido: `inventory.service.ts`.

```ts
import { apiRequest } from '../../app/httpClient';
import type {
  ImportResult,
  InventoryItem,
  InventoryMovement,
  InventorySummary
} from './inventory.types';

export const inventoryService = {
  list(params: Record<string, string | number> = {}) {
    const query = new URLSearchParams(String(params));
    return apiRequest(`/inventario?${query}`);
  },

  findBySku(sku: string) {
    return apiRequest(`/inventario/${encodeURIComponent(sku)}`);
  },

  create(payload: Partial<InventoryItem>) {
    return apiRequest('/inventario', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  update(id: number, payload: Partial<InventoryItem>) {
    return apiRequest(`/inventario/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  importJson(payload: unknown, dryRun = true) {
    return apiRequest<ImportResult>('/inventario/import/json', {
      method: 'POST',
      body: JSON.stringify({ rows: payload, dryRun })
    });
  },

  summary(warehouse = '') {
    const query = warehouse ? `?warehouse=${encodeURIComponent(warehouse)}` : '';
    return apiRequest<{ data: InventorySummary }>(`/inventario/reportes/resumen${query}`);
  },

  movements(params = '') {
    return apiRequest<{ data: InventoryMovement[] }>(`/inventario/movimientos${params}`);
  }
};
```

Nota: en una implementación real, `URLSearchParams` debe recibir un objeto de pares, por ejemplo:

```ts
const query = new URLSearchParams({
  search: String(params.search || ''),
  page: String(params.page || 1),
  perPage: String(params.perPage || 20)
});
```

## 9. Store recomendado

Estado mínimo:

```ts
interface InventoryState {
  items: InventoryItem[];
  selectedItem: InventoryItem | null;
  summary: InventorySummary | null;
  lowStock: InventoryItem[];
  loading: boolean;
  importing: boolean;
  error: string | null;
  importPreview: ImportResult | null;
}
```

Acciones:

- `loadItems(filters)`: cargar inventario.
- `loadSummary(filters)`: cargar KPIs.
- `loadLowStock(filters)`: cargar alertas.
- `createItem(payload)`: crear producto.
- `updateItem(id, payload)`: actualizar producto.
- `previewImport(payload)`: ejecutar `dryRun=true`.
- `confirmImport(payload)`: ejecutar `dryRun=false`.
- `loadImportAudit(id)`: consultar detalle.
- `createMovement(payload)`: registrar movimiento.
- `loadMovements(filters)`: cargar historial.

## 10. Rutas del frontend

```ts
const routes = [
  {
    path: '/inventario',
    component: InventoryView,
    meta: { requiresAuth: true }
  },
  {
    path: '/inventario/importar',
    component: InventoryImportView,
    meta: { requiresAuth: true, roles: ['admin'] }
  },
  {
    path: '/inventario/reportes',
    component: InventoryReportsView,
    meta: { requiresAuth: true, roles: ['admin'] }
  },
  {
    path: '/inventario/movimientos',
    component: InventoryMovementsView,
    meta: { requiresAuth: true, roles: ['admin'] }
  }
];
```

Guard:

```ts
router.beforeEach((to) => {
  const user = authStore.user;

  if (to.meta.requiresAuth && !user) {
    return '/login';
  }

  const roles = to.meta.roles as string[] | undefined;
  if (roles?.length && !roles.includes(user?.role || '')) {
    return '/inventario';
  }
});
```

## 11. Pantallas requeridas

### Inventario

- Filtros de busqueda.
- Selector de almacen.
- Tabla paginada.
- Indicador visual de stock bajo.
- Acciones de editar y ver detalle.
- Boton de crear producto para `admin`.

### Importar inventario

- Selector de archivo.
- Indicador de formato y tamano.
- Vista previa.
- Tarjetas de total, validas, invalidas y duplicadas.
- Tabla de errores por fila.
- Confirmacion de persistencia.
- Enlace al detalle de auditoria.

### Reportes

- Tarjetas KPI.
- Tabla o grafica por almacen.
- Tabla o grafica por categoria.
- Tabla de bajo stock.
- Historial de importaciones.

### Movimientos

- Formulario de SKU, almacen, tipo, cantidad y motivo.
- Stock actual visible antes de confirmar.
- Confirmacion para salidas y ajustes.
- Tabla de movimientos con usuario y fecha.

## 12. Permisos de interfaz

```ts
export const canWriteInventory = (role?: string) => role === 'admin';
export const canReadInventory = (role?: string) => role === 'admin' || role === 'cashier';
```

El frontend debe ocultar acciones de escritura para `cashier`, pero no debe confiar únicamente en esa restriccion. El backend siempre valida el rol.

## 13. Formateadores

```ts
export const formatQuantity = (value: number, unit: string) => {
  const digits = unit === 'KG' ? 3 : 0;
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(value);
};

export const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(value);
```

Los valores enviados al backend deben ser numericos, no cadenas con formato.

## 14. Casos de error que la UI debe cubrir

- Archivo vacio.
- Extension no soportada.
- MIME invalido.
- Archivo mayor a 10 MB.
- Mas de 10.000 filas.
- SKU faltante.
- Nombre faltante.
- Unidad no soportada.
- Valores numericos invalidos o negativos.
- SKU duplicado en el mismo almacen.
- Stock insuficiente para una salida.
- Token expirado.
- Rol sin permisos.
- MySQL no disponible.

## 15. Checklist de implementacion

- [ ] Configurar `VITE_API_URL`.
- [ ] Implementar login y persistencia del token.
- [ ] Implementar `apiRequest` con manejo de `401`.
- [ ] Crear tipos del dominio.
- [ ] Crear servicios de inventario.
- [ ] Crear store de inventario.
- [ ] Crear guard de roles.
- [ ] Crear vista de inventario.
- [ ] Crear wizard de importacion.
- [ ] Crear preview de filas y errores.
- [ ] Crear dashboard administrativo.
- [ ] Crear historial de importaciones.
- [ ] Crear gestion de movimientos.
- [ ] Probar roles `admin` y `cashier`.
- [ ] Probar CSV, JSON y XLSX.
- [ ] Probar `dryRun` y confirmacion final.
- [ ] Probar respuestas 400, 401, 403, 404 y 500.
