# Caracteristicas del engine de inventario

## 1. Descripcion general

El engine de inventario es el componente encargado de leer, normalizar y validar datos de productos antes de enviarlos al flujo de persistencia.

Ubicacion:

```text
inventario/engine/importEngine.js
```

El engine esta desacoplado de Express, MySQL y el servicio de inventario. Puede utilizarse desde rutas HTTP, procesos batch, tareas programadas o pruebas automatizadas.

## 2. Formatos soportados

### CSV

Puede procesar:

- Cabeceras con acentos.
- Valores entrecomillados.
- Comas dentro de valores.
- Saltos de linea Windows y Unix.
- Codificacion UTF-8.
- BOM al inicio del archivo.

Ejemplo:

```csv
sku,nombre,unidad,stock,precio_venta
SKU-001,"Cafe, molido",PZA,20,29.99
```

### JSON

Acepta un arreglo directo:

```json
[
  {
    "sku": "SKU-001",
    "nombre": "Cafe molido",
    "unidad": "PZA",
    "stock": 20
  }
]
```

Tambien acepta un objeto con la propiedad `rows`:

```json
{
  "rows": [
    {
      "sku": "SKU-001",
      "nombre": "Cafe molido",
      "unidad": "PZA",
      "stock": 20
    }
  ]
}
```

### XLSX y XLS

Puede leer archivos de Excel recibidos como `Buffer`.

Actualmente procesa la primera hoja del libro y convierte sus filas a objetos internos.

```js
const rows = inventoryImportEngine.parseXlsx(buffer);
```

## 3. Limites de seguridad

- Tamano maximo: `10 MB`.
- Maximo de filas: `10.000`.
- Extensiones aceptadas: `csv`, `json`, `xlsx`, `xls`.
- MIME permitidos:
  - `text/csv`
  - `application/json`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/vnd.ms-excel`
  - `application/octet-stream`

## 4. Normalizacion de cabeceras

El engine convierte cabeceras diferentes a una estructura comun.

| Entrada | Campo interno |
| --- | --- |
| `sku` | `sku` |
| `codigo` | `sku` |
| `codigo_interno` | `sku` |
| `nombre` | `name` |
| `producto` | `name` |
| `codigo_barras` | `barcode` |
| `categoria` | `category` |
| `linea` | `category` |
| `unidad` | `unit` |
| `stock_actual` | `stock` |
| `inventario` | `stock` |
| `stock_minimo` | `minStock` |
| `precio_compra` | `cost` |
| `precio_venta` | `price` |
| `proveedor` | `supplier` |
| `almacen` | `warehouse` |
| `ubicacion` | `warehouse` |
| `activo` | `active` |

Tambien elimina espacios y acentos de las cabeceras.

## 5. Estructura normalizada

Cada fila valida o invalida se transforma en una estructura comun:

```js
{
  index: 0,
  raw: {
    sku: 'SKU-001',
    nombre: 'Cafe molido'
  },
  sku: 'SKU-001',
  barcode: '',
  name: 'Cafe molido',
  category: '',
  unit: 'PZA',
  stock: 20,
  minStock: 5,
  cost: 18.5,
  price: 29.99,
  supplier: '',
  warehouse: 'PRINCIPAL',
  active: true,
  valid: true,
  errors: []
}
```

El campo `raw` conserva los datos originales para auditoria y trazabilidad.

## 6. Validaciones

El engine valida:

- SKU obligatorio.
- Nombre obligatorio.
- Stock numerico.
- Stock minimo numerico.
- Costo numerico.
- Precio numerico.
- Stock no negativo.
- Stock minimo no negativo.
- Costo no negativo.
- Precio no negativo.
- Unidad valida.
- Archivo no vacio.
- Extension permitida.
- MIME permitido.
- Tamano maximo.
- Cantidad maxima de filas.

Unidades permitidas:

```text
PZA
KG
LT
CAJA
```

## 7. Duplicados

Los duplicados se detectan mediante la combinacion:

```text
SKU + warehouse
```

Ejemplo:

```text
SKU-001 + PRINCIPAL
```

Dos filas con el mismo SKU y almacen se marcan como `duplicate`.

El mismo SKU puede existir en almacenes diferentes.

## 8. Estados de las filas

Cada fila puede tener uno de estos estados:

| Estado | Descripcion |
| --- | --- |
| `valid` | Puede pasar a persistencia |
| `invalid` | Tiene uno o mas errores |
| `duplicate` | Repite SKU y almacen dentro de la importacion |

Las filas invalidas y duplicadas no deben persistirse.

## 9. Resumen de importacion

El engine genera un resumen con:

```js
{
  totalRows: 120,
  validRows: 108,
  invalidRows: 9,
  duplicates: 3,
  dryRun: true,
  rows: []
}
```

Cada elemento de `rows` incluye:

```js
{
  index: 0,
  raw: {},
  sku: 'SKU-001',
  status: 'valid',
  errors: []
}
```

## 10. Modo dry-run

El modo `dryRun` permite validar y previsualizar una importacion sin modificar el inventario.

```js
const result = await inventoryImportEngine.importFromCsv(csvText, {
  dryRun: true
});
```

El frontend debe mostrar el resumen y solicitar confirmacion antes de ejecutar la persistencia real.

## 11. Funciones publicas

### `parseCsv(csvText)`

Lee CSV y devuelve filas normalizadas.

```js
const rows = inventoryImportEngine.parseCsv(csvText);
```

### `parseJson(payload)`

Lee un arreglo u objeto JSON con `rows`.

```js
const rows = inventoryImportEngine.parseJson(payload);
```

### `parseXlsx(buffer)`

Lee la primera hoja de un archivo Excel.

```js
const rows = inventoryImportEngine.parseXlsx(buffer);
```

### `normalizeRows(rows)`

Normaliza objetos que ya fueron leidos por otra fuente.

```js
const rows = inventoryImportEngine.normalizeRows(inputRows);
```

### `validateFile(metadata)`

Valida extension, MIME y tamano.

```js
inventoryImportEngine.validateFile({
  filename: 'inventario.csv',
  mimetype: 'text/csv',
  size: 2048
});
```

### `summarize(rows)`

Genera el resumen de filas normalizadas.

```js
const summary = inventoryImportEngine.summarize(rows);
```

### `importFromCsv(csvText, options)`

Procesa CSV y devuelve un resultado de importacion.

### `importFromJson(payload, options)`

Procesa JSON y devuelve un resultado de importacion.

## 12. Ejemplo de flujo completo

```js
const rows = inventoryImportEngine.parseJson(payload);
const summary = inventoryImportEngine.summarize(rows);
const acceptedRows = rows.filter((row, index) => summary.rows[index].status === 'valid');

if (!dryRun) {
  await inventoryService.importRows(acceptedRows, {
    dryRun: false,
    source: 'json',
    summary,
    user,
    organizationId
  });
}
```

El engine solo prepara y valida datos. El servicio y el repositorio se encargan de persistirlos.

## 13. Que puede hacer el engine

- Leer datos desde CSV.
- Leer datos desde JSON.
- Leer datos desde Excel.
- Normalizar cabeceras.
- Normalizar valores.
- Convertir numeros.
- Aplicar valores por defecto.
- Validar campos obligatorios.
- Validar unidades.
- Validar valores numericos.
- Rechazar valores negativos.
- Detectar duplicados.
- Conservar datos originales.
- Generar resumen de resultados.
- Permitir previsualizaciones con `dryRun`.
- Devolver errores por fila.
- Funcionar sin conexion a MySQL.
- Funcionar sin Express.
- Ser reutilizado en procesos batch o tareas programadas.

## 14. Que no hace directamente el engine

Estas responsabilidades pertenecen al modulo de inventario:

- Guardar productos en MySQL.
- Crear tablas.
- Registrar auditorias en la base de datos.
- Registrar movimientos de stock.
- Resolver autenticacion.
- Validar roles y permisos.
- Determinar la organizacion del usuario.
- Exponer endpoints HTTP.
- Generar reportes administrativos.

El flujo completo es:

```text
Frontend
  -> API Express
  -> Validacion de autenticacion y permisos
  -> Engine de inventario
  -> Normalizacion y validacion
  -> Servicio de inventario
  -> Repositorio MySQL
  -> Auditoria y movimientos
```

## 15. Integracion con MySQL y JSON

El engine devuelve el JSON original mediante `raw`.

El repositorio lo guarda en la auditoria:

```text
inventario_importacion_filas.raw_data
```

Los productos normalizados se guardan en:

```text
inventario_items
```

Las importaciones se registran en:

```text
inventario_importaciones
```

Los movimientos se registran en:

```text
inventario_movimientos
```

## 16. Integracion con organizaciones

La organizacion se obtiene del usuario autenticado mediante `organizationId`.

El engine no conoce la organizacion ni la gestiona. El modulo la recibe del contexto de autenticacion y la entrega al servicio/repositorio.

La unicidad operativa es:

```text
organization_id + sku + warehouse
```

## 17. Mejoras futuras

- Agregar `importFromXlsx(buffer, options)` para unificar la API de alto nivel con CSV y JSON.
- Procesar multiples hojas XLSX.
- Permitir delimitadores CSV configurables.
- Agregar validacion de columnas obligatorias configurable por cliente.
- Agregar reglas de negocio por organizacion.
- Permitir plantillas de importacion por cliente.
- Implementar procesamiento asincrono para archivos grandes.
- Agregar identificador de lote e idempotencia.
- Incorporar exportacion de reportes.

## 18. Pruebas

Suite actual:

```bash
node --test inventario/module/inventory.test.js
```

Las pruebas cubren:

- CSV con valores entrecomillados.
- Deteccion de duplicados.
- JSON valido e invalido.
- Modo `dryRun`.
- Persistencia demo de filas validas.
- Flujo HTTP.
- XLSX.
- Validacion de archivos.
- Permisos por rol.
- Movimientos de inventario.
