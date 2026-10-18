# Corrección de backend para productos por peso (KG)

## Objetivo

Evitar que el backend rechace ventas por peso con mensajes como:

> Un producto PZA requiere una cantidad entera

El problema ocurre cuando un producto que realmente se vende por kilogramo llega con metadata inconsistente, por ejemplo:

- `unit: "PZA"`
- `saleByWeight: false`
- nombre o descripción con texto como "vendida por peso"

## Regla correcta

La clasificación debe seguir esta lógica:

- Si el producto es `KG`, entonces:
  - `unit` debe ser `"KG"`
  - `saleByWeight` debe ser `true`
  - `quantity` puede ser decimal
- Si el producto es `PZA`, entonces:
  - `unit` debe ser `"PZA"`
  - `saleByWeight` debe ser `false`
  - `quantity` debe ser entero

## Validación obligatoria en backend

Antes de guardar o procesar una venta, ejecutar una normalización mínima:

```js
const normalizeProductUnit = (product) => {
  const name = String(product?.nombreProd || product?.name || '').toLowerCase()
  const description = String(product?.descripcion || product?.description || '').toLowerCase()
  const rawUnit = String(product?.unit || product?.unidad || 'PZA').trim().toUpperCase()

  const weightSignals = ['kg', 'kilogram', 'kilo', 'gram', 'gr', 'peso', 'vendida por peso', 'venta por peso']
  const isWeightByText = weightSignals.some(text => name.includes(text) || description.includes(text))
  const legacyWeightFlag = Boolean(
    product?.saleByWeight ||
    product?.ventaPorPeso ||
    product?.esPesable ||
    product?.isWeighted ||
    product?.weighable
  )

  const normalizedUnit = (rawUnit === 'KG' || rawUnit === 'G' || rawUnit === 'GR' || rawUnit === 'GRAMOS' || isWeightByText || legacyWeightFlag)
    ? 'KG'
    : 'PZA'

  return {
    ...product,
    unit: normalizedUnit,
    saleByWeight: normalizedUnit === 'KG'
  }
}
```

Y al validar la venta:

```js
const unit = String(item.unit || '').trim().toUpperCase()
const quantity = Number(item.quantity ?? 0)

if (unit === 'PZA' && !Number.isInteger(quantity)) {
  throw new Error('Un producto PZA requiere una cantidad entera')
}

if (unit === 'KG' && quantity <= 0) {
  throw new Error('Un producto KG requiere una cantidad positiva')
}
```

## Reglas para las respuestas del backend

El backend debe responder siempre con:

```json
{
  "unit": "KG",
  "saleByWeight": true
}
```

o:

```json
{
  "unit": "PZA",
  "saleByWeight": false
}
```

Nunca enviar una mezcla inconsistente como:

```json
{
  "unit": "PZA",
  "saleByWeight": true
}
```

## Recomendación de normalización

Cuando se obtenga la lista de productos o una búsqueda por código, aplicar una normalización antes de devolverla al frontend:

```js
const normalizeProduct = (product) => {
  const normalized = normalizeProductUnit(product)

  return {
    ...product,
    unit: normalized.unit,
    saleByWeight: normalized.saleByWeight,
    price: Number(product.price || 0),
    stock: Number(product.stock || 0)
  }
}
```

## Criterio de aceptación

Se considera correcto si:

1. Un producto vendido por peso llega con `unit: "KG"` y `saleByWeight: true`.
2. Un producto vendido por pieza llega con `unit: "PZA"` y `saleByWeight: false`.
3. El frontend no necesita “adivinar” el tipo de unidad por el nombre del producto.
4. El error de cantidad entera ya no aparece para productos por kilogramo.

## Observación

La clasificación no debe depender solo del campo `unit` si el backend tiene datos heredados. Debe validarse también por nombre, descripción, y flag de peso.
