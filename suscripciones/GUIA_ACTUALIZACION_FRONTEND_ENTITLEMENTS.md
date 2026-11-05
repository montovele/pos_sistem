# Guia frontend para actualizar entitlements SaaS

## Objetivo

Permitir que el frontend pueda consultar, crear, editar y eliminar entitlements sin reemplazar accidentalmente los demás módulos asociados.

El backend conserva los entitlements en dos niveles:

```text
Plan SaaS
  -> saas_plan_entitlements

Suscripcion concreta
  -> saas_subscription_entitlements
```

Los entitlements del plan son la configuración base. Los entitlements de la suscripción permiten una excepción específica para una cuenta sin modificar el plan global.

## Regla principal

Una actualización individual solo modifica el módulo indicado.

Ejemplo:

```text
Antes:  ct, billing, local_service
Editar billing
Después: ct, billing, local_service
```

No se debe enviar el objeto completo para editar un solo módulo si se utiliza un endpoint individual.

## Endpoints por plan

### Consultar módulos del plan

```http
GET /suscripciones/admin/saas/plans/:planId/entitlements
```

Respuesta:

```json
{
  "data": [
    {
      "feature_key": "billing",
      "enabled": 1,
      "limits_json": "{\"documents\":100}"
    },
    {
      "feature_key": "ct",
      "enabled": 1,
      "limits_json": null
    }
  ]
}
```

### Crear o actualizar un módulo del plan

```http
PATCH /suscripciones/admin/saas/plans/:planId/entitlements/:featureKey
Content-Type: application/json
```

Payload:

```json
{
  "enabled": true,
  "limits": {
    "documents": 100
  }
}
```

El endpoint funciona como `upsert`:

- Si el módulo existe, lo actualiza.
- Si no existe, lo crea.
- No elimina los demás módulos.

### Eliminar un módulo del plan

```http
DELETE /suscripciones/admin/saas/plans/:planId/entitlements/:featureKey
```

Respuesta:

```json
{
  "data": {
    "deleted": true,
    "plan_id": "3",
    "feature_key": "billing"
  }
}
```

## Endpoints por suscripción

Estos endpoints modifican solamente la suscripción indicada y no alteran el plan global.

### Consultar módulos de una suscripción

```http
GET /suscripciones/admin/saas/subscriptions/:subscriptionId/entitlements
```

### Crear o actualizar un módulo de una suscripción

```http
PATCH /suscripciones/admin/saas/subscriptions/:subscriptionId/entitlements/:featureKey
Content-Type: application/json
```

```json
{
  "enabled": true,
  "limits": {
    "providers": 25
  }
}
```

### Eliminar un módulo de una suscripción

```http
DELETE /suscripciones/admin/saas/subscriptions/:subscriptionId/entitlements/:featureKey
```

Después de cambiar un entitlement de suscripción, el backend invalida la caché de la cuenta.

## Cliente HTTP recomendado

```js
async function updateSubscriptionEntitlement(subscriptionId, featureKey, values) {
  const response = await api.patch(
    `/suscripciones/admin/saas/subscriptions/${subscriptionId}/entitlements/${encodeURIComponent(featureKey)}`,
    values
  );

  return response.data.data;
}

async function deleteSubscriptionEntitlement(subscriptionId, featureKey) {
  const response = await api.delete(
    `/suscripciones/admin/saas/subscriptions/${subscriptionId}/entitlements/${encodeURIComponent(featureKey)}`
  );

  return response.data.data;
}
```

## Actualización del store

Después de crear, editar o eliminar un entitlement, el frontend debe actualizar el registro local. Para evitar estados desincronizados, se recomienda volver a consultar la suscripción efectiva:

```js
async function refreshSubscription() {
  const response = await api.get('/suscripciones/account/subscription');
  const subscription = response.data.data;

  subscriptionStore.subscription = subscription;
  subscriptionStore.entitlements = subscription.entitlements || {};
  subscriptionStore.limits = subscription.limits || {};
}

async function saveEntitlement(subscriptionId, featureKey, payload) {
  await updateSubscriptionEntitlement(subscriptionId, featureKey, payload);
  await refreshSubscription();
}

async function removeEntitlement(subscriptionId, featureKey) {
  await deleteSubscriptionEntitlement(subscriptionId, featureKey);
  await refreshSubscription();
}
```

No conservar solamente el objeto enviado al `PATCH`; la respuesta efectiva puede estar afectada por el estado de la suscripción, la fecha de expiración y los overrides de cuenta.

## Renderizado de módulos

El frontend debe validar `access_allowed` y el entitlement:

```js
function hasEntitlement(featureKey) {
  const subscription = subscriptionStore.subscription;

  return subscription?.access_allowed === true
    && subscription.entitlements?.[featureKey] === true;
}
```

Ejemplo:

```vue
<button v-if="hasEntitlement('ct')">
  Abrir CT
</button>

<button v-if="hasEntitlement('billing')">
  Facturación
</button>
```

No utilizar únicamente el código del plan:

```js
// Incorrecto
const canUseCt = subscription.plan?.id === 'pro';
```

El plan identifica la configuración comercial; `access_allowed` y `entitlements` representan la autorización efectiva.

## Estado vacío o desincronizado

Si frontend recibe:

```json
{
  "status": "active",
  "access_allowed": true,
  "entitlements": {}
}
```

debe mostrar un estado de configuración incompleta y refrescar la suscripción. No debe asumir que todos los módulos están habilitados.

Registro recomendado durante integración:

```js
console.info('[frontend][subscription-entitlements]', {
  subscriptionId: subscription.subscription_id,
  planId: subscription.plan?.id,
  status: subscription.status,
  accessAllowed: subscription.access_allowed,
  keys: Object.keys(subscription.entitlements || {})
});
```

## Flujo después del pago

1. Frontend crea el checkout.
2. Stripe confirma el pago.
3. El webhook actualiza la suscripción.
4. El backend sincroniza el snapshot de entitlements.
5. Frontend ejecuta `GET /suscripciones/account/subscription`.
6. El store reemplaza la suscripción anterior.
7. La interfaz se renderiza usando `entitlements`.

El frontend no debe habilitar módulos solamente al recibir `201` desde checkout.

## Manejo de errores

```js
try {
  await saveEntitlement(subscriptionId, featureKey, payload);
} catch (error) {
  const code = error.response?.data?.error?.code;

  if (code === 'ENTITLEMENT_NOT_FOUND') {
    // El módulo ya no existe; volver a consultar la lista.
    await loadEntitlements(subscriptionId);
  } else if (error.response?.status === 403) {
    // El usuario no tiene permisos administrativos.
    showPermissionError();
  } else {
    showGenericError('No fue posible actualizar el módulo.');
  }
}
```

## Checklist frontend

- [ ] El listado se carga desde el endpoint de entitlements correspondiente.
- [ ] La edición individual usa `PATCH`.
- [ ] La eliminación individual usa `DELETE`.
- [ ] Se usa `encodeURIComponent(featureKey)` en la URL.
- [ ] No se reemplaza toda la colección para editar un módulo.
- [ ] Se refresca `GET /suscripciones/account/subscription` después de cambios.
- [ ] El store conserva `entitlements` y `limits`.
- [ ] La UI valida `access_allowed`.
- [ ] La UI no autoriza módulos solamente por `plan_id`.
- [ ] Los errores `401`, `403` y `404` se muestran correctamente.

## Resultado esperado

Una suscripción puede conservar múltiples módulos:

```json
{
  "data": {
    "status": "active",
    "access_allowed": true,
    "entitlements": {
      "ct": true,
      "billing": true,
      "local_service": true
    },
    "limits": {
      "documents": 100,
      "providers": 25
    }
  }
}
```

Actualizar o eliminar un módulo no debe afectar los demás entitlements de la suscripción.
