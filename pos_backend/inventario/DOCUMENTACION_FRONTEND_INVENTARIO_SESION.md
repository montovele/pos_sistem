# Frontend: listado de inventario por sesión/organización

## Objetivo

Mostrar el inventario correcto para el usuario autenticado sin romper el funcionamiento del POS ni mezclar el catálogo global de productos con el inventario real de la sesión actual.

La regla base es:

- `/api/products` = catálogo maestro de productos del POS
- `/api/inventario` = inventario real filtrado por la organización/sesión del usuario autenticado
- La venta debe validar stock usando `inventario_items` y no solo el stock del producto maestro

---

## Arquitectura recomendada

### 1. Producto maestro

El catálogo de productos del POS sigue siendo la tabla `productos`.

Uso:

- buscar productos para venta
- listar productos en la caja
- crear/editar productos del catálogo

Endpoint:

- `GET /api/products`
- `GET /api/products/by-code`
- `GET /api/products/:id`

### 2. Inventario real

El inventario real vive en `inventario_items` y siempre debe filtrarse por la organización del usuario autenticado.

Uso:

- mostrar stock por SKU
- mostrar productos existentes en almacén
- visualizar bajo stock
- registrar entradas/salidas

Endpoint:

- `GET /api/inventario`
- `GET /api/inventario/stock-bajo`
- `GET /api/inventario/movimientos`

---

## Reglas de negocio para frontend

### Regla 1: nunca usar `/api/products` como inventario

No se debe mostrar el total de `/api/products` como “inventario total” del usuario, porque ese endpoint cuenta el catálogo de productos y no el stock real del inventario.

Correcto:

- para mostrar el catálogo del POS: `/api/products`
- para mostrar inventario real: `/api/inventario`

### Regla 2: filtrar por la sesión actual

El backend debe recibir el usuario autenticado y usar su `organizationId`.

El inventario que devuelve la API debe ser exclusivamente del usuario actual o de su organización.

Ejemplo de comportamiento esperado:

- usuario A -> solo ve inventario de organización 1
- usuario B -> solo ve inventario de organización 2
- nunca se mezclan bases entre organizaciones

### Regla 3: mostrar inventario como vista complementaria

La vista del cliente debe mostrar dos capas:

1. Catálogo del POS
2. Stock / inventario real

Cada capa tiene su origen y su responsabilidad.

---

## Flujo correcto para el frontend

### Caso A: listar productos para vender

Se usa `/api/products`.

```js
const res = await fetch('/api/products?page=1&perPage=50', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

const data = await res.json();
```

Esto devuelve productos del catálogo disponible para venta.

### Caso B: listar inventario real del usuario actual

Se usa `/api/inventario`.

```js
const res = await fetch('/api/inventario?page=1&perPage=20', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

const data = await res.json();
```

Esto devuelve únicamente los items del inventario asociados a la organización/sesión actual.

### Caso C: validar stock antes de vender

El backend debe hacer la validación final usando `inventario_items` y `product_id`/`sku`.

No dependemos de la UI para decidir si hay stock; la validación debe estar en la lógica de venta del backend.

---

## Contrato esperado de respuesta

### `/api/inventario`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "productId": 10,
      "sku": "SKU-001",
      "name": "Producto demo",
      "category": "Bebidas",
      "unit": "PZA",
      "stock": 25,
      "minStock": 5,
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

### `/api/products`

```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "codigoProd": "SKU-001",
      "nombreProd": "Producto demo",
      "price": 29.99,
      "stock": 25,
      "unit": "PZA"
    }
  ],
  "meta": {
    "total": 6,
    "page": 1,
    "perPage": 50,
    "totalPages": 1
  }
}
```

Nota importante:

- `/api/products` puede devolver 6 productos del catálogo
- `/api/inventario` debe devolver los productos realmente registrados en inventario para esa sesión/organización

---

## Recomendación de UI

### Vista de inventario

Columns sugeridas:

- SKU
- Nombre
- Categoría
- Almacén
- Stock actual
- Mínimo
- Estado

### Vista de POS

Para la pantalla de venta:

- cargar catálogo de productos desde `/api/products`
- si se requiere stock visible, hacer un merge con `/api/inventario` usando `sku` o `productId`
- validar la venta con el backend usando el stock real de inventario

Esto evita que la UI decida de forma local si el producto tiene stock disponible.

---

## Qué evitar

### Evitar 1: contar productos de `productos` como inventario

No usar esto:

```js
const totalInventario = productos.length;
```

porque eso cuenta el catálogo del POS y no el inventario real.

### Evitar 2: mezclar inventarios entre sesiones

No usar un estado global compartido entre diferentes usuarios sin filtrar por organización.

### Evitar 3: confiar solo en stock del catálogo

El catálogo puede tener un campo `stock`, pero la regla final debe ser la del inventario real de `inventario_items`.

---

## Recomendación de implementación segura

### En el frontend

```js
async function fetchInventory() {
  const token = localStorage.getItem('token');

  const res = await fetch('/api/inventario?page=1&perPage=50', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await res.json();
  return payload.success ? payload.data : [];
}
```

### En el backend

La consulta debe llevar siempre:

```js
const organizationId = req.user?.organizationId ?? 1;
```

y filtrar así:

```sql
WHERE organization_id = ?
```

---

## Resultado esperado

Con esta configuración:

- la vista de inventario refleja únicamente el inventario activo del usuario/organización
- el POS sigue funcionando con el catálogo de productos
- la venta sigue validando stock real desde la tabla de inventario
- no se rompe el flujo actual del backend ni la lógica de negocio

---

## Resumen ejecutivo

El frontend debe consumir:

- `/api/products` para catálogo de venta
- `/api/inventario` para stock real y estado del inventario

Y ambos endpoints deben estar ligados al contexto autenticado del usuario para evitar mezclas de negocio o conteos incorrectos.
