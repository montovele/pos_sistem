# Corrección de unidades soportadas en backend para inventario

## Objetivo

Permitir que el backend acepte todas las unidades de medida que usa el negocio y que el frontend ya está enviando/importando, sin romper validaciones ni afectar la lógica actual del inventario.

Se debe mantener compatibilidad con las unidades ya soportadas y ampliar la validación para incluir las unidades adicionales que aparecen en los archivos de importación y en la operación real del POS.

## Unidades soportadas

La validación del backend debe aceptar estas unidades:

- PZA
- KG
- LT
- CAJA
- M
- ROLLO
- L
- PAQUETE
- ML
- PAR

## Regla de negocio

La unidad debe normalizarse antes de guardar o validar, para que unidades equivalentes o variantes con mayúsculas/minúsculas o sinónimos no generen errores.

### Normalización esperada

- PZA, PIEZA, PIEZAS, UNIDAD, UNIDADES -> PZA
- KG, KILO, KILOS, KILOGRAMO, KILOGRAMOS, G, GR, GRAMO, GRAMOS -> KG
- LT, LITRO, LITROS, L -> LT
- CAJA, CAJAS -> CAJA
- M, METRO, METROS -> M
- ROLLO, ROLLOS -> ROLLO
- PAQUETE, PAQUETES -> PAQUETE
- PAR, PARES -> PAR
- ML, MILILITRO, MILILITROS -> ML

## Problema detectado

El backend actualmente rechaza unidades como:

- M
- ROLLO
- L
- PAQUETE
- ML
- PAR

Y devuelve mensajes del tipo:

- Unidad no soportada: M
- Unidad no soportada: ROLLO
- Unidad no soportada: L
- Unidad no soportada: PAQUETE
- Unidad no soportada: ML
- Unidad no soportada: PAR

Esto provoca que importaciones validas desde el frontend fallen en la validación de backend.

## Corrección recomendada

### 1. Centralizar validación de unidad

En el backend, crear o actualizar una función de normalización/validación, por ejemplo:

```js
const SUPPORTED_UNITS = new Set([
  'PZA',
  'KG',
  'LT',
  'CAJA',
  'M',
  'ROLLO',
  'L',
  'PAQUETE',
  'ML',
  'PAR'
])

const UNIT_ALIASES = {
  PZA: 'PZA',
  PIEZA: 'PZA',
  PIEZAS: 'PZA',
  UNIDAD: 'PZA',
  UNIDADES: 'PZA',

  KG: 'KG',
  KILO: 'KG',
  KILOS: 'KG',
  KILOGRAMO: 'KG',
  KILOGRAMOS: 'KG',
  G: 'KG',
  GR: 'KG',
  GRAMO: 'KG',
  GRAMOS: 'KG',

  LT: 'LT',
  LITRO: 'LT',
  LITROS: 'LT',
  L: 'LT',

  CAJA: 'CAJA',
  CAJAS: 'CAJA',

  M: 'M',
  METRO: 'M',
  METROS: 'M',

  ROLLO: 'ROLLO',
  ROLLOS: 'ROLLO',

  PAQUETE: 'PAQUETE',
  PAQUETES: 'PAQUETE',

  PAR: 'PAR',
  PARES: 'PAR',

  ML: 'ML',
  MILILITRO: 'ML',
  MILILITROS: 'ML'
}

function normalizeUnit(value) {
  if (value === null || value === undefined) return null

  const normalized = String(value).trim().toUpperCase()
  return UNIT_ALIASES[normalized] || normalized
}

function isSupportedUnit(value) {
  const normalized = normalizeUnit(value)
  return SUPPORTED_UNITS.has(normalized)
}
```

### 2. Validar antes de guardar el registro

Aplicar la normalización en todos los puntos donde se reciba una unidad:

- importación CSV
- importación JSON
- importación XLSX
- creacion de producto manual
- actualización de producto
- validación de movimientos

Ejemplo:

```js
const unit = normalizeUnit(payload.unit || payload.unidad)

if (!isSupportedUnit(unit)) {
  throw new Error(`Unidad no soportada: ${payload.unit || payload.unidad}`)
}

payload.unit = unit
payload.unidad = unit
```

### 3. Usar la misma validación para importación masiva

En el proceso de importación, cada fila debe normalizar la unidad antes de la validación final. Esto evita que la importación falle solo porque el nombre llega con mayúsculas o alias.

```js
const rowUnit = normalizeUnit(row.unidad || row.unit)

if (!isSupportedUnit(rowUnit)) {
  errors.push(`Unidad no soportada: ${row.unidad || row.unit}`)
  row.status = 'invalid'
  continue
}

row.unidad = rowUnit
row.unit = rowUnit
```

## Recomendación de implementación

### En backend para CSV

En la lógica de parsing de CSV:

- leer la columna `unidad`
- convertir a mayúsculas
- normalizar con `normalizeUnit`
- aceptar los valores finales soportados

### En backend para JSON/XLSX

Aplicar la misma normalización a:

- `unit`
- `unidad`
- `Unidad`
- `UNIDAD`
- `unitMeasure`
- `unidadMedida`

## Criterios de aceptación

La corrección queda completa cuando:

1. El backend acepta `M`, `ROLLO`, `L`, `PAQUETE`, `ML`, `PAR`.
2. La importación masiva no falla por esas unidades.
3. Las unidades equivalentes se normalizan al valor aceptado.
4. El frontend y el backend usan la misma lista de unidades soportadas.
5. Las validaciones de stock y cantidad siguen funcionando sin cambios de compatibilidad.

## Nota importante

El frontend ya fue ajustado para aceptar esta lista y normalizar alias. Si el backend no se corrige con la misma lista, el error seguirá apareciendo aunque la UI haya sido actualizada.

## Lista final de sincronización

Frontend y backend deben quedar alineados con esta lista exacta:

```text
PZA, KG, LT, CAJA, M, ROLLO, L, PAQUETE, ML, PAR
```

Esto garantiza que los importes, validaciones y estados de inventario no se rompan por diferencias entre cliente y servidor.
