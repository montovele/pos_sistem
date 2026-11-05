# Analisis del error de entitlements y solucion frontend

## Resumen

La suscripcion se crea y el pago de Stripe se confirma correctamente, pero frontend no muestra los modulos asociados al plan.

El problema no se origina en Stripe Elements ni en el pago. La causa esta en la separacion entre:

- el pago y estado de la suscripcion;
- la configuracion funcional del plan;
- la lectura de entitlements desde frontend.

## Causa del error

Los logs recibidos muestran eventos como:

```text
product.created
plan.created
price.created
```

Estos eventos solamente indican que se crearon recursos comerciales en Stripe. No indican que se hayan creado registros en:

```text
saas_plan_entitlements
```

El plan `legacy` funcionaba porque el seed del sistema inserto explicitamente sus modulos:

```text
local_service
ct
billing
```

Los planes nuevos tenian precio y suscripcion, pero no tenian filas de entitlements. Por eso el backend podia devolver una suscripcion activa con:

```json
{
  "status": "active",
  "access_allowed": true,
  "entitlements": {}
}
```

## Distincion importante

El estado de pago no habilita automaticamente los modulos.

```text
Stripe payment succeeded
        |
        v
saas_subscriptions.status = active
        |
        v
saas_plans
        |
        v
saas_plan_entitlements
        |
        v
frontend entitlements
```

Una suscripcion activa sin entitlements configurados sigue sin tener modulos funcionales.

## Logs relevantes

### Logs que no prueban entitlements

```text
product.created
plan.created
price.created
```

Estos eventos solo prueban que Stripe tiene producto y precio.

### Logs que prueban la configuracion del plan

```text
[subscriptions][entitlements][plan-create-request]
[subscriptions][entitlements][plan-edit-request]
[subscriptions][entitlements][plan-update-request]
```

Deben mostrar:

```text
has_entitlements: true
entitlement_keys: [ 'ct', 'billing' ]
```

### Logs que prueban la persistencia

```text
[subscriptions][entitlements][repository-write]
[subscriptions][entitlements][repository-write-result]
```

El resultado esperado es:

```text
entry_count: 2
stored_count: 2
stored_keys: [ 'billing', 'ct' ]
```

### Logs que prueban la lectura

```text
[subscriptions][entitlements][read]
```

Debe mostrar el mismo conjunto de modulos:

```text
entitlement_count: 2
entitlement_keys: [ 'billing', 'ct' ]
```

Si frontend recibe un objeto vacio y el log muestra `stored_count: 0`, el problema esta en la configuracion del plan. Si `stored_count` es mayor que cero pero frontend recibe vacio, debe revisarse la ruta o la cache.

## Solucion frontend

Frontend debe enviar los entitlements al crear o editar el plan. Crear solamente el producto o precio en Stripe no es suficiente.

### Crear un plan

```http
POST /suscripciones/admin/saas/plans
Content-Type: application/json
```

```json
{
  "codigo": "pro",
  "nombre": "Pro",
  "descripcion": "Plan profesional",
  "estado": "active",
  "entitlements": {
    "ct": true,
    "billing": true,
    "local_service": false
  }
}
```

### Actualizar los entitlements de un plan

```http
PUT /suscripciones/admin/saas/plans/:planId/entitlements
Content-Type: application/json
```

```json
{
  "entitlements": {
    "ct": true,
    "billing": true,
    "local_service": true
  }
}
```

Este endpoint reemplaza la configuracion completa del plan. El frontend debe enviar todos los modulos deseados, no solo el modulo que cambio.

Tambien se acepta una lista simple:

```json
{
  "entitlements": ["ct", "billing", "local_service"]
}
```

## Flujo frontend recomendado

1. Crear el plan SaaS.
2. Guardar sus entitlements.
3. Crear y activar el Price de Stripe.
4. Mostrar el plan en el catalogo.
5. Contratar el plan mediante `POST /suscripciones/account/checkout`.
6. Esperar la confirmacion del webhook.
7. Consultar `GET /suscripciones/account/subscription`.
8. Habilitar la interfaz segun `access_allowed` y `entitlements`.

El frontend no debe habilitar modulos inmediatamente despues del `201` del checkout. Debe refrescar la suscripcion cuando el webhook haya actualizado el estado.

## Lectura para frontend

```http
GET /suscripciones/account/subscription
```

Respuesta esperada:

```json
{
  "data": {
    "account_id": 2,
    "status": "active",
    "plan": {
      "id": "pro",
      "name": "Pro"
    },
    "access_allowed": true,
    "is_expired": false,
    "current_period_end": "2026-10-05T18:02:01.000Z",
    "entitlements": {
      "ct": true,
      "billing": true,
      "local_service": false
    },
    "limits": {}
  }
}
```

## Regla de renderizado

Frontend debe comprobar ambos valores:

```js
const subscription = response.data;

const canUseCt = subscription.access_allowed === true
  && subscription.entitlements?.ct === true;

const canUseBilling = subscription.access_allowed === true
  && subscription.entitlements?.billing === true;
```

No se debe hacer esto:

```js
const canUseCt = subscription.plan?.id === 'pro';
```

El codigo del plan no es una autorizacion. La autorizacion efectiva esta en `access_allowed` y `entitlements`.

## Ejemplo de store frontend

```js
async function loadSubscription() {
  const response = await api.get('/suscripciones/account/subscription');
  const subscription = response.data.data;

  state.subscription = subscription;
  state.entitlements = subscription.entitlements || {};
  state.accessAllowed = subscription.access_allowed === true;
}

function hasEntitlement(featureKey) {
  return state.accessAllowed === true
    && state.entitlements[featureKey] === true;
}
```

## Manejo de estados

| Estado | `access_allowed` | Accion frontend |
|---|---:|---|
| `active` | `true` | Mostrar modulos permitidos |
| `trialing` | `true` | Mostrar modulos permitidos |
| `past_due` | `false` | Mostrar aviso de pago pendiente |
| `suspended` | `false` | Bloquear modulos |
| `expired` | `false` | Mostrar renovacion |
| `canceled` | `false` | Mostrar reactivacion |

## Diagnostico desde frontend

Cuando no aparecen los modulos, registrar temporalmente:

```js
console.info('[frontend][subscription]', {
  status: subscription.status,
  accessAllowed: subscription.access_allowed,
  plan: subscription.plan?.id,
  currentPeriodEnd: subscription.current_period_end,
  entitlements: subscription.entitlements,
  entitlementKeys: Object.keys(subscription.entitlements || {})
});
```

Interpretacion:

- `status=active`, `access_allowed=true`, `entitlements={}`: el plan no tiene entitlements persistidos o la respuesta no los esta cargando.
- `status=active`, `access_allowed=false`: revisar fecha, estado o cache.
- `entitlements` contiene modulos pero la UI no los muestra: el problema esta en el store, nombres de claves o condiciones de renderizado.
- La respuesta no tiene `entitlements`: frontend esta usando una ruta que no devuelve la proyeccion completa o esta leyendo una respuesta antigua.

## Cache

Despues de actualizar entitlements, frontend debe solicitar nuevamente:

```http
GET /suscripciones/account/subscription
```

El backend invalida:

```text
saas:entitlements:account:{accountId}:v1
```

No se debe conservar indefinidamente la respuesta anterior en el store. Despues de contratar, cambiar de plan o editar entitlements, se recomienda refrescar la suscripcion.

## Checklist de integracion

- [ ] El frontend envia `entitlements` al crear o editar el plan.
- [ ] Se confirma `has_entitlements: true` en el log de entrada.
- [ ] Se confirma `stored_count > 0` en el repositorio.
- [ ] El plan contratado apunta al `plan_id` correcto.
- [ ] La suscripcion tiene estado `active` o `trialing`.
- [ ] `current_period_end` es una fecha futura.
- [ ] `GET /suscripciones/account/subscription` devuelve `entitlements`.
- [ ] El store actualiza la respuesta despues del webhook.
- [ ] La UI consulta `access_allowed` y `entitlements`.
- [ ] La UI no usa solamente `plan_id` para autorizar modulos.

## Conclusion

El error anterior se producia porque Stripe creaba correctamente el producto y el precio, pero eso no configuraba los modulos SaaS. La solucion frontend consiste en enviar y administrar explicitamente los entitlements del plan, volver a consultar la suscripcion despues del webhook y renderizar cada modulo a partir de `access_allowed` y `entitlements`.
