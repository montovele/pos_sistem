# Diseño técnico de administración de planes de suscripción para frontend

## 1) Objetivo

La administración de planes debe quedar separada de la suscripción del usuario final, pero conectada al mismo motor SaaS central.

La idea es esta:
- `saas_plans` define el catálogo de planes
- `saas_plan_entitlements` define los permisos por plan
- `saas_subscriptions` representa la contratación real por cuenta
- `saas_account_entitlement_overrides` permite excepciones por cuenta

Con esto, el frontend admin puede crear y gestionar planes, mientras el usuario final solo consulta su estado activo.

---

## 2) Estado actual detectado

La capa de servicio ya incluye métodos para plan management en [suscripciones/subscription.service.js](suscripciones/subscription.service.js):

- `listPlans(filters = {})`
- `getPlan(planId)`
- `createPlan(values, actorUserId, ipAddress)`
- `updatePlan(planId, values, actorUserId, ipAddress)`

También existen helpers para cuentas y proveedores:

- `listAccounts`
- `getAccount`
- `createAccount`
- `updateAccount`
- `listAccountProviders`
- `addAccountProvider`
- `removeAccountProvider`

Sin embargo, en [suscripciones/subscription.routes.js](suscripciones/subscription.routes.js) no se exponen rutas públicas de CRUD para planes.

Esto significa:
- la lógica está preparada
- pero la API admin no está todavía publicada de forma completa

---

## 3) Arquitectura recomendada

### 3.1 Separación funcional

- Administrador de planes
  - crea, consulta, actualiza y desactiva planes
- Administración de suscripciones
  - crea/renueva/cancela subscripciones por cuenta
- Administración de entitlements
  - ajusta permisos específicos por cuenta

### 3.2 Regla de negocio

La suscripción debe depender del plan, pero no debe ser el lugar donde el frontend modifique el catálogo de planes. El catálogo debe ser admin-only.

---

## 4) Endpoints sugeridos para frontend admin

### 4.1 Listar planes

- GET /suscripciones/admin/saas/plans

Query opcional:

- estado
- proveedor
- activo
- categoria

Respuesta esperada:

```json
{
  "data": [
    {
      "id": 1,
      "codigo": "enterprise",
      "nombre": "Enterprise",
      "estado": "active",
      "descripcion": "Plan para empresas con permisos avanzados"
    }
  ]
}
```

### 4.2 Obtener plan por id

- GET /suscripciones/admin/saas/plans/:planId

### 4.3 Crear plan

- POST /suscripciones/admin/saas/plans

Body ejemplo:

```json
{
  "codigo": "enterprise",
  "nombre": "Enterprise",
  "descripcion": "Plan para empresas",
  "estado": "active"
}
```

### 4.4 Actualizar plan

- PUT /suscripciones/admin/saas/plans/:planId

### 4.5 Desactivar plan

- DELETE /suscripciones/admin/saas/plans/:planId

O alternativamente:

- PATCH /suscripciones/admin/saas/plans/:planId/status

---

## 5) Entitlements de plan

La tabla `saas_plan_entitlements` debe gestionarse como parte del plan.

### Ruta sugerida

- GET /suscripciones/admin/saas/plans/:planId/entitlements
- POST /suscripciones/admin/saas/plans/:planId/entitlements
- PUT /suscripciones/admin/saas/plans/:planId/entitlements/:featureKey
- DELETE /suscripciones/admin/saas/plans/:planId/entitlements/:featureKey

### Ejemplo

```json
{
  "feature_key": "ct",
  "enabled": true,
  "limits_json": "{\"maxProjects\": 10}",
  "descripcion": "Acceso a catálogo CT"
}
```

Esto es importante porque el acceso que usa el frontend y la autorización real no viene del plan únicamente, sino de la combinación:
- plan base
- overrides del account
- estado actual de la suscripción

---

## 6) Permisos recomendados

Para esta capa admin, los permisos deberían quedar así:

- `saas.plan.read`
- `saas.plan.create`
- `saas.plan.update`
- `saas.plan.delete`

Y si se quiere controlar también entitlements del plan:

- `saas.plan.entitlement.read`
- `saas.plan.entitlement.write`

Esto encaja con el esquema actual de permisos que ya existe en [utils/permissions.js](utils/permissions.js).

---

## 7) Integración con frontend

El frontend admin debería:

1. cargar planes desde GET /suscripciones/admin/saas/plans
2. renderizar cards o tabla con:
   - nombre
   - código
   - estado
   - entitlements
3. crear un plan llamando a POST /suscripciones/admin/saas/plans
4. editarlo con PUT /suscripciones/admin/saas/plans/:id
5. actualizar entitlements por plan con el endpoint específico
6. crear suscripciones por cuenta usando la ruta de cuenta y plan activo

### Ejemplo de flujo

```js
const plans = await fetch('/suscripciones/admin/saas/plans', {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
});
```

Y para crear:

```js
await fetch('/suscripciones/admin/saas/plans', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    codigo: 'starter',
    nombre: 'Starter',
    descripcion: 'Plan inicial',
    estado: 'active'
  })
});
```

---

## 8) Qué no debería hacer el frontend

El frontend no debe:
- crear `saas_plan_entitlements` sin validación del backend
- tocar `saas_account_entitlement_overrides` sin administración explícita
- crear subscripciones desde un cliente normal
- manipular permisos para otros accounts si no tiene rol admin

La autorización debe estar siempre en el backend; el navegador solo debe tomar la respuesta final.

---

## 9) Contrato de dominio recomendado

### Plan

```json
{
  "id": 1,
  "codigo": "enterprise",
  "nombre": "Enterprise",
  "descripcion": "Plan empresarial",
  "estado": "active",
  "created_at": "2026-09-02T00:00:00.000Z"
}
```

### Entitlement del plan

```json
{
  "feature_key": "ct",
  "enabled": true,
  "limits_json": "{\"maxProjects\": 10}",
  "descripcion": "Acceso a CT"
}
```

### Subscription resultante

```json
{
  "data": {
    "account_id": 25,
    "status": "active",
    "plan": {
      "id": "enterprise",
      "name": "Enterprise"
    },
    "entitlements": {
      "ct": true
    }
  }
}
```

---

## 10) Conclusión

La capa de planes sí existe en la lógica de negocio, pero no está completamente expuesta como API admin para frontend. La mejor arquitectura es:

- `plans` = panel de administración
- `subscriptions` = contratación del usuario por cuenta
- `entitlements` = permisos efectivos y overrides

Esto mantiene el sistema centralizado, auditable y consistente con el flujo actual de [suscripciones/subscription.service.js](suscripciones/subscription.service.js).

La recomendación final es exponer el CRUD de planes con permisos admin exclusivos y usar `createSubscription` solo como flujo de contratación, no como mecanismo para administrar el catálogo.
