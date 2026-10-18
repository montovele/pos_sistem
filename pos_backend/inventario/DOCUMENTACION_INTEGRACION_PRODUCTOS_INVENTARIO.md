# Integración del inventario con el catálogo de productos del POS

## 1. Objetivo

Este documento define cómo conectar el módulo de inventario con el catálogo de productos que ya maneja el POS para evitar duplicidad de entidades, inconsistencias de stock y errores en ventas, importación y reportes.

La regla de negocio fundamental es:

- Los productos del POS son la entidad principal.
- El inventario es el estado de stock de esos productos por almacén.
- Los movimientos y auditorías son dependientes del producto y del almacén.

## 2. Problema actual

Actualmente el proyecto separa dos conceptos:

- catálogo de productos en `productos`
- inventario en `inventario_items`

Esta estructura puede funcionar como versión inicial, pero en un POS real no es la arquitectura correcta, porque:

- el mismo producto aparece dos veces conceptualmente
- hay riesgo de que el stock del POS y el stock del inventario no coincidan
- la importación masiva puede crear datos inconsistentes
- la venta y el inventario no comparten la misma fuente de verdad

## 3. Arquitectura correcta

La arquitectura correcta es:

```text
productos (maestro)
  -> inventario_items (stock por almacén)
  -> inventario_movimientos (historial)
  -> ventas / transacciones (descuentan stock)
```

### Relación recomendada

- `productos.id` es la entidad principal
- `inventario_items.product_id` referencia al producto real
- `inventario_items.warehouse` representa el almacén
- `inventario_items.stock` es el saldo real por almacén
- `inventario_movimientos.product_id` y `inventario_movimientos.warehouse` permiten auditoría

## Comportamiento de importación

Una importación persistente sincroniza cada SKU con `productos` dentro de la organización autenticada y guarda su `product_id` en `inventario_items`. Así, el catálogo consultado por el POS y la validación de productos de una transacción reconocen el mismo artículo; el SKU importado también puede coincidir con `codigo_altern`.

La previsualización (`dryRun`) no crea ni actualiza productos o existencias. Si la organización no tiene filas importadas, el backend debe seguir rechazando la venta: no se debe aceptar un precio/stock declarado solamente por el cliente. Para el caso `KG-003`, primero hay que importar el artículo con su stock real en la organización activa.

## 4. Modelo de datos propuesto

### 4.1 Tabla `productos`

Mantener la tabla actual, reforzando campos clave:

```sql
CREATE TABLE IF NOT EXISTS productos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sku VARCHAR(100) NOT NULL,
  codigo_prod VARCHAR(100) NULL,
  codigo_altern VARCHAR(100) NULL,
  nombre_prod VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit VARCHAR(3) NOT NULL DEFAULT 'PZA',
  sale_by_weight TINYINT(1) NOT NULL DEFAULT 0,
  org_id INT NOT NULL DEFAULT 1,
  id_category INT NULL,
  description TEXT NULL,
  image VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_productos_org_sku (org_id, sku)
);
```

### 4.2 Tabla `inventario_items`

La estructura recomendada:

```sql
CREATE TABLE IF NOT EXISTS inventario_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL DEFAULT 1,
  product_id BIGINT NULL,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100) NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(150) NULL,
  unit VARCHAR(3) NOT NULL DEFAULT 'PZA',
  stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  min_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  supplier VARCHAR(255) NULL,
  warehouse VARCHAR(100) NOT NULL DEFAULT 'PRINCIPAL',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventario_product
    FOREIGN KEY (product_id) REFERENCES productos(id)
    ON DELETE SET NULL,
  UNIQUE KEY uq_inventario_org_product_warehouse (organization_id, product_id, warehouse),
  UNIQUE KEY uq_inventario_org_sku_warehouse (organization_id, sku, warehouse),
  INDEX idx_inventario_org_sku (organization_id, sku),
  INDEX idx_inventario_warehouse_stock (warehouse, stock, min_stock)
);
```

### 4.3 Tabla `inventario_movimientos`

Debe incluir el producto real para auditoría:

```sql
CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL DEFAULT 1,
  product_id BIGINT NULL,
  inventario_item_id BIGINT NULL,
  sku VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL DEFAULT 'PRINCIPAL',
  movement_type ENUM('entrada','salida','ajuste','venta','devolucion') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  stock_before DECIMAL(12,3) NOT NULL DEFAULT 0,
  stock_after DECIMAL(12,3) NOT NULL DEFAULT 0,
  reason VARCHAR(255) NULL,
  reference_type VARCHAR(100) NULL,
  reference_id VARCHAR(100) NULL,
  user_id INT NULL,
  username VARCHAR(150) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movimientos_product
    FOREIGN KEY (product_id) REFERENCES productos(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_movimientos_item
    FOREIGN KEY (inventario_item_id) REFERENCES inventario_items(id)
    ON DELETE SET NULL
);
```

## 5. Regla de integración

### 5.1 Origen de verdad

La fuente de verdad del catálogo es `productos`.

El inventario no debe ser una entidad independiente con sus propios datos duros de producto. Debe ser un reflejo del stock del mismo producto por almacén.

### 5.2 Identidad operativa

La unicidad real debe ser:

```text
organization_id + product_id + warehouse
```

La compatibilidad con importaciones debe mantener:

```text
organization_id + sku + warehouse
```

## 6. Flujo de negocio recomendado

### 6.1 Venta del POS

Cuando se venden productos:

1. se identifica el producto por `product_id` o `sku`
2. se consulta su stock en `inventario_items`
3. se descuenta la cantidad pedida
4. se registra un movimiento en `inventario_movimientos`

### 6.2 Importación masiva

Cuando llega un CSV / JSON / XLSX:

1. se normaliza el SKU
2. se busca el producto real en `productos`
3. si el producto existe, se actualiza `inventario_items`
4. si no existe, se marca como error o se rechaza
5. se registra el historial de importación

### 6.3 Ajuste manual

Cuando se hace un ajuste o conteo físico:

1. se identifica el producto por `product_id`
2. se actualiza el stock por almacén
3. se registra la diferencia en movimientos

## 7. Reglas de negocio claves

- un producto puede existir en varios almacenes
- un registro de inventario debe apuntar a un `product_id` real
- no se debe crear un producto duplicado por importación
- el SKU debe ser único por organización
- importaciones con SKU inexistente deben reportarse como error
- ventas y ajustes deben registrar `stock_before` y `stock_after`

## 8. Plan de migración segura

### Fase 1: compatibilidad incremental

- agregar `product_id` a `inventario_items`
- agregar `product_id` a `inventario_movimientos`
- dejar `sku` como referencia de compatibilidad
- no romper los endpoints actuales

### Fase 2: sincronización de SKU

- crear función para resolver `product_id` desde el SKU
- actualizar importaciones para que usen `product_id` si existe
- mantener `sku` para reportes y compatibilidad

### Fase 3: validación en ventas

- adaptar `src/services/transactionService.js` para consultar stock y actualizar usando `product_id`
- asegurar que la venta no pueda reducir stock por debajo de 0

### Fase 4: limpieza de modelo

- hacer `product_id` obligatorio en inventario
- mantener `sku` solo como campo derivado y referencial

## 9. Cambios recomendados en el código actual

### 9.1 En `src/config/database.js`

Agregar columnas y restricciones a `inventario_items` y `inventario_movimientos`:

```sql
ALTER TABLE inventario_items
  ADD COLUMN product_id BIGINT NULL AFTER organization_id,
  ADD CONSTRAINT fk_inventario_product
    FOREIGN KEY (product_id) REFERENCES productos(id) ON DELETE SET NULL;

ALTER TABLE inventario_movimientos
  ADD COLUMN product_id BIGINT NULL AFTER organization_id,
  ADD CONSTRAINT fk_movimientos_product
    FOREIGN KEY (product_id) REFERENCES productos(id) ON DELETE SET NULL;
```

### 9.2 En `inventario/module/inventoryRepository.js`

Resolver producto de esta forma:

```js
const resolveProductReference = async ({ sku, productId, organizationId }) => {
  if (productId) {
    return { productId };
  }

  const [rows] = await connection.execute(
    'SELECT id FROM productos WHERE org_id = ? AND (sku = ? OR codigo_prod = ? OR codigo_altern = ?) LIMIT 1',
    [organizationId, sku, sku, sku]
  );

  return rows[0] ? { productId: rows[0].id } : { productId: null };
};
```

### 9.3 En `src/services/transactionService.js`

Antes de descontar stock, consultar la relación del producto con el inventario real por `product_id` o `sku`.

## 10. Recomendación final de diseño

La idea no es crear dos productos, sino un producto único con dos perspectivas:

- Producto como catálogo del POS
- Inventario como estado físico del producto por almacén

Esto permite:

- una sola fuente de verdad
- menos inconsistencias
- mejor trazabilidad
- importación más segura
- ventas y auditoría conectadas

## 11. Conclusión

El inventario debe estar conectado con el catálogo del POS porque ambos representan la misma unidad de negocio. El inventario no es un catálogo paralelo, sino una capa operacional del producto.

La integración correcta se logra mediante:

- `product_id` como relación real
- `sku` como referencia de compatibilidad
- `warehouse` como dimensión del stock
- `inventario_movimientos` como historial de cambios
- `productos` como base maestra

Con esto, la importación, las ventas y los reportes quedan alineados al mismo modelo del negocio.
