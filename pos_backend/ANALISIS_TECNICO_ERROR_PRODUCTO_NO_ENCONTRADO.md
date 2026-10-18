# Análisis técnico del error: “Producto no encontrado” en POS

## 1. Resumen ejecutivo

El error no surge de la venta en sí, sino de la validación previa del catálogo de productos antes de registrar la transacción. En los logs del backend se observa claramente que la búsqueda del producto falla porque el catálogo que consulta el frontend está vacío o no coincide con la organización activa del usuario.

El sistema está intentando resolver el producto por código y/o por nombre en la ruta de productos y luego en la ruta de inventario. En ambos casos el backend responde con un conjunto vacío o con 404, por lo que el frontend interpreta que el producto no existe y termina mostrando el error “Producto no encontrado”.

La comprobación clave es esta:

- `[PRODUCTS /] muestra: []`
- `[INVENTARIO /] organización: 1 totalItems: 0 origen: inventario_items`
- `[ProductService] searchProducts response ... total: 0`

Eso indica que el problema principal es de datos y de coincidencia de organización, no de la lógica de venta o de una mala serialización del payload.

---

## 2. Evidencia observada en los logs

### 2.1 Catálogo vacío

Los logs muestran que el sistema intenta cargar productos desde la API y el resultado es un arreglo vacío:

```text
[PRODUCTS /] muestra: []
[AUTH] validando token para ruta: /api/inventario?search=300&page=1&perPage=500
[AUTH] usuario autenticado: Ernesto ruta: /api/inventario?search=300&page=1&perPage=500
[INVENTARIO /] fuente: INVENTARIO REAL (inventario_items)
[INVENTARIO /] organización: 1 totalItems: 0 origen: inventario_items
```

Esto significa que el backend de inventario está respondiendo `0` elementos para la organización `1`.

Hay que interpretar este dato con cuidado: la petición registrada usa `search=300`, mientras que el artículo del payload usa `codigoProd: "KG-003"`. Sin confirmar que `300` sea un código de barras asociado a `KG-003`, esa respuesta vacía no demuestra que se haya buscado ese mismo artículo.

### 2.2 La venta se está creando con un producto válido del cliente

La transacción llega así:

```json
{
  "items": [
    {
      "id": "17-1790889089325",
      "productId": 17,
      "codigoProd": "KG-003",
      "nombreProd": "Arandela Plana Galvanizada",
      "quantity": 0.3,
      "unit": "KG",
      "price": 74,
      "subtotal": 22.2,
      "total": 22.2,
      "discountRate": 0,
      "saleByWeight": true
    }
  ],
  "total": 25.75,
  "discount": 0,
  "paymentMethod": "cash",
  "employeeNumber": 3,
  "customer": { "nombre": "Consumidor final", "rfc": "XAXX010101000" },
  "clientTransactionId": "5ac70382-76f8-4c46-8498-535242f2c53b",
  "deviceId": "0ef0ab80-b5ba-48e0-a8bc-045699cb3ecd",
  "createdAt": "2026-10-01T21:11:37.822Z"
}
```

Ese payload es coherente; el problema no está en la estructura del producto ni en el total, porque la venta ya fue armada con datos válidos del catálogo local.

---

## 3. Dónde exactamente se genera el error

El error se genera en dos puntos del backend:

### 3.1 Endpoint de búsqueda por código

Archivo: [backend/server.js](backend/server.js#L1028-L1057)

```js
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
```

### 3.2 Endpoint de búsqueda de producto por ID

También en [backend/server.js](backend/server.js#L1059-L1068):

```js
app.get('/api/products/:id', (req, res) => {
  const id = Number(req.params.id)
  const product = getCatalogProducts(req.query.organizationId ? Number(req.query.organizationId) : null).find((item) => Number(item.id) === id)

  if (!product) {
    return fail(res, 404, 'Producto no encontrado')
  }

  return ok(res, product, 'Producto obtenido')
})
```

### 3.3 Endpoint de inventario por SKU

En [backend/server.js](backend/server.js#L793-L799):

```js
app.get('/api/inventario/:sku', authMiddleware, (req, res) => {
  const item = findInventoryItem(req.params.sku, String(req.query.warehouse || '').toUpperCase())
  return item ? ok(res, item, 'Producto de inventario encontrado') : fail(res, 404, 'Producto de inventario no encontrado')
})
```

Estos endpoints solamente responden 404 cuando no encuentran un producto en la colección actual.

---

## 4. Cuál es la causa profunda

### 4.1 El catálogo está vacío para la organización activa

El backend no está fallando por el payload de venta; está fallando porque `getCatalogProducts(...)` devuelve vacío para `organizationId = 1`.

Esto se confirma con:

```text
[INVENTARIO /] organización: 1 totalItems: 0 origen: inventario_items
```

El sistema está buscando en el inventario real y encuentra cero registros.

### 4.2 El frontend hace varias búsquedas con fallback

El servicio [src/services/productService.ts](src/services/productService.ts#L157-L186) intenta estas rutas:

- `/products` con `search`
- `/products/search`
- `/inventario` con `search`

Cuando todas regresan vacías, la lógica termina en un error de “producto no encontrado”.

Eso explica por qué el frontend muestra el error aunque la venta sí tiene un producto en el carrito.

---

## 5. ¿Es error de frontend o de backend?

### Respuesta corta

Es principalmente un problema de backend de datos y de contexto organizacional.

### Detalle

#### Backend

Sí es responsabilidad del backend que:

- `GET /api/products` devuelva productos reales para la organización correcta
- `GET /api/inventario` devuelva filas reales
- `GET /api/products/by-code` devuelva el producto solicitado si existe
- `organizationId` del usuario coincida con los datos del catálogo

#### Frontend

El frontend también tiene una deficiencia: cuando el catálogo está vacío, no maneja un estado “sin productos en esta organización” de forma clara y termina mostrando un error genérico de “Producto no encontrado”.

Pero eso es de UX, no la causa raíz del problema.

La causa raíz es de backend: el catálogo o inventario no está cargado para la organización activa.

---

## 6. Diagnóstico técnico del flujo

El flujo real es:

1. El usuario carga la pantalla POS.
2. El frontend consulta productos/inventario.
3. El backend responde `[]` o total 0.
4. El producto seleccionado no queda resuelto en el catálogo.
5. El frontend intenta buscar por código / nombre.
6. El backend responde 404 “Producto no encontrado”.
7. El usuario ve el error aunque la venta mapeara datos de un producto localmente.

Esto implica que el problema no es la creación de la transacción, sino la falta de datos de referencia del producto en la organización actual.

---

## 7. Qué debe corregirse

### 7.1 En backend

- Validar que `organizationId` del usuario esté presente y coincida con la organización del catálogo.
- Devolver una respuesta clara cuando no haya productos para esa organización.
- Revisar si la tabla `inventario_items` o `productos` está vacía para `organizationId = 1`.
- Confirmar que el producto `KG-003` exista efectivamente antes de aceptar la venta.

### 7.2 En frontend

- Manejar correctamente el caso “catalogo vacío” sin convertirlo en “producto no encontrado”.
- Mostrar un mensaje más descriptivo:
  - “No hay productos cargados para esta organización”
  - “No se encontró el producto en el catálogo activo”
- Evitar que una búsqueda fallida haga que la venta se bloquee si la misma ya fue validada localmente.

---

## 8. Diagnóstico a partir de los logs

La causa principal del error es que el backend no está devolviendo productos para la organización activa. El frontend solo refleja esa condición. La venta no falla por un mal formato del payload; falla porque el sistema de referencia del producto está vacío/inconsistente.

En términos simples:

- No hay productos disponibles para la organización 1.
- Por eso el frontend no encuentra `KG-003`.
- Por eso aparece “Producto no encontrado”.

La corrección debe enfocarse en la calidad y consistencia de los datos de catálogo e inventario por organización, no solo en la lógica de venta.

## 9. Hallazgo en el código y corrección

El flujo tenía además un desacople reproducible: la importación persistente escribía filas en `inventario_items`, pero no creaba/actualizaba el producto correspondiente en `productos` ni guardaba su `product_id`. En cambio, `transactionService` valida primero contra `productos`. Por eso, un SKU importado podía existir en inventario y aun así producir “Producto no encontrado” al vender.

Se corrigió la importación para sincronizar el SKU con `productos` dentro de la organización autenticada y enlazar `inventario_items.product_id`. La resolución de ventas reconoce también `codigo_altern`/`codigoAltern`. La validación de stock y organización permanece activa; no se acepta el producto solamente por los datos enviados desde el cliente.

Los logs de este caso reportan `totalItems: 0` para `inventario_items` en organización 1. Por tanto, el cambio de código no inventa el stock faltante: para que la venta de `KG-003` pueda procesarse, hay que importar ese SKU con su existencia real y organización correcta, usando `dryRun: false`. También se debe verificar si el valor leído como `300` corresponde a un código de barras de ese SKU.
