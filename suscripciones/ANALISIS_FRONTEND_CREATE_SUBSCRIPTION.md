# Análisis técnico de createSubscription y su integración con frontend

## 1) Ubicación y responsabilidad

La ruta principal que dispara esta lógica se define en [suscripciones/subscription.routes.js](suscripciones/subscription.routes.js):

- POST /suscripciones/admin/saas/accounts/:accountId/subscription

La implementación funcional real está en [suscripciones/subscription.service.js](suscripciones/subscription.service.js), dentro del método `createSubscription(accountId, values, actorUserId, ipAddress)`.

Este método no es solo un INSERT en la tabla de suscripciones. Es el punto de entrada central del ciclo de vida SaaS para una cuenta.

---

## 2) Qué hace exactamente `createSubscription`

La secuencia es esta:

1. Valida el payload
   - `validateSubscription(values)`
   - exige:
     - `status` dentro de `['active', 'trialing', 'past_due', 'canceled', 'expired', 'suspended']`
     - `plan_id` como string

2. Calcula el account destino
   - `const targetAccountId = accountId ?? values.account_id ?? null`

3. Reconciliación del ciclo de vida antes de persistir
   - ejecuta `reconcileSubscriptionLifecycle(targetAccountId, values, actorUserId, ipAddress)`
   - esta llamada asegura que existan o queden consistentes:
     - la cuenta SaaS
     - relación provider-account
     - plan y entitlements del plan
     - entitlements efectivos de la cuenta

4. Crea la suscripción en repositorio
   - `repo.createSubscription(targetAccountId, values, actorUserId, ipAddress)`

5. Normaliza la respuesta del repositorio
   - soporta formatos como array directo o `{ rows }`

6. Invalida la caché de entitlements del account
   - `invalidateAccount(accountId)`

7. Devuelve la proyección efectiva del estado del usuario
   - `project(normalized.rows, normalized.accountId ?? targetAccountId)`

### Resultado de negocio
La intención es que, al crear la suscripción, el sistema quede listo para el acceso real del usuario, sin depender de que el frontend haga operaciones adicionales.

---

## 3) Qué ocurre bajo el capó

### 3.1 Reconciliación del ciclo de vida
La operación central es:

```js
async reconcileSubscriptionLifecycle(accountId, values = {}, actorUserId = null, ipAddress = null) {
  const targetAccountId = accountId ?? values.account_id ?? null;

  if (targetAccountId !== null && typeof repo.ensureAccountForSubscription === 'function') {
    await repo.ensureAccountForSubscription(targetAccountId, values, actorUserId, ipAddress);
  }

  if (values.proveedor_id && typeof repo.ensureProviderForAccount === 'function') {
    await repo.ensureProviderForAccount(targetAccountId, values.proveedor_id, actorUserId, ipAddress);
  }

  if (values.plan_id && typeof repo.ensurePlanEntitlements === 'function') {
    await repo.ensurePlanEntitlements(values.plan_id, values.entitlements || null, actorUserId, ipAddress);
  }

  if (targetAccountId !== null && values.plan_id && typeof repo.reconcileAccountEntitlements === 'function') {
    await repo.reconcileAccountEntitlements(targetAccountId, values.plan_id, actorUserId, ipAddress);
  }

  return targetAccountId;
}
```

Esto significa que la creación de la suscripción no se queda en "guardar un contrato". Hace que el backend deje el entorno listo para que la cuenta ya tenga acceso efectivo.

### 3.2 Persistencia
La parte real de MySQL está en [suscripciones/repository/subscription.repository.js](suscripciones/repository/subscription.repository.js):

- valida que la cuenta exista y esté activa
- valida que el plan exista y esté activo
- inserta en `saas_subscriptions`
- registra auditoría en `saas_subscription_audit`

### 3.3 Proyección de acceso
Después de crear la fila, se ejecuta `project(rows, accountId)`, que convierte la respuesta SQL a un formato consumible por el frontend.

El contrato final que devuelve es algo parecido a:

```json
{
  "account_id": 25,
  "status": "active",
  "plan": {
    "id": "enterprise",
    "name": "Enterprise"
  },
  "current_period_end": "2026-10-01T00:00:00.000Z",
  "cancel_at_period_end": false,
  "entitlements": {
    "ct": true
  },
  "limits": {}
}
```

---

## 4) Payload esperado por la ruta

La ruta del admin usa el siguiente patrón:

- POST /suscripciones/admin/saas/accounts/:accountId/subscription

### Ejemplo de body

```json
{
  "plan_id": "enterprise",
  "status": "active",
  "proveedor_id": 21,
  "current_period_end": "2026-10-01T00:00:00.000Z",
  "cancel_at_period_end": false,
  "external_customer_id": "cus_123",
  "external_subscription_id": "sub_456",
  "reason": "alta por renovación"
}
```

### Observaciones
- `plan_id` debe ser un string con el código del plan.
- `status` debe ser un estado válido del sistema.
- `proveedor_id` se usa para la relación de la cuenta con el proveedor.
- `current_period_end` es importante para el frontend porque determina la vigencia del acceso.
- `reason` es útil para auditoría.

---

## 5) Respuesta que espera el frontend

El backend envuelve la respuesta con DTO:

```js
export function toSubscriptionResponse(subscription) { return { data: subscription }; }
```

Eso significa que el consumo frontend debe esperar esta forma:

```json
{
  "data": {
    "account_id": 25,
    "status": "active",
    "plan": {
      "id": "enterprise",
      "name": "Enterprise"
    },
    "current_period_end": "2026-10-01T00:00:00.000Z",
    "cancel_at_period_end": false,
    "entitlements": {
      "ct": true
    },
    "limits": {}
  }
}
```

### Reglas de frontend
- no tomar decisiones solo por `plan_id`
- usar `status`
- usar `entitlements[featureKey]`
- usar `current_period_end` para mostrar vigencia
- no confiar en datos del navegador para permisos

---

## 6) Flujo recomendado desde frontend

### Caso 1: administración interna / panel SaaS
Cuando el panel es de administración, el flujo es:

1. usuario admin autenticado
2. el frontend llama a la ruta de creación
3. backend valida permisos
4. backend crea la suscripción y genera relaciones automáticas
5. frontend recibe `data` y actualiza el estado del account
6. UI renderiza permisos, plan y vigencia actualizada

### Caso 2: flujo de usuario final
El usuario no debería usar esta ruta para auto-crear su propia suscripción. El endpoint para resolver la suscripción del usuario es:

- GET /suscripciones/account/subscription

Eso es para consulta, no para creación.

---

## 7) Integración real recomendada

### Ejemplo frontend con fetch

```js
async function createSubscription(accountId, payload) {
  const response = await fetch(`/suscripciones/admin/saas/accounts/${accountId}/subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error?.message || 'Error creando la suscripción');
  }

  const result = await response.json();
  return result.data;
}
```

### Ejemplo de uso real

```js
const subscription = await createSubscription(25, {
  plan_id: 'enterprise',
  status: 'active',
  proveedor_id: 21,
  current_period_end: '2026-10-01T00:00:00.000Z',
  cancel_at_period_end: false
});

console.log(subscription.status);
console.log(subscription.entitlements.ct);
```

---

## 8) Seguridad y permisos

La ruta exige autenticación y permisos administrativos en [suscripciones/subscription.routes.js](suscripciones/subscription.routes.js):

- `requireAuth`
- `requireSaasAdmin`
- `requirePermission('saas.subscription.create')`

Eso significa que el frontend no debe invocar esta ruta desde una vista de usuario estándar sin permisos reales.

---

## 9) Riesgos de integración con frontend

1. El frontend puede asumir que la creación basta, pero el backend también crea relaciones y entitlements.
2. Si la UI no actualiza el store tras la respuesta, puede mostrar una vista stale.
3. Si el frontend usa rutas incorrectas o no manda `credentials: 'include'`, la sesión no se propaga.
4. Si el frontend toma decisiones por `plan_id` sin validar `status` o `entitlements`, se rompe la autorización.

---

## 10) Conclusión

`createSubscription` es el punto de entrada del motor SaaS. No solo crea la fila de la suscripción, sino que también:

- valida la política del plan
- asegura la relación del account con proveedor
- garantiza los entitlements y overrides
- invalida caché
- devuelve la proyección autorizable para frontend

Por eso, desde el front end, esta ruta debe verse como una operación administrativa y de armado de acceso, no como una simple entidad de persistencia.

La correcta integración pretende:
- usar la ruta administrativa solo con permisos adecuados
- consumir `data` como contrato final
- basar la UI en `status` y `entitlements`
- invalidar o refrescar el estado tras cada creación, renovación o cancelación
