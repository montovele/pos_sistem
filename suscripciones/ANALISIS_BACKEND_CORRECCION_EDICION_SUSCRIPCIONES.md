# Analisis tecnico: correccion backend de edicion de suscripciones

## 1. Problema observado

En el modulo de registro de suscripciones, al editar una suscripcion no se conservan correctamente:

- la fecha de finalizacion del periodo (`current_period_end`)
- la opcion **Cancelar al finalizar el periodo** (`cancel_at_period_end`)

El frontend envia ambos campos en la actualizacion mediante:

```http
PUT /suscripciones/admin/saas/subscriptions/:subscriptionId
```

```json
{
  "plan_id": "enterprise",
  "status": "active",
  "current_period_end": "2026-10-01T00:00:00.000Z",
  "cancel_at_period_end": true
}
```

La implementacion frontend se encuentra en [SubscriptionsView.vue](../src/views/admin/SubscriptionsView.vue). La documentacion general del contrato esta en [ANALISIS_INTEGRACION_FRONTEND_SUSCRIPCIONES_SAAS.md](./ANALISIS_INTEGRACION_FRONTEND_SUSCRIPCIONES_SAAS.md).

## 2. Diagnostico tecnico

La carga del formulario de edicion depende de la respuesta del backend. El frontend necesita recibir los nombres canónicos en `snake_case`:

```js
form.currentPeriodEnd = value.current_period_end;
form.cancelAtPeriodEnd = value.cancel_at_period_end;
```

El problema se presenta cuando el backend:

1. no devuelve `current_period_end` en el `GET` o `PUT`
2. devuelve el nombre alternativo `currentPeriodEnd`
3. no devuelve `cancel_at_period_end`
4. serializa el booleano como `1`, `0`, `"true"` o `"false"` sin un contrato consistente
5. transforma `null` en cadena vacía, fecha por defecto o elimina la propiedad
6. ignora esos campos durante el `UPDATE`
7. devuelve una proyección anterior después de guardar

Cuando el formulario recibe `null` o `false` por una respuesta incompleta y el usuario guarda, el frontend vuelve a enviar esos valores. Por eso el defecto debe corregirse en la persistencia y en el DTO de salida del backend, no únicamente en la interfaz.

## 3. Contrato backend requerido

### Request de actualización

El endpoint debe aceptar explícitamente:

```json
{
  "plan_id": "enterprise",
  "status": "active",
  "current_period_end": "2026-10-01T00:00:00.000Z",
  "cancel_at_period_end": true
}
```

Reglas:

- `current_period_end` debe aceptar una fecha ISO 8601 válida o `null`.
- `cancel_at_period_end` debe aceptar un booleano JSON real: `true` o `false`.
- `false` y `null` son valores intencionales y no deben eliminarse con comprobaciones de truthiness.
- Si el endpoint es de actualización completa, ambos campos deben formar parte del DTO requerido o conservarse desde la fila actual cuando no se envíen.
- Si el endpoint es parcial, solo se deben modificar los campos presentes en el body.
- El backend no debe aceptar que `undefined`, una cadena vacía o una fecha inválida sobrescriban un valor válido.

### Response de actualización y consulta

La respuesta debe conservar la envoltura existente:

```json
{
  "data": {
    "subscription_id": 42,
    "account_id": 1,
    "plan_id": "enterprise",
    "status": "active",
    "started_at": "2026-09-03T00:00:00.000Z",
    "current_period_end": "2026-10-01T00:00:00.000Z",
    "cancel_at_period_end": true,
    "entitlements": {},
    "limits": {}
  }
}
```

La respuesta debe cumplir siempre:

- nombre `current_period_end` en todas las rutas administrativas y de cuenta
- nombre `cancel_at_period_end` en todas las rutas administrativas y de cuenta
- fecha en formato ISO 8601 o `null`
- booleano JSON (`true` o `false`), no `1`, `0`, `"true"` ni `"false"`
- respuesta posterior al `PUT` construida desde la fila actualizada, no desde el payload original ni desde una caché obsoleta

## 4. Revisión de base de datos

Verificar la tabla de suscripciones y sus tipos reales:

```sql
SHOW COLUMNS FROM saas_subscriptions
  WHERE Field IN ('current_period_end', 'cancel_at_period_end');
```

El resultado esperado es equivalente a:

```text
current_period_end    DATETIME o TIMESTAMP    NULL permitido
cancel_at_period_end  BOOLEAN/TINYINT(1)      NOT NULL DEFAULT 0
```

Comprobar también que:

- el `INSERT` incluya ambos campos cuando se crea una suscripción
- el `UPDATE` incluya ambos campos cuando corresponde
- `current_period_end = NULL` sea permitido y represente ausencia de fecha
- `cancel_at_period_end = 0` no se interprete como campo omitido
- no exista un trigger que reemplace la fecha o el flag después del `UPDATE`
- la transacción confirme antes de construir la respuesta

## 5. Corrección recomendada en el servicio/repositorio

La actualización debe distinguir entre propiedad ausente y valor vacío válido. Un patrón equivalente sería:

```js
const updates = {};

if (Object.prototype.hasOwnProperty.call(values, 'current_period_end')) {
  updates.current_period_end = values.current_period_end;
}

if (Object.prototype.hasOwnProperty.call(values, 'cancel_at_period_end')) {
  updates.cancel_at_period_end = values.cancel_at_period_end;
}
```

Antes de persistir:

```js
if (
  values.current_period_end !== null &&
  values.current_period_end !== undefined &&
  Number.isNaN(new Date(values.current_period_end).getTime())
) {
  throw new Error('current_period_end must be a valid ISO date or null');
}

if (typeof values.cancel_at_period_end !== 'boolean') {
  throw new Error('cancel_at_period_end must be boolean');
}
```

En el mapper o DTO de salida:

```js
return {
  ...subscription,
  current_period_end: subscription.current_period_end ?? null,
  cancel_at_period_end: Boolean(subscription.cancel_at_period_end)
};
```

Si el driver devuelve `"0"` y `"1"`, no usar `Boolean(value)` directamente, porque `Boolean("0")` es `true`. Normalizar de forma explícita:

```js
function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}
```

## 6. Caché y proyección

Después de actualizar la suscripción, el backend debe:

1. confirmar la transacción
2. invalidar la caché de la cuenta afectada
3. consultar o reconstruir la proyección actualizada
4. devolver `current_period_end` y `cancel_at_period_end` en `data`

No se debe devolver una proyección anterior almacenada en Redis. Esto puede producir el síntoma de que el `PUT` responde correctamente, pero al volver a editar la pantalla aparecen la fecha anterior y el checkbox desactivado.

La invalidación debe aplicar tanto a:

- la consulta administrativa por suscripción
- la consulta administrativa por cuenta
- `GET /suscripciones/account/subscription`
- cualquier caché de entitlements o estado de acceso asociada al `account_id`

## 7. Reglas de negocio que deben definirse

El backend debe documentar y probar estas combinaciones:

| `status` | `current_period_end` | `cancel_at_period_end` | Comportamiento |
|---|---|---|---|
| `active` | fecha futura | `false` | acceso activo, renovación normal |
| `active` | fecha futura | `true` | acceso activo hasta la fecha, cancelar al finalizar |
| `active` | `null` | `false` | acceso activo sin fecha definida, si el negocio lo permite |
| `expired` | fecha pasada | `false` o `true` | sin acceso |
| `canceled` | fecha futura o pasada | `false` o `true` | sin acceso según la política de cancelación |

La opción `cancel_at_period_end = true` no debe cambiar automáticamente el estado a `canceled` antes de `current_period_end`, salvo que esa sea la regla explícita del negocio.

## 8. Pruebas de regresión backend

Agregar pruebas para el servicio, repositorio y endpoint:

1. Actualizar fecha futura y verificar que la respuesta y la base de datos contienen exactamente la fecha enviada.
2. Actualizar `cancel_at_period_end` de `false` a `true`.
3. Actualizar de `true` a `false` y verificar que el valor `0` se persiste.
4. Enviar `current_period_end: null` y verificar que se guarda `NULL`.
5. Consultar una fila con `cancel_at_period_end = 0` y verificar respuesta JSON `false`.
6. Consultar una fila con `cancel_at_period_end = 1` y verificar respuesta JSON `true`.
7. Confirmar que la respuesta usa `current_period_end` y `cancel_at_period_end`, nunca solo camelCase.
8. Ejecutar un `PUT` y luego un `GET` para comprobar que los valores permanecen después de invalidar la caché.
9. Rechazar fechas inválidas, cadenas vacías y tipos booleanos no permitidos.
10. Verificar auditoría con los valores anterior y posterior de ambos campos.

Ejemplo de aserción de integración:

```js
expect(response.body.data.current_period_end).toBe('2026-10-01T00:00:00.000Z');
expect(response.body.data.cancel_at_period_end).toBe(true);

const persisted = await getSubscription(subscriptionId);
expect(persisted.current_period_end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
expect(persisted.cancel_at_period_end).toBe(true);
```

## 9. Criterio de aceptación

La corrección backend se considera completa cuando:

- el formulario de edición recibe la fecha guardada
- el checkbox refleja el valor guardado
- guardar sin cambiar esos controles no altera sus valores
- cambiar el checkbox a desactivado persiste `false`
- eliminar la fecha persiste `NULL`
- el `PUT` y el `GET` posterior devuelven el mismo estado
- todas las respuestas usan el contrato canónico en snake_case
- las pruebas cubren `true`, `false`, fecha válida, `null`, caché y auditoría

## 10. Implementación aplicada en backend

La corrección quedó aplicada en `subscription.dto.js`, `subscription.service.js`, `repository/subscription.repository.js` y `subscription.routes.js`:

- Las respuestas de cuenta, detalle, listados y alta/edición mantienen la envoltura `{ data: ... }` y usan el DTO canónico.
- `current_period_end` siempre se devuelve como fecha ISO 8601 o `null`.
- `cancel_at_period_end` siempre se devuelve como booleano JSON, incluso cuando MySQL retorna `0` o `1`.
- El `PUT` por `subscriptionId` y por `accountId` conserva ambos valores cuando no aparecen en el body. Si aparecen, acepta `null` para la fecha y `false` para el indicador como valores intencionales.
- Se rechazan fecha vacía, fecha inválida y valores no booleanos con `422`.
- El repositorio persiste `false` como `0` y `null` como `NULL`, consulta la proyección después de confirmar la transacción e invalida la caché por `account_id`.
- El pool MySQL de CT usa `timezone: 'Z'`, por lo que los valores `DATETIME` se interpretan y serializan en UTC. La hora, minutos y segundos de `current_period_end` no se convierten a la zona local del servidor.
- La columna `current_period_end` debe ser `DATETIME` o `TIMESTAMP` con `NULL` permitido. Una columna `DATE` descartaría la hora y no es compatible con el cálculo preciso de caducidad.

El frontend debe enviar el body parcial usando exactamente estos nombres:

```json
{
  "plan_id": "enterprise",
  "status": "active",
  "current_period_end": null,
  "cancel_at_period_end": false
}
```

## 11. Nota sobre la corrección frontend actual

El frontend fue endurecido para leer temporalmente tanto snake_case como camelCase y varios formatos de booleano. Esa compatibilidad evita perder valores cuando la respuesta llega con una representación distinta, pero no sustituye la corrección backend.

El contrato definitivo permanece en snake_case y con tipos JSON estables. La compatibilidad temporal con camelCase puede mantenerse en el frontend, pero no debe ser necesaria para las respuestas nuevas del backend.
