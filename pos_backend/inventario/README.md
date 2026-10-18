# Módulo de inventario

## Objetivo
Este módulo está diseñado para iniciar la gestión del inventario del sistema POS, incluyendo:
- catálogo de productos
- stock por SKU y almacén
- alertas por inventario bajo
- auditoría de cambios
- importación masiva desde CSV, Excel o JSON

## Alcance inicial
Se plantea una primera fase sin bloquear la API actual:
1. Crear el módulo de inventario como un conjunto de servicios y rutas reutilizables.
2. Definir un motor de importación robusto para archivos CSV y otros formatos.
3. Preparar una estructura de almacenamiento y validación para registros nuevos.
4. Dejar listo el agente de trabajo para continuar con instrucciones específicas.

## Estructura propuesta

```text
inventario/
  engine/
    importEngine.js
  module/
    index.js
    inventoryService.js
    inventory.routes.js
    inventory.test.js
```

## Modelo de datos sugerido

```json
{
  "sku": "SKU-001",
  "codigoBarras": "750000000001",
  "nombre": "Producto de prueba",
  "categoria": "Bebidas",
  "unidad": "PZA",
  "stockActual": 25,
  "stockMinimo": 5,
  "precioCompra": 18.5,
  "precioVenta": 29.99,
  "proveedor": "Proveedor A",
  "activo": true,
  "almacen": "PRINCIPAL"
}
```

## Endpoints sugeridos
- GET /api/inventario
- GET /api/inventario/:id
- POST /api/inventario
- PUT /api/inventario/:id
- POST /api/inventario/import
- POST /api/inventario/import/csv
- POST /api/inventario/import/xlsx
- GET /api/inventario/importaciones
- GET /api/inventario/reportes/resumen
- GET /api/inventario/reportes/bajo-stock
- GET /api/inventario/reportes/importaciones/:id
- GET /api/inventario/movimientos
- POST /api/inventario/movimientos
- GET /api/inventario/alertas/stock-bajo

## Reglas de negocio iniciales
- Un SKU no puede repetirse en un mismo almacén.
- El stock mínimo debe ser mayor o igual a 0.
- Los valores numéricos deben normalizarse antes de persistirse.
- Las filas inválidas se marcan y no bloquean el proceso total.
- La importación debe poder ejecutarse en modo dry-run antes de guardar.

## Fase siguiente recomendada
- Añadir filtros por rango de fechas a los reportes administrativos.
- Añadir exportación CSV/XLSX de reportes.
- Integrar movimientos de entrada/salida de stock con auditoría.

## Estado de la primera implementación
- CSV soporta valores entrecomillados y cabeceras con acentos.
- JSON acepta directamente un arreglo o un objeto con propiedad `rows`.
- Se detectan duplicados por combinación de SKU y almacén.
- El modo `dryRun` no modifica el inventario en memoria.
- El router reutilizable incluye `POST /import/csv` y `POST /import/json`.
- El engine no depende de Express ni del servicio de inventario.
- El flujo Express conecta `inventario/module/inventory.routes.js` desde `src/app.js`.
- Las rutas persisten únicamente filas válidas y no duplicadas cuando `dryRun` es falso.
- La auditoría de importaciones queda consultable para administradores.
- Los reportes administrativos incluyen KPIs, desglose por almacén/categoría, bajo stock y detalle de importación.
- Los productos y movimientos quedan aislados por `organizationId`; por compatibilidad el valor inicial es `1`.
- Las entradas, salidas y ajustes registran usuario, stock anterior, stock posterior y motivo.
- La organización se asigna desde el usuario autenticado y también puede administrarse desde empleados.
- Las pruebas se ejecutan con `node --test inventario/module/inventory.test.js`.

## Notas
El módulo está conectado al arranque del backend mediante `/api/inventario`. Usa MySQL cuando `global.mysqlAvailable` es verdadero y almacenamiento demo en caso contrario.
