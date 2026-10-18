# Análisis de venta por peso en POS

## 1. Objetivo

Permitir que el punto de venta procese correctamente productos vendidos por peso, diferenciándolos de los productos vendidos por pieza.

El sistema debe permitir capturar el peso en gramos o kilogramos, convertirlo a kilogramos y calcular el importe correspondiente antes de agregar el producto a la venta actual.

## 2. Comportamiento esperado

### Productos normales

- Se agregan directamente al carrito.
- Utilizan cantidades enteras.
- El importe se calcula por unidad.
- Ejemplo: 2 piezas x $50 = $100.

### Productos vendidos por peso

- No deben agregarse automáticamente al seleccionar el producto.
- Deben mostrar una acción relacionada con pesar el producto.
- El usuario puede capturar gramos manualmente.
- El sistema convierte los gramos a kilogramos.
- Opcionalmente, el peso puede obtenerse desde una báscula conectada.
- El importe se calcula con la siguiente fórmula:

```text
Importe = Precio por kilogramo x Peso en kilogramos
```

Ejemplo:

```text
Precio: $120 por kg
Peso: 250 g = 0.250 kg
Importe: $120 x 0.250 = $30.00
```

## 3. Flujo funcional

1. El usuario selecciona un producto del catálogo POS.
2. El sistema determina si el producto se vende por pieza o por peso.
3. Si es un producto normal, se agrega una unidad al carrito.
4. Si es un producto pesable, se selecciona como producto pendiente de peso.
5. El usuario captura el peso en gramos o solicita la lectura de la báscula.
6. El sistema convierte el valor a kilogramos.
7. El usuario confirma la acción **Agregar peso**.
8. El carrito recibe la cantidad decimal.
9. El subtotal, IVA y total se recalculan automáticamente.
10. El producto se procesa junto con los productos normales al momento del cobro.

## 4. Implementación actual

### Catálogo de productos

Archivo: `src/components/pos/ProductCatalog.vue`

Responsabilidades:

- Mostrar el producto y su unidad de venta.
- Mostrar el botón `Agregar` para productos normales.
- Mostrar el botón `Pesar` para productos pesables.
- Evitar que un producto pesable agregue automáticamente su precio completo.
- Emitir la selección del producto para activar el panel de peso.

### Vista principal del POS

Archivo: `src/pages/PosPage.vue`

Responsabilidades:

- Mostrar el panel **Venta por peso**.
- Mantener el producto pesable seleccionado.
- Capturar el peso en gramos.
- Convertir gramos a kilogramos.
- Solicitar la lectura opcional de la báscula.
- Agregar el peso calculado al carrito.

### Carrito

Archivos:

- `src/stores/cartStore.ts`
- `src/components/pos/CartItem.vue`

Responsabilidades:

- Aceptar cantidades decimales para productos pesables.
- Mantener cantidades enteras para productos normales.
- Permitir incrementos de 0.1 kg para productos pesables.
- Recalcular el importe como precio por kg multiplicado por la cantidad.

### Detección de productos pesables

Archivo: `src/utils/helpers.ts`

La función compartida `isWeightedProduct` reconoce diferentes contratos de backend:

- `unit`
- `unidad`
- `unitType`
- `tipoUnidad`
- `unidadMedida`
- `unidadVenta`
- `sellingUnit`
- `weightUnit`
- `unitMeasure`
- `tipoVenta`
- `saleByWeight`
- `soldByWeight`
- `isWeighted`
- `weighable`
- `weightBased`
- `ventaPorPeso`

También reconoce valores como:

- `kg`
- `kgs`
- `kilo`
- `kilogramo`
- `g`
- `gr`
- `gramo`
- `gramos`
- `peso`
- `pesable`

## 5. Integración con la báscula

Archivo: `src/services/hardwareAgent.ts`

Se preparó el método:

```ts
hardwareAgent.readScale()
```

Este método intenta consumir:

```http
GET /scale/weight
```

La respuesta esperada puede contener:

```json
{
  "weight": 250,
  "weightGrams": 250,
  "grams": 250,
  "unit": "g",
  "stable": true
}
```

También puede devolver el peso en kilogramos:

```json
{
  "weight": 0.25,
  "weightKg": 0.25,
  "unit": "kg",
  "stable": true
}
```

Si la báscula no está disponible, el POS muestra un mensaje y permite introducir el peso manualmente.

## 6. Cálculo de importes

El precio del producto debe representar el precio de una unidad comercial.

Para productos pesables:

```text
subtotal = precio_por_kg x cantidad_en_kg
```

Después se aplican descuentos e impuestos conforme a la lógica existente del carrito y del formulario de pago.

La cantidad se limita a tres decimales para evitar errores de precisión visual y operativa.

## 7. Riesgos identificados

### Metadata inconsistente

El backend puede enviar distintos nombres para la unidad o la venta por peso. Por esta razón, la detección está centralizada en `isWeightedProduct`.

La solución definitiva sería normalizar el contrato del backend para enviar siempre campos consistentes, por ejemplo:

```json
{
  "unit": "kg",
  "saleByWeight": true
}
```

### Báscula no disponible

La lectura automática depende de que el agente local implemente `/scale/weight`. El POS rechaza una respuesta con `stable: false` y permite introducir el peso manualmente como respaldo.

### Stock por peso

Debe definirse si `stock` representa:

- Kilogramos disponibles.
- Gramos disponibles.
- Número de unidades o paquetes.

Esta definición es necesaria para validar que el peso solicitado no supere las existencias reales.

### Redondeo

Se recomienda mantener tres decimales para la cantidad y dos decimales para importes monetarios.

## 8. Pendientes recomendados

1. Confirmar con backend el contrato definitivo de productos pesables.
2. Confirmar la unidad real del campo `stock`.
3. Validar lectura de básculas USB, serial o red según el hardware disponible.
4. Agregar validación para impedir vender más peso que el stock disponible.
5. Agregar pruebas para:
   - 250 g.
   - 1.5 kg.
   - Producto normal junto con producto pesable.
   - Producto pesable sin báscula.
   - Producto sin stock.
   - Descuentos sobre productos pesables.
6. Verificar que el backend acepte cantidades decimales en `/transactions`.

## 9. Estado actual

La interfaz y el carrito están preparados para diferenciar productos normales y productos por peso.

El cálculo esperado es:

```text
precio por kg x peso en kg
```

La captura manual está contemplada. La lectura automática usa `/scale/weight` y requiere un peso válido y estable del agente local.
