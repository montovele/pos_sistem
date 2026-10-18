# Engine de importación de inventario

## Objetivo
El engine debe permitir importar inventario desde un archivo CSV, XLSX o JSON y convertirlo a un formato interno único para su validación y persistencia.

## Flujo propuesto

1. Leer archivo del cliente o del sistema.
2. Detectar tipo de archivo (CSV, XLSX, JSON).
3. Normalizar cabeceras a un formato estándar.
4. Validar cada fila y detectar errores.
5. Resolver duplicados, faltantes y unidades.
6. Generar resumen con éxito, warning y errors.
7. Persistir o devolver respuesta sin guardar si dryRun es true.

## Normalización de columnas
Se recomienda mapear columnas como:

```text
sku -> sku
codigo_barras -> barcode
nombre -> name
categoria -> category
unidad -> unit
stock_actual -> stock
stock_minimo -> minStock
precio_compra -> cost
precio_venta -> price
proveedor -> supplier
almacen -> warehouse
activo -> active
```

## Estructura interna esperada

```js
{
  sku: 'SKU-001',
  barcode: '750000000001',
  name: 'Producto de prueba',
  category: 'Bebidas',
  unit: 'PZA',
  stock: 25,
  minStock: 5,
  cost: 18.5,
  price: 29.99,
  supplier: 'Proveedor A',
  warehouse: 'PRINCIPAL',
  active: true
}
```

## Reglas iniciales de validación
- SKU requerido.
- Nombre requerido.
- Stock y precios numéricos.
- Las unidades válidas deben estar dentro de un conjunto permitido: PZA, KG, LT, CAJA.
- Si la fila está incompleta, se marca como inválida.

## Resultado esperado del engine
```json
{
  "totalRows": 120,
  "validRows": 108,
  "invalidRows": 12,
  "duplicates": 3,
  "dryRun": true,
  "rows": [
    { "sku": "SKU-001", "status": "valid" },
    { "sku": "SKU-999", "status": "invalid", "errors": ["SKU requerido"] }
  ]
}
```

## Estado actual
- El engine vive separado del módulo HTTP en `inventario/engine`.
- El parsing CSV soporta valores entrecomillados y UTF-8.
- El engine expone importación CSV, JSON y XLSX sin depender de Express, MySQL o el servicio de inventario.
- Valida extensiones, MIME, tamaño máximo de 10 MB, máximo de 10.000 filas y valores negativos.
- Conserva la fila original en el resultado para permitir auditoría JSON sin acoplarse a MySQL.

## Siguientes pasos
- Completar pruebas de integración contra diferentes versiones de MySQL.
- Añadir soporte para múltiples hojas XLSX si el negocio lo requiere.
- Añadir descarga/exportación del historial de auditoría.
