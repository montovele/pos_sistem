# Configuracion de modulos por plan SaaS

## Objetivo

Cada plan de suscripcion debe definir explicitamente los modulos que puede utilizar la cuenta. El pago aprobado por Stripe activa la suscripcion, pero no debe habilitar modulos por si solo.

La relacion correcta es:

```text
saas_plans
  -> saas_plan_entitlements
  -> saas_subscriptions
  -> saas_accounts
```

## Causa del problema

El plan `legacy` era el unico que habilitaba modulos porque el seed del proyecto inserta manualmente sus entitlements:

```text
local_service
ct
billing
```

Los planes nuevos se registraban con:

- plan activo;
- precio recurrente de Stripe;
- version de precio;
- suscripcion activa despues del webhook.

Pero no se insertaban filas en `saas_plan_entitlements`. Como consecuencia, la consulta de suscripcion encontraba una suscripcion activa, pero el `LEFT JOIN` no encontraba modulos y el backend devolvia:

```json
{
  "data": {
    "status": "active",
    "access_allowed": true,
    "entitlements": {},
    "limits": {}
  }
}
```

El problema no estaba en Stripe ni en la fecha de vencimiento. Faltaba la configuracion funcional del plan.

## Regla de acceso

Solo las suscripciones con estado `active` o `trialing` pueden obtener entitlements. Ademas, la fecha `current_period_end` debe ser valida y no estar vencida.

El flujo es:

1. Stripe confirma el pago.
2. El webhook sincroniza `saas_subscriptions`.
3. El servicio consulta el plan relacionado.
4. La consulta obtiene las filas de `saas_plan_entitlements`.
5. Se aplican overrides de cuenta, si existen.
6. Redis guarda la proyeccion temporal.
7. Frontend recibe `status`, `access_allowed` y `entitlements`.

## Endpoints administrativos

Todos requieren sesion autenticada, rol administrativo y permisos SaaS.

### Consultar modulos de un plan

```http
GET /suscripciones/admin/saas/plans/:planId/entitlements
```

Respuesta:

```json
{
  "data": [
    {
      "feature_key": "ct",
      "enabled": 1,
      "limits_json": null
    },
    {
      "feature_key": "billing",
      "enabled": 1,
      "limits_json": "{\"documents\":100}"
    }
  ]
}
```

### Reemplazar modulos de un plan

```http
PUT /suscripciones/admin/saas/plans/:planId/entitlements
Content-Type: application/json
```

Payload recomendado:

```json
{
  "entitlements": {
    "ct": true,
    "billing": {
      "enabled": true,
      "limits": {
        "documents": 100
      }
    },
    "local_service": false
  }
}
```

Tambien se acepta una lista simple:

```json
{
  "entitlements": ["ct", "billing"]
}
```

El endpoint reemplaza la configuracion completa del plan. Si se envia un objeto vacio, el plan queda sin modulos.

## Configuracion al crear o editar un plan

Los endpoints administrativos de planes tambien aceptan `entitlements` en el payload:

```json
{
  "codigo": "starter",
  "nombre": "Starter",
  "estado": "active",
  "entitlements": {
    "ct": true,
    "billing": true
  }
}
```

La configuracion de precios es independiente de los modulos. Por ejemplo, estos planes pueden compartir modulos o tener modulos diferentes:

```text
starter    -> month + 1  -> ct
professional -> month + 3 -> ct, billing
enterprise -> year + 1 -> ct, billing, local_service
```

El intervalo de cobro no habilita automaticamente ningun modulo.

## Correccion de planes existentes

Para corregir un plan ya creado, primero se debe obtener su `planId` y aplicar su configuracion real:

```http
PUT /suscripciones/admin/saas/plans/2/entitlements
```

```json
{
  "entitlements": {
    "ct": true,
    "billing": true
  }
}
```

Despues de guardar los entitlements:

1. Invalidar la cache `saas:entitlements:account:{accountId}:v1`.
2. Ejecutar `GET /suscripciones/account/subscription`.
3. Confirmar que `data.entitlements` contiene los modulos esperados.
4. Confirmar que `data.access_allowed` es `true`.

El webhook tambien invalida la cache cuando sincroniza una suscripcion.

## Contrato esperado para frontend

Frontend debe consultar:

```http
GET /suscripciones/account/subscription
```

Y usar el resultado del backend:

```json
{
  "data": {
    "status": "active",
    "plan": {
      "id": "starter",
      "name": "Starter"
    },
    "access_allowed": true,
    "entitlements": {
      "ct": true,
      "billing": true
    },
    "limits": {},
    "current_period_end": "2026-10-05T18:02:01.000Z"
  }
}
```

No se debe decidir el acceso solo por `plan_id`, por el pago exitoso de Stripe ni por la respuesta del checkout. La fuente de autorizacion es `access_allowed` junto con `entitlements`.

## Diagnostico rapido

Si una suscripcion aparece activa pero no habilita modulos, revisar en este orden:

1. `saas_subscriptions.status` debe ser `active` o `trialing`.
2. `saas_subscriptions.current_period_end` debe tener una fecha futura.
3. `saas_subscriptions.plan_id` debe apuntar al plan correcto.
4. `saas_plan_entitlements` debe tener filas para ese `plan_id`.
5. `enabled` debe ser `1`.
6. No debe existir un override de cuenta que desactive el modulo.
7. Redis debe haber sido invalidado despues del cambio.

Consulta SQL de diagnostico:

```sql
SELECT
  s.account_id,
  s.status AS subscription_status,
  s.current_period_end,
  p.id AS plan_id,
  p.codigo AS plan_codigo,
  pe.feature_key,
  pe.enabled,
  pe.limits_json,
  o.enabled AS account_override
FROM saas_subscriptions s
INNER JOIN saas_plans p ON p.id = s.plan_id
LEFT JOIN saas_plan_entitlements pe ON pe.plan_id = p.id
LEFT JOIN saas_account_entitlement_overrides o
  ON o.account_id = s.account_id
 AND o.feature_key = pe.feature_key
WHERE s.account_id = ?
ORDER BY p.codigo, pe.feature_key;
```

## Conclusion

El pago y el ciclo de Stripe son independientes de la habilitacion funcional. Cada plan debe tener sus propios registros en `saas_plan_entitlements`. El plan `legacy` funcionaba porque esos registros fueron creados por el seed; los demas planes no los tenian configurados.
