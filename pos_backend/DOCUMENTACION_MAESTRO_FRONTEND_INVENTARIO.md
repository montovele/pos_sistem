# Documento maestro técnico para la implementación frontend del módulo de inventario

## 1. Objetivo

Este documento define la arquitectura técnica, la estructura de archivos, el flujo de consumo de la API y la capa de presentación para implementar el módulo de inventario en frontend, sin duplicar la lógica del engine ni romper la arquitectura actual del backend.

El objetivo principal es construir una interfaz funcional para:
- consultar inventario
- listar productos por SKU y almacén
- crear y editar productos
- importar archivos CSV, JSON y XLSX
- revisar resúmenes de importación
- consultar movimientos y reportes
- manejar permisos por rol

## 2. Alcance

### Incluye
- consumo de API REST del backend
- capa de servicios frontend
- estado y stores para inventario
- rutas y vistas en la aplicación cliente
- carga masiva con validación visual previa a persistencia
- manejo de errores, permisos y UX empresarial

### No incluye
- mover lógica de validación al navegador
- duplicar el engine de inventario en frontend
- generar reglas de negocio complejas del lado del cliente
- modificar el backend existente salvo la integración con la API

## 3. Principios de arquitectura

### 3.1 Separación de responsabilidad

El frontend no debe contener el motor de importación ni la lógica pesada de validación. Debe consumir la API del backend y mostrar resultados.

Flujo correcto:

```text
Frontend (UI)
  -> API Express
  -> Middleware de autenticación y roles
  -> Engine de inventario
  -> Servicio de inventario
  -> Repositorio MySQL / demo store
```

### 3.2 Regla principal

El navegador solo debe:
- preparar archivos
- enviar payload
- mostrar resumen
- pedir confirmación
- mostrar errores y estados

El backend es responsable de:
- validar archivo
- normalizar datos
- detectar errores y duplicados
- persistir solo filas válidas
- registrar auditoría y movimientos

### 3.3 Compatibilidad con backend actual

La implementación debe respetar lo que ya existe en:
- [src/app.js](src/app.js)
- [inventario/module/inventory.routes.js](inventario/module/inventory.routes.js)
- [inventario/engine/importEngine.js](inventario/engine/importEngine.js)

La API base a consumir es:
- /api/inventario
- /api/inventario/import/csv
- /api/inventario/import/json
- /api/inventario/import/xlsx
- /api/inventario/movimientos
- /api/inventario/reportes/resumen
- /api/inventario/reportes/bajo-stock
- /api/inventario/importaciones

### 3.4 Identificación de la organización o empresa

Cada usuario pertenece a una sola organización mediante la relación:

```text
usuarios.organization_id -> organizaciones.id
```

El identificador técnico de la empresa es `organizationId` en la sesión y `organization_id` en la base de datos. El nombre visible se obtiene como `organizationName` en la sesión, proveniente de `organizaciones.nombre_org`.

Ejemplo de sesión autenticada:

```json
{
  "id": 12,
  "username": "cajero.ventas",
  "organizationId": 7,
  "organizationName": "Comercializadora Norte",
  "role": "cashier",
  "active": true
}
```

El frontend debe:

- guardar el usuario autenticado junto con su `organizationId` y `organizationName`;
- mostrar `organizationName` en el encabezado, selector de contexto o perfil de empresa;
- enviar únicamente el token Bearer en las peticiones de inventario;
- no enviar `organizationId` para intentar seleccionar o cambiar la empresa;
- no usar `organizationId` recibido desde query string, URL o body como mecanismo de autorización.

El backend identifica la empresa desde el usuario autenticado y crea `req.organization`. Después, cada operación aplica ese contexto:

```text
Bearer token
  -> usuarios.id
  -> usuarios.organization_id
  -> organizaciones.id / nombre_org
  -> inventario_items.organization_id
  -> inventario_movimientos.organization_id
  -> inventario_importaciones.organization_id
  -> transacciones.organization_id
```

Para consultar los datos descriptivos de la empresa, el frontend puede usar:

```text
GET /api/organization
```

La respuesta esperada contiene `id`, `name`, `taxId`, `email`, `phone`, `address`, `status` y la configuración de la organización. El `id` de esta respuesta debe coincidir con `user.organizationId`.

#### Ejemplo de cliente frontend

```js
const session = JSON.parse(localStorage.getItem('session') || '{}');

const organization = {
  id: session.user?.organizationId,
  name: session.user?.organizationName || 'Empresa'
};

// Las peticiones no agregan organizationId al payload.
await inventoryService.list({ page: 1, perPage: 20 });
```

La organización sirve para identificar y mostrar el contexto actual, pero la autorización y el filtrado siempre los realiza el backend a partir del token.

## 4. Tecnología recomendada

Dado el contexto del proyecto, la recomendación técnica es:
- Vue 3 + Pinia
- Vite para desarrollo
- Axios o cliente fetch wrapper
- Tailwind o CSS modular para UI
- Componentes reutilizables por módulo

## 5. Estructura recomendada del frontend

```text
src/
  api/
    client.js
    inventoryApi.js
  auth/
    authService.js
    useAuth.js
  features/
    inventory/
      components/
        InventoryTable.vue
        InventoryFilters.vue
        InventorySummaryCard.vue
        ImportCsvDialog.vue
        ImportJsonDialog.vue
        ImportXlsxDialog.vue
        MovementForm.vue
        LowStockAlerts.vue
      composables/
        useInventoryList.js
        useInventoryImport.js
        useInventoryReports.js
      stores/
        inventoryStore.js
      views/
        InventoryView.vue
        InventoryImportView.vue
        InventoryReportsView.vue
      services/
        inventoryService.js
      utils/
        inventoryFormatters.js
        inventoryValidators.js
  routes/
    index.js
    inventory.routes.js
  layouts/
    AppLayout.vue
  shared/
    components/
    utils/
```

## 6. Capa de consumo de API

### 6.1 Cliente HTTP centralizado

Crear un cliente base para manejar:
- base URL
- tokens Bearer
- manejo central de errores
- interceptores
- respuestas estandarizadas

Ejemplo conceptual:

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4080/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('token');

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || 'Error en la API');
  }

  return body;
}
```

### 6.2 Servicios por módulo

Crear un archivo específico para inventario:

```js
export const inventoryService = {
  list(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/inventario${query ? `?${query}` : ''}`);
  },

  getBySku(sku) {
    return apiRequest(`/inventario/${encodeURIComponent(sku)}`);
  },

  create(payload) {
    return apiRequest('/inventario', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  update(id, payload) {
    return apiRequest(`/inventario/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  importCsv(payload) {
    return apiRequest('/inventario/import/csv', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  importJson(payload) {
    return apiRequest('/inventario/import/json', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  importXlsx(payload) {
    return apiRequest('/inventario/import/xlsx', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getSummary(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/inventario/reportes/resumen${query ? `?${query}` : ''}`);
  },

  getLowStock(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/inventario/reportes/bajo-stock${query ? `?${query}` : ''}`);
  },

  getMovements(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/inventario/movimientos${query ? `?${query}` : ''}`);
  }
};
```

## 7. Estado global recomendado

Usar Pinia para centralizar estado de inventario:
- listado
- detalle de producto
- filtros activos
- alertas de stock bajo
- importaciones en curso
- resumen
- errores globales
- usuario autenticado y permisos

### 7.1 Store base

```js
export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    filters: {},
    loading: false,
    error: null,
    summary: null,
    lowStock: [],
    movements: [],
    importAudit: null
  }),
  actions: {
    async loadItems(params = {}) {
      this.loading = true;
      try {
        const response = await inventoryService.list(params);
        this.items = response.data || [];
        this.total = response.meta?.total || 0;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    }
  }
});
```

## 8. Vistas recomendadas

### 8.1 Inventario general

Ruta sugerida:
- /inventario

Funcionalidades:
- buscar por SKU, nombre o categoría
- paginación
- tabla de productos
- edición rápida
- acciones de stock bajo
- acceso según permisos

### 8.2 Importación masiva

Ruta sugerida:
- /inventario/importar

Funcionalidades:
- cargar CSV, JSON o XLSX
- previsualizar resumen
- mostrar errores por fila
- permitir corrección previa
- confirmar importación real o dry-run
- mostrar progreso y resultados

### 8.3 Reportes

Ruta sugerida:
- /inventario/reportes

Funcionalidades:
- KPIs del resumen
- stock bajo
- historial de importaciones
- movimientos de inventario

### 8.4 Movimientos

Ruta sugerida:
- /inventario/movimientos

Funcionalidades:
- registro de entradas, salidas y ajustes
- búsqueda por SKU o almacén
- detalle con stock antes y después

## 9. Componentes principales

### 9.1 InventoryTable.vue

Responsable de:
- mostrar filas del inventario
- paginación
- acciones por producto
- indicadores de stock bajo

### 9.2 InventoryFilters.vue

Responsable de:
- entrada por search
- filtro por almacén
- filtro por categoría
- orden de resultados

### 9.3 InventorySummaryCard.vue

Responsable de:
- KPIs generales
- total de artículos
- total por categoría
- bajo stock
- valor de inventario si aplica

### 9.4 ImportCsvDialog.vue

Responsable de:
- selección de archivo CSV
- parseo visual de la cabecera
- revisión del resumen
- llamada a la API

### 9.5 ImportJsonDialog.vue

Responsable de:
- ingreso de contenido JSON o archivo JSON
- validación del formato
- preview antes de persistir

### 9.6 ImportXlsxDialog.vue

Responsable de:
- carga de Excel
- validación del archivo
- previsualización del contenido

### 9.7 MovementForm.vue

Responsable de:
- registrar movimiento
- seleccionar tipo: entrada, salida, ajuste
- ingresar SKU, almacén, cantidad, motivo

### 9.8 LowStockAlerts.vue

Responsable de:
- mostrar alertas de stock bajo
- permitir acceso directo a producto

## 10. Flujo de importación en frontend

El flujo de UI debe seguir este patrón:

1. El usuario selecciona archivo o pega JSON.
2. El frontend valida extensión, nombre y tamaño básico.
3. Se envía al backend con el payload requerido.
4. El backend valida y devuelve resumen con filas válidas, inválidas y duplicadas.
5. La UI muestra:
   - totalRows
   - validRows
   - invalidRows
   - duplicates
   - errores por fila
6. El usuario confirma la importación real.
7. Si el usuario elige dry-run, se deja como vista previa sin persistencia.
8. Si confirma, se ejecuta la importación real con `dryRun: false`.

### Flujo recomendado

```text
Seleccionar archivo
  -> validar frontend
  -> POST /api/inventario/import/{csv|json|xlsx}
  -> recibir summary
  -> mostrar preview
  -> confirmar
  -> POST nuevamente con dryRun false
  -> mostrar resultado final
```

## 11. Modelo de respuesta del backend a usar en UI

La API responde con:

```json
{
  "success": true,
  "data": {
    "totalRows": 120,
    "validRows": 108,
    "invalidRows": 9,
    "duplicates": 3,
    "dryRun": true,
    "rows": [
      {
        "index": 0,
        "sku": "SKU-001",
        "status": "valid",
        "errors": []
      }
    ],
    "imported": 0,
    "auditId": null,
    "message": "Importación sin persistencia (modo dry-run)"
  }
}
```

La UI debe manejar este esquema para presentar errores y métricas.

## 12. Autenticación y permisos

El frontend debe respetar el contrato de roles del backend.

### 12.1 Roles esperados
- admin: puede crear, editar, importar, consultar reportes y movimientos
- cashier: puede consultar inventario y alertas, pero no modificar ni importar

### 12.2 Regla de UX

- ocultar acciones de escritura para cashier
- bloquear rutas o botones si el rol no tiene permiso
- no confiar solo en la UI; la validación del backend es la fuente final

## 13. Manejo de errores

### 13.1 Tipos de error
- credenciales inválidas
- 403 por permisos
- 404 sin resultados
- 400 por payload o validación
- 500 de backend o base de datos

### 13.2 Comportamiento recomendado

- mostrar toast para errores operativos
- mostrar tabla de errores por fila cuando llega resumen
- mostrar estado de carga en botones
- mantener mensajes claros y legibles

## 14. Rutas recomendadas para frontend

```text
/inventario
/inventario/importar
/inventario/reportes
/inventario/movimientos
/inventario/:sku
```

La navegación debe considerar permisos por rol.

## 15. Reglas de presentación para la vista

### 15.1 Inventario
- mostrar SKU, nombre, unidad, stock, stock mínimo, precio, almacén
- colorear stock bajo
- permitir busqueda rápida
- abrir detalle por producto

### 15.2 Importación
- mostrar resumen con métricas destacadas
- listar errores por fila con contexto
- permitir omitir filas problemáticas antes de persistir
- validar el archivo antes de importarlo

### 15.3 Reportes
- mostrar tarjetas tipo KPI
- listados de bajo stock y movimientos por página
- mostrar filtros por almacén y fecha si se habilitan en backend

## 16. Mejores prácticas de implementación

- mantener el servicio API separado del store
- no invocar lógica de negocio directamente en componentes
- usar composables para lógica reutilizable
- mantener los payloads y errores tipados
- evitar duplicar respuestas del backend en la UI
- usar loaders y mensajes de estado claros

## 17. Criterios de aceptación

La implementación frontend se considera exitosa cuando cumple estas condiciones:

1. El usuario puede listar inventario desde la API.
2. El usuario puede buscar y filtrar por SKU, nombre, almacén y categoría.
3. El usuario puede crear y editar productos si tiene rol admin.
4. El usuario puede importar CSV, JSON y XLSX desde la interfaz.
5. La UI muestra resumen de importación con errores y duplicados.
6. La UI usa dry-run antes de persistencia real.
7. El usuario puede consultar bajo stock y movimientos.
8. El usuario cashier no puede escribir ni importar.
9. Todos los errores se muestran con mensajes legibles.
10. La lógica de importación no está duplicada en el cliente.

## 18. Fases de implementación recomendadas

### Fase 1: base de consumo y lista
- crear cliente HTTP
- crear servicio inventario
- crear store Pinia
- crear vista de listado
- navegar por filtros y paginación

### Fase 2: creación, edición y validación de permisos
- formulario de producto
- edición de stock y min stock
- restricción de acceso por rol

### Fase 3: importación masiva
- selector de archivo
- preview de resumen
- confirmación de importación
- manejo de filas inválidas

### Fase 4: reportes y alertas
- resumen administrativo
- bajo stock
- movimientos
- historial de importaciones

### Fase 5: refinamiento de UX
- carga progresiva
- toasts
- diseño responsive
- pruebas e2e básicas

## 19. Checklist técnico final

- [ ] Cliente HTTP centralizado
- [ ] Servicio de inventario con endpoints del backend
- [ ] Store de inventario
- [ ] Vista de listado
- [ ] Vista de detalle y edición
- [ ] Vista de importación CSV
- [ ] Vista de importación JSON
- [ ] Vista de importación XLSX
- [ ] Resumen de importación con validación visual
- [ ] Reportes y alertas
- [ ] Protección por roles
- [ ] Manejo de errores global
- [ ] Arquitectura compatible con Express backend actual

## 20. Conclusión

La capa de backend ya está preparada para soportar el módulo de inventario con autenticación, validación, importación masiva, auditoría y reportes. La implementación frontend debe centrarse en consumir la API de forma modular y mantener una arquitectura limpia, con la vista como representación del estado del backend y no como reemplazo del engine.

La clave del éxito es mantener el patrón:

```text
UI -> API -> backend validación/persistencia
```

Sin duplicar las reglas del engine ni reimplementarlas del lado cliente.
