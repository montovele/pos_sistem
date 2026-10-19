# Documentacion frontend del inventario

## 1. Objetivo

Este documento define el contrato que debe utilizar el frontend para consumir el modulo de inventario.

El frontend debe tratar el backend como una API HTTP. No debe importar ni ejecutar directamente el engine de inventario.

El engine procesa CSV, JSON y XLSX; el modulo HTTP valida permisos, persiste en MySQL y genera auditoria.

## 2. URL base

```text
/api/inventario
```

La URL completa depende del puerto y host configurados en el backend.

Ejemplo local:

```text
http://localhost:4080/api/inventario
```

## 3. Autenticacion

Todas las rutas de inventario requieren un token Bearer.

```http
Authorization: Bearer <token>
Content-Type: application/json
```

El frontend obtiene el token desde el endpoint de login existente:

```http
POST /api/auth/login
```

En modo demo se aceptan tokens como:

```text
demo-token-1
```

Los cambios, importaciones, reportes administrativos y movimientos requieren un usuario con rol `admin`.

Los usuarios `cashier` pueden consultar inventario, pero reciben `403` al intentar modificarlo o importar archivos.

## 4. Modelo de producto

```ts
interface InventoryItem {
  id: number;
  organizationId: number;
  sku: string;
  barcode?: string;
  name: string;
  category?: string;
  unit: 'PZA' | 'KG' | 'LT' | 'CAJA';
  stock: number;
  minStock: number;
  cost: number;
  price: number;
  supplier?: string;
  warehouse: string;
  active: boolean;
}
```

La unicidad se aplica por:

```text
organizationId + sku + warehouse
```

El frontend no debe permitir editar el `organizationId` del producto. Ese valor proviene del usuario autenticado.

## 5. Respuesta estandar

Respuesta exitosa:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Respuesta con error:

```json
{
  "success": false,
  "message": "Descripcion del error"
}
```

Estados esperados:

| Estado | Significado |
| --- | --- |
| `200` | Consulta o actualizacion exitosa |
| `201` | Producto o movimiento creado |
| `400` | Payload o archivo invalido |
| `401` | Token ausente o invalido |
| `403` | Usuario sin permisos |
| `404` | Producto o importacion no encontrada |
| `500` | Error interno o de persistencia |

## 6. Consultar inventario

### Listado

```http
GET /api/inventario?search=cafe&page=1&perPage=20
```

Respuesta:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "organizationId": 1,
      "sku": "SKU-001",
      "name": "Producto demo",
      "unit": "PZA",
      "stock": 25,
      "minStock": 5,
      "cost": 18.5,
      "price": 29.99,
      "warehouse": "PRINCIPAL",
      "active": true
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "perPage": 20,
    "totalPages": 1
  }
}
```

Filtros disponibles:

- `search`: busca por SKU, nombre, categoria o almacen.
- `page`: pagina comenzando en `1`.
- `perPage`: cantidad de registros por pagina.

### Buscar por SKU

```http
GET /api/inventario/:sku
```

Ejemplo:

```http
GET /api/inventario/SKU-001
```

### Stock bajo

```http
GET /api/inventario/stock-bajo
```

## 7. Crear y actualizar productos

Solo disponible para administradores.

### Crear

```http
POST /api/inventario
```

Payload:

```json
{
  "sku": "SKU-100",
  "barcode": "750000000001",
  "name": "Cafe molido",
  "category": "Bebidas",
  "unit": "PZA",
  "stock": 25,
  "minStock": 5,
  "cost": 18.5,
  "price": 29.99,
  "supplier": "Proveedor A",
  "warehouse": "PRINCIPAL",
  "active": true
}
```

### Actualizar

```http
PUT /api/inventario/:id
```

Enviar solo los campos que se desean modificar.

No enviar `organizationId` desde el frontend.

## 8. Importacion de archivos

El frontend debe ofrecer una pantalla de importacion con:

1. Selector de archivo.
2. Selector de formato o deteccion por extension.
3. Vista previa usando `dryRun`.
4. Resumen de filas validas, invalidas y duplicadas.
5. Confirmacion explicita antes de persistir.
6. Consulta del resultado de auditoria.

Limites del backend:

- Tamano maximo: `10 MB`.
- Maximo: `10.000` filas.
- Unidades permitidas: `PZA`, `KG`, `LT`, `CAJA`.
- Stock, stock minimo, costo y precio no pueden ser negativos.

### 8.1 CSV

```http
POST /api/inventario/import/csv
```

Payload JSON:

```json
{
  "filename": "inventario.csv",
  "mimetype": "text/csv",
  "csv": "sku,nombre,unidad,stock\nSKU-1,Cafe,PZA,10",
  "dryRun": true
}
```

Para guardar definitivamente:

```json
{
  "filename": "inventario.csv",
  "mimetype": "text/csv",
  "csv": "sku,nombre,unidad,stock\nSKU-1,Cafe,PZA,10",
  "dryRun": false
}
```

### 8.2 JSON

```http
POST /api/inventario/import/json
```

Payload recomendado:

```json
{
  "filename": "inventario.json",
  "mimetype": "application/json",
  "dryRun": true,
  "rows": [
    {
      "sku": "SKU-1",
      "nombre": "Cafe",
      "unidad": "PZA",
      "stock": 10,
      "precio_venta": 29.99
    }
  ]
}
```

Tambien se acepta un arreglo JSON directo en `rows` o `data`.

### 8.3 XLSX

```http
POST /api/inventario/import/xlsx
```

El endpoint recibe el archivo como Base64 dentro de JSON:

```json
{
  "filename": "inventario.xlsx",
  "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "content": "UEsDB...",
  "dryRun": true
}
```

`content` debe contener el archivo XLSX codificado en Base64 sin prefijo `data:`.

El engine procesa la primera hoja del libro.

### Respuesta de importacion

```json
{
  "success": true,
  "data": {
    "source": "csv",
    "dryRun": true,
    "totalRows": 2,
    "validRows": 1,
    "invalidRows": 1,
    "duplicates": 0,
    "importedRows": 0,
    "auditId": 42,
    "rows": [
      {
        "index": 0,
        "sku": "SKU-1",
        "status": "valid",
        "errors": []
      },
      {
        "index": 1,
        "sku": "",
        "status": "invalid",
        "errors": ["SKU requerido"]
      }
    ]
  }
}
```

Estados de fila:

- `valid`: puede persistirse.
- `invalid`: tiene errores de validacion.
- `duplicate`: repite SKU y almacen dentro del archivo.

El frontend debe mostrar los errores por fila y permitir corregir el archivo antes de confirmar.

## 9. Reportes administrativos

Todos requieren rol `admin`.

### Resumen

```http
GET /api/inventario/reportes/resumen?warehouse=PRINCIPAL
```

Devuelve KPIs:

```json
{
  "success": true,
  "data": {
    "totalItems": 120,
    "totalUnits": 450,
    "inventoryCost": 8000.5,
    "inventoryValue": 12500.75,
    "lowStockItems": 8,
    "activeItems": 115,
    "inactiveItems": 5,
    "byWarehouse": [],
    "byCategory": []
  }
}
```

### Bajo stock

```http
GET /api/inventario/reportes/bajo-stock?warehouse=PRINCIPAL&limit=100
```

Cada resultado incluye `shortage`, que representa la cantidad faltante para alcanzar el minimo.

### Historial de importaciones

```http
GET /api/inventario/importaciones?page=1&perPage=20
```

### Detalle de una importacion

```http
GET /api/inventario/reportes/importaciones/:id
```

El detalle contiene las filas, errores y el JSON original guardado en auditoria.

## 10. Movimientos de inventario

Solo disponible para administradores.

### Registrar movimiento

```http
POST /api/inventario/movimientos
```

Entrada:

```json
{
  "sku": "SKU-001",
  "warehouse": "PRINCIPAL",
  "movementType": "ENTRY",
  "quantity": 10,
  "reason": "Recepcion de proveedor",
  "referenceType": "PURCHASE",
  "referenceId": "OC-1001"
}
```

Tipos permitidos:

- `ENTRY`: incrementa stock.
- `EXIT`: reduce stock.
- `ADJUSTMENT`: establece el stock final indicado por `quantity`.
- `IMPORT`: reservado para importaciones automaticas.

No se permite dejar stock negativo.

### Consultar movimientos

```http
GET /api/inventario/movimientos?sku=SKU-001&warehouse=PRINCIPAL&page=1&perPage=50
```

## 11. Flujo recomendado para Vue

```text
Login
  |
  v
Guardar token y usuario
  |
  v
Cargar resumen administrativo
  |
  +--> Listar inventario
  +--> Revisar bajo stock
  +--> Importar archivo en dryRun
  +--> Mostrar errores y duplicados
  +--> Confirmar importacion
  +--> Consultar auditoria
  +--> Gestionar movimientos
```

Recomendaciones de interfaz:

- Mostrar `dryRun` como vista previa, no como importacion completada.
- Deshabilitar controles de escritura para usuarios `cashier`.
- Confirmar siempre las importaciones con `dryRun: false`.
- Mostrar el `auditId` despues de guardar.
- Mostrar fechas y cantidades con formato local, pero enviar numeros puros al backend.
- No confiar solo en validaciones del navegador; el backend es la fuente de verdad.

## 12. Manejo de errores en frontend

```js
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.message || 'Error en la API de inventario');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}
```

Comportamiento recomendado:

- `401`: renovar sesion o redirigir al login.
- `403`: ocultar o deshabilitar funciones administrativas.
- `400`: mostrar mensaje general y errores de fila cuando existan.
- `404`: mostrar producto o importacion no encontrada.
- `500`: mostrar error temporal y permitir reintentar.

## 13. Notas de compatibilidad

- El engine vive en el backend y no debe duplicarse en el frontend.
- La organizacion se determina por el token del usuario.
- El valor `organizationId = 1` se usa como compatibilidad para datos antiguos.
- El endpoint XLSX actual procesa la primera hoja.
- La persistencia real requiere que MySQL este disponible y que el backend haya inicializado el esquema.
