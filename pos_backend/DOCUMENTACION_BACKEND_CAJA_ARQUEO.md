# Backend de caja y arqueo

## Objetivo

El backend controla la caja por usuario autenticado. El frontend no puede decidir por sí solo si una venta pertenece a una caja ni calcular el resultado definitivo del arqueo.

La identidad se obtiene del token Bearer y se utiliza `numeroEmpleado` como clave de la sesión de caja.

## Reglas de negocio

1. Todas las rutas de caja requieren autenticación.
2. Un usuario solo puede tener una caja abierta al mismo tiempo.
3. Una venta solo se registra si el usuario tiene una caja abierta.
4. Cada venta se guarda con `cashSessionId`, `numeroEmpleado` y `paymentMethod`.
5. Las ventas de caja se obtienen por `cashSessionId`, no solo por fecha.
6. El backend calcula los totales del arqueo desde las ventas registradas.
7. El cliente no puede sobrescribir el empleado, el total de ventas ni la diferencia del arqueo.
8. Para cerrar la caja debe existir un efectivo contado válido.
9. El historial se conserva asociado al `numeroEmpleado`.

## Autenticación

Todas las peticiones protegidas deben enviar:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

El usuario autenticado se obtiene en `req.user`. No se debe confiar en un `numeroEmpleado` recibido desde el navegador.

## Endpoints

### Consultar estado

```http
GET /api/caja/status
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "id": "CAJA-1720000000000-1",
    "abierta": true,
    "cajero": "Administrador",
    "numeroEmpleado": 1,
    "base": 500,
    "fechaApertura": "2026-09-16T10:00:00.000Z",
    "horaApertura": "2026-09-16T10:00:00.000Z",
    "horaCierre": "",
    "totalVentas": 1200,
    "totalEfectivo": 700,
    "totalEsperado": 1200,
    "totalTransacciones": 4,
    "efectivoContado": null,
    "diferencia": null
  }
}
```

Cuando no existe una caja abierta, `abierta` es `false` y los totales regresan en cero.

### Abrir caja

```http
POST /api/caja/open
```

Body:

```json
{
  "baseCaja": 500
}
```

`cajero` y `numeroEmpleado` no son necesarios: el backend los toma de la sesión autenticada.

Respuestas de error relevantes:

- `400`: base ausente, negativa o no numérica.
- `409`: el usuario ya tiene una caja abierta.

### Consultar ventas de la caja

```http
GET /api/caja/ventas
```

Devuelve únicamente las ventas ligadas a la caja abierta del usuario actual mediante `cashSessionId`.

Si no hay caja abierta, devuelve una lista vacía.

### Consultar arqueo

```http
GET /api/caja/arqueo
```

El resultado incluye:

- `base`: efectivo inicial.
- `totalEfectivo`: ventas cuyo método es `cash`, `efectivo` o `money`.
- `totalEsperado`: `base + totalEfectivo`.
- `efectivoContado`: valor guardado por el cajero o `null`.
- `diferencia`: `efectivoContado - totalEsperado`, o `null` si aún no se cuenta.

### Guardar arqueo

```http
POST /api/caja/arqueo
```

Body:

```json
{
  "efectivoContado": 1198.5
}
```

El backend recalcula `totalEsperado` y `diferencia`. No utiliza una diferencia enviada por el frontend.

Respuestas de error relevantes:

- `400`: efectivo contado inválido o negativo.
- `409`: no existe una caja abierta.

### Cerrar caja

```http
POST /api/caja/close
```

Body:

```json
{
  "efectivoContado": 1198.5
}
```

El cierre vuelve a calcular los importes con las ventas reales, guarda el resultado en el historial y elimina la sesión abierta.

Respuestas de error relevantes:

- `400`: no se proporcionó un efectivo contado válido.
- `409`: no existe una caja abierta.

### Historial

```http
GET /api/caja/history
```

Devuelve las aperturas y cierres del usuario autenticado. Un usuario nunca recibe el historial de otro empleado.

## Registro de ventas

### Crear venta

```http
POST /api/transactions
```

Body mínimo:

```json
{
  "items": [
    {
      "productId": 10,
      "codigoProd": "P001",
      "nombreProd": "Producto demo",
      "quantity": 2,
      "price": 100,
      "total": 200
    }
  ],
  "total": 232,
  "paymentMethod": "cash"
}
```

El backend agrega automáticamente:

- `numeroEmpleado` desde `req.user`.
- `nombreCajero` desde `req.user`.
- `cashSessionId` desde la caja abierta actual.
- Fecha, ticket y estado de la transacción.

Una venta sin caja abierta responde `409`.

## Flujo recomendado del frontend

1. Consultar `GET /api/caja/status` al entrar al POS.
2. Si `abierta` es `false`, mostrar el enlace a la pantalla de caja y bloquear el cobro.
3. Abrir caja desde `POST /api/caja/open`.
4. Antes de confirmar el pago, volver a validar el estado de caja.
5. Registrar la venta con `POST /api/transactions`.
6. Consultar `GET /api/caja/arqueo` para mostrar el efectivo esperado.
7. Guardar el efectivo contado con `POST /api/caja/arqueo`.
8. Cerrar con `POST /api/caja/close`.

## Almacenamiento actual

Con MySQL disponible, el backend persiste el flujo en:

- `cash_sessions`: apertura, empleado, base, efectivo contado, diferencia y cierre.
- `transacciones.cash_session_id`: relación de cada venta con la sesión de caja que la originó.
- `arqueo_caja`: historial de arqueos y sus importes calculados.

El script [CREAR_BD_ssaxxon_pos.sql](CREAR_BD_ssaxxon_pos.sql) incluye las tablas e índices necesarios. El inicializador de `src/config/database.js` crea la estructura faltante para instalaciones existentes. Cuando `USE_DEMO_MODE=true` y MySQL no está disponible, se usa memoria como fallback y los datos se pierden al reiniciar el proceso.

## Archivos relacionados

- `backend/server.js`: rutas y reglas de caja.
- `src/pages/CajaPage.vue`: apertura, arqueo y cierre.
- `src/pages/PosPage.vue`: validación de caja antes de cobrar.
- `src/components/pos/PaymentForm.vue`: creación de la venta con el usuario autenticado.
