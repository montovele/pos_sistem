# Contrato backend para unidades de producto: KG y PZA

## Objetivo

El backend debe enviar una unidad de venta consistente para que el frontend pueda distinguir correctamente entre:

- Productos vendidos por pieza: `PZA`.
- Productos vendidos por peso: `KG`.

Un producto con unidad `KG` no debe agregarse automaticamente como una pieza. El frontend debe solicitar el peso, convertirlo a kilogramos y calcular el importe con la formula:

```text
importe = precioPorKg * cantidadEnKg
```

## Contrato recomendado

Cada producto debe incluir estos campos:

```json
{
  "id": 101,
  "codigoProd": "FRUTA-001",
  "nombreProd": "Manzana roja",
  "price": 120.00,
  "unit": "KG",
  "saleByWeight": true,
  "stock": 85.500,
  "active": true
}
```

Producto vendido por pieza:

```json
{
  "id": 102,
  "codigoProd": "ENV-001",
  "nombreProd": "Envase plastico",
  "price": 5.00,
  "unit": "PZA",
  "saleByWeight": false,
  "stock": 200,
  "active": true
}
```

## Reglas obligatorias

1. `unit` debe aceptar unicamente `KG` o `PZA`.
2. `saleByWeight` debe ser booleano real: `true` o `false`, no texto.
3. Para productos `KG`, `price` representa el precio de un kilogramo.
4. Para productos `PZA`, `price` representa el precio de una pieza.
5. `stock` debe representar la misma unidad indicada en `unit`.
6. No enviar `unit: "kg"` junto con `saleByWeight: false`.
7. No enviar `unit: "PZA"` junto con `saleByWeight: true`.
8. Evitar nombres ambiguos como `unidad`, `tipoVenta` o valores numericos sin documentacion.

## Respuesta de productos

La lista debe conservar los campos de unidad sin transformarlos:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 101,
        "codigoProd": "FRUTA-001",
        "nombreProd": "Manzana roja",
        "price": 120.00,
        "unit": "KG",
        "saleByWeight": true,
        "stock": 85.500
      }
    ],
    "total": 1,
    "page": 1,
    "perPage": 50,
    "totalPages": 1
  }
}
```

La respuesta de `GET /products/by-code` debe devolver el mismo contrato de producto.

## Validacion backend

Antes de guardar o actualizar un producto, validar la combinacion de unidad y venta por peso:

```js
const unit = String(product.unit || '').trim().toUpperCase()
const saleByWeight = product.saleByWeight === true

if (!['KG', 'PZA'].includes(unit)) {
  throw new Error('unit debe ser KG o PZA')
}

if ((unit === 'KG') !== saleByWeight) {
  throw new Error('unit y saleByWeight no son compatibles')
}
```

Tambien se recomienda normalizar antes de responder:

```js
const normalizeProduct = (product) => {
  const unit = String(product.unit || 'PZA').trim().toUpperCase()
  const saleByWeight = unit === 'KG'

  return {
    ...product,
    unit,
    saleByWeight,
    price: Number(product.price || 0),
    stock: Number(product.stock || 0)
  }
}
```

## Stock

El backend debe definir `stock` segun `unit`:

- `unit: "KG"`: `stock` esta expresado en kilogramos. Ejemplo: `85.500`.
- `unit: "PZA"`: `stock` esta expresado en piezas. Ejemplo: `200`.

Para una venta por peso, validar que la cantidad solicitada no supere el stock disponible:

```js
if (product.unit === 'KG' && quantity > product.stock) {
  throw new Error('Peso solicitado superior al stock disponible')
}
```

Despues de confirmar la venta:

```js
product.stock = Number((product.stock - quantity).toFixed(3))
```

## Contrato de transacciones

El frontend envia la cantidad en la unidad de venta del producto:

```json
{
  "items": [
    {
      "productId": 101,
      "codigoProd": "FRUTA-001",
      "nombreProd": "Manzana roja",
      "quantity": 0.250,
      "price": 120.00,
      "unit": "KG"
    },
    {
      "productId": 102,
      "codigoProd": "ENV-001",
      "nombreProd": "Envase plastico",
      "quantity": 2,
      "price": 5.00,
      "unit": "PZA"
    }
  ],
  "total": 40.60,
  "paymentMethod": "cash"
}
```

El backend debe calcular cada linea asi:

```js
const quantity = Number(item.quantity)
const price = Number(item.price)
const subtotal = Number((price * quantity).toFixed(2))
```

Validaciones por tipo:

```js
if (item.unit === 'PZA' && !Number.isInteger(quantity)) {
  throw new Error('Un producto PZA requiere una cantidad entera')
}

if (item.unit === 'KG' && quantity <= 0) {
  throw new Error('Un producto KG requiere una cantidad positiva')
}
```

## Respuesta esperada al registrar la venta

```json
{
  "success": true,
  "data": {
    "codigoTransaccion": "TRX-20260918-0001",
    "items": [
      {
        "productId": 101,
        "quantity": 0.250,
        "price": 120.00,
        "unit": "KG",
        "subtotal": 30.00
      }
    ],
    "subtotal": 30.00,
    "tax": 4.80,
    "total": 34.80
  }
}
```

## Compatibilidad temporal con contratos antiguos

Si el backend todavia utiliza nombres antiguos, debe enviar tambien el contrato nuevo:

```json
{
  "unit": "KG",
  "saleByWeight": true,
  "unidadVenta": "KG",
  "ventaPorPeso": true
}
```

La compatibilidad temporal no debe sustituir la normalizacion definitiva. El frontend debe recibir siempre `unit` y `saleByWeight`.

## Casos de prueba obligatorios

1. Producto `KG`, precio `120`, cantidad `0.250`: subtotal `30.00`.
2. Producto `KG`, cantidad `1.500`: subtotal `180.00`.
3. Producto `PZA`, cantidad `2`: subtotal igual a `price * 2`.
4. Producto `PZA`, cantidad `1.5`: rechazar la transaccion.
5. Producto `KG` sin stock suficiente: rechazar la transaccion.
6. Venta mixta con productos `KG` y `PZA`.
7. Verificar que `GET /products` y `GET /products/by-code` devuelvan los mismos campos.
8. Verificar que el descuento y el impuesto se calculen sobre el subtotal de cada linea.

## Checklist de implementacion

- [ ] Agregar `unit` a la tabla o modelo de productos.
- [ ] Agregar `saleByWeight` o derivarlo siempre desde `unit`.
- [ ] Normalizar unidades a `KG` y `PZA` en respuestas de API.
- [ ] Normalizar `price` y `stock` como numeros.
- [ ] Validar cantidades decimales solo para `KG`.
- [ ] Validar stock en kilogramos para productos `KG`.
- [ ] Descontar stock despues de confirmar la transaccion.
- [ ] Actualizar `GET /products`, busqueda y busqueda por codigo.
- [ ] Probar una venta mixta.

## Resultado esperado en el frontend

Con este contrato:

- Un producto `unit: "KG"` se muestra como `kg`.
- El boton del producto muestra `Pesar`.
- El producto no se agrega automaticamente como pieza.
- El usuario captura gramos o lee la bascula.
- `250 g` se envia como `quantity: 0.250`.
- El importe se calcula como `precio por kg * cantidad en kg`.
- Un producto `unit: "PZA"` continua funcionando con cantidades enteras.
