# Integracion frontend: planes SaaS y contratacion Stripe

## 1. Fuente de verdad

El frontend debe utilizar los planes administrados en SaaS como unica fuente de verdad.

- El administrador crea y mantiene el plan en SaaS.
- El administrador crea el precio recurrente desde SaaS.
- El backend crea o registra el Price recurrente de Stripe asociado a esa version de precio.
- El frontend nunca envia precio, moneda, descuento ni `stripe_price_id` al checkout.
- Un plan solo puede contratarse cuando esta activo y tiene un Price Stripe activo para el entorno actual.

La API monta estas rutas bajo `/suscripciones`.

## 2. Catalogo publico

### Consultar planes disponibles

```http
GET /suscripciones/plans
```

No requiere autenticacion. El alias anterior tambien esta disponible:

```http
GET /suscripciones/account/plans
```

La respuesta contiene exclusivamente planes activos con una version de precio activa y un Price Stripe configurado:

```json
{
  "data": [
    {
      "id": 12,
      "codigo": "pro",
      "nombre": "Pro",
      "descripcion": "Plan para equipos profesionales",
      "precio": 499,
      "moneda": "MXN",
      "intervalo": "month",
      "intervalo_cantidad": 1,
      "estado": "active"
    }
  ]
}
```

El frontend debe usar `codigo` como identificador para contratar. No debe fabricar planes ni asumir que existen codigos como `monthly`, `quarterly` o `annual`.

### Estados de la pantalla publica

- `200`: renderizar `data`.
- `data` vacio: mostrar que no hay planes disponibles temporalmente.
- `5xx`: mostrar error de carga y permitir reintentar.
- No mostrar `stripe_price_id` ni datos internos de administracion.

## 3. Inicio de contratacion

El checkout requiere una sesion autenticada. Un visitante publico debe consultar los planes sin iniciar sesion y, al pulsar contratar, iniciar sesion o registrarse antes de continuar.

### Crear Checkout Session

```http
POST /suscripciones/account/checkout
Content-Type: application/json
Idempotency-Key: checkout-<uuid>
```

El frontend debe enviar solamente el codigo del plan:

```json
{
  "plan_id": "pro"
}
```

Ejemplo:

```js
async function startCheckout(planCode) {
  const response = await fetch('/suscripciones/account/checkout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify({ plan_id: planCode })
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'No fue posible iniciar el pago.');

  window.location.assign(body.data.checkout_url);
}
```

`Idempotency-Key` debe conservarse para el mismo intento logico de pago y tener entre 8 y 255 caracteres. No se debe generar una clave nueva al reintentar exactamente la misma operacion.

Respuesta exitosa:

```json
{
  "data": {
    "checkout_url": "https://checkout.stripe.com/...",
    "checkout_session_id": "cs_...",
    "plan_id": "pro"
  }
}
```

El frontend debe redirigir a `checkout_url`. No debe integrar el `stripe_price_id` directamente ni crear sesiones Stripe desde el navegador.

### Errores de checkout

| HTTP | Codigo | Accion frontend |
|---|---|---|
| 401 | `UNAUTHORIZED` | Redirigir a login/registro y conservar el codigo del plan. |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Generar una clave valida y repetir el intento. |
| 422 | `INVALID_SUBSCRIPTION_PLAN` | Actualizar el catalogo y avisar que el plan ya no esta disponible. |
| 422 | `PLAN_STRIPE_NOT_CONFIGURED` | No permitir contratar; informar que el plan esta temporalmente fuera de venta. |
| 503 | `STRIPE_UNAVAILABLE` | Informar indisponibilidad temporal y permitir reintentar. |

## 4. Estado de la suscripcion del usuario

### Consultar suscripcion actual

```http
GET /suscripciones/account/subscription
```

Requiere autenticacion.

Respuesta:

```json
{
  "data": {
    "account_id": 45,
    "status": "active",
    "plan": {
      "id": "pro",
      "name": "Pro"
    },
    "current_period_end": "2026-10-04T00:00:00.000Z",
    "cancel_at_period_end": false,
    "access_allowed": true,
    "is_expired": false,
    "days_remaining": 30,
    "entitlements": {},
    "limits": {}
  }
}
```

Despues del retorno de Stripe, el frontend debe volver a consultar este endpoint. El webhook actualiza el estado en backend; el frontend no debe marcar una suscripcion como pagada por la URL de retorno.

### Refrescar estado

```http
POST /suscripciones/account/subscription/refresh
```

Requiere autenticacion. Usarlo despues del retorno del checkout si la pantalla necesita actualizar el estado inmediatamente.

## 5. Administracion de planes

Todas las rutas admin requieren:

- Sesion autenticada.
- Usuario admin (`rol: admin` o `isAdminUser: true`).
- El permiso indicado.

### Listar planes

```http
GET /suscripciones/admin/saas/plans
```

Permiso: `saas.plan.read`

Query opcional:

- `estado=active|draft|archived`
- `codigo=pro`
- `activo=true|false`

La respuesta devuelve el plan administrativo y, cuando existe, su precio activo del entorno actual.

### Crear plan

```http
POST /suscripciones/admin/saas/plans
Content-Type: application/json
```

Permiso: `saas.plan.create`

```json
{
  "codigo": "pro",
  "nombre": "Pro",
  "descripcion": "Plan para equipos profesionales",
  "estado": "active"
}
```

`estado` puede ser `draft`, `active` o `archived`. Para que aparezca en el catalogo publico debe ser `active` y tener un precio SaaS/Stripe activo.

### Consultar, actualizar y archivar un plan

```http
GET    /suscripciones/admin/saas/plans/:planId
PUT    /suscripciones/admin/saas/plans/:planId
DELETE /suscripciones/admin/saas/plans/:planId
```

Permisos: `saas.plan.read`, `saas.plan.update` y `saas.plan.delete`, respectivamente.

El `DELETE` es un archivado logico. No eliminar referencias historicas desde el frontend.

## 6. Administracion de precios

### Listar versiones de precio

```http
GET /suscripciones/admin/saas/plans/:planId/prices
```

Permiso: `saas.plan.read`

### Crear precio recurrente

```http
POST /suscripciones/admin/saas/plans/:planId/prices
Content-Type: application/json
```

Permiso: `saas.plan.update`

```json
{
  "amount": 499,
  "currency": "MXN",
  "interval_unit": "month",
  "interval_count": 1
}
```

Reglas:

- `amount`: numero no negativo con hasta dos decimales.
- `currency`: codigo ISO de tres letras, por ejemplo `MXN`.
- `interval_unit`: `month` o `year`.
- `interval_count`: entero entre 1 y 12.
- No enviar `stripe_price_id`; el backend lo crea usando la configuracion Stripe del servidor.

Al crear una nueva version activa, la version activa anterior del mismo plan y entorno se archiva.

### Activar o archivar una version

```http
POST /suscripciones/admin/saas/price-versions/:priceVersionId/activate
POST /suscripciones/admin/saas/price-versions/:priceVersionId/archive
```

Permiso: `saas.plan.update`

Despues de activar o archivar un precio, el frontend publico debe volver a cargar `GET /suscripciones/plans`.

## 7. Flujo recomendado para frontend admin

1. Crear el plan en estado `draft` o `active`.
2. Crear su precio desde `POST /admin/saas/plans/:planId/prices`.
3. Confirmar que la respuesta y el listado muestran la version activa.
4. Activar el plan si estaba en `draft` mediante `PUT` con `estado: "active"`.
5. Verificar el resultado en `GET /suscripciones/plans` sin credenciales.
6. Probar contratar usando el `codigo` devuelto por el catalogo publico.

No crear un segundo catalogo de planes en el frontend y no guardar Price IDs de Stripe en variables publicas.

## 8. Checklist de implementacion

- [ ] La pagina publica carga `GET /suscripciones/plans` sin enviar cookies obligatoriamente.
- [ ] Cada boton Contratar usa el `codigo` recibido de la API.
- [ ] Los usuarios no autenticados pasan por login/registro antes del checkout.
- [ ] El checkout usa `credentials: 'include'`.
- [ ] Cada intento envia un `Idempotency-Key` valido.
- [ ] El frontend no envia `amount`, `currency` ni `stripe_price_id` al checkout.
- [ ] La pantalla de resultado vuelve a consultar la suscripcion en backend.
- [ ] El panel admin distingue plan, version de precio y estado de publicacion.
- [ ] Tras cualquier cambio admin se invalida o recarga el catalogo publico.
