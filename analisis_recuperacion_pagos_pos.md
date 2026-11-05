# Análisis funcional y técnico: recuperación de pagos y activación de cuentas POS

**Proyecto:** POS SSAXXON  
**Backend:** `/var/www/ssaxxon/pos_sistem/pos_backend`  
**Endpoint involucrado:** `POST https://pos.ssaxxon.com/api/suscripciones/public/checkout`  
**Respuesta observada:** `409 Conflict`  
**Mensaje mostrado:** `El pago se está verificando. Revisa tu correo antes de volver a intentarlo.`

---

## 1. Objetivo

Diseñar e implementar una vista dentro del POS que permita a un usuario recuperar una compra de suscripción cuando el checkout anterior quedó en estado de verificación, pendiente o incierto.

La vista debe permitir:

1. Identificar la operación de pago que quedó inconclusa.
2. Consultar su estado real en el backend y, cuando corresponda, en el proveedor de pagos.
3. Reanudar el flujo de pago si el proveedor confirma que puede continuarse.
4. Activar la cuenta automáticamente cuando exista confirmación verificable de pago.
5. Informar al usuario qué debe hacer cuando el pago continúa en revisión, fue rechazado, expiró o requiere una acción adicional.
6. Evitar cobros duplicados, activaciones indebidas y modificaciones manuales inseguras.

**Principio fundamental:** la cuenta nunca debe activarse porque el navegador regrese de una página de pago, porque el usuario pulse un botón o porque el frontend reciba un parámetro como `success=true`. La activación debe depender de una confirmación validada por el backend.

---

## 2. Interpretación del error actual

El navegador reporta:

```http
POST /api/suscripciones/public/checkout
HTTP 409 Conflict
```

Y presenta el mensaje:

```text
El pago se está verificando. Revisa tu correo antes de volver a intentarlo.
```

El código HTTP `409` indica que la solicitud entra en conflicto con el estado actual del recurso o de la operación. En este escenario, el backend aparentemente detecta una operación previa que todavía considera en verificación y evita crear otro checkout.

### Lo que sí sabemos

- El frontend realiza una petición POST al endpoint público de checkout.
- El backend responde `409`.
- El mensaje indica que existe un proceso de verificación que impide un nuevo intento.

### Lo que todavía debe comprobarse

- Qué proveedor procesa el pago.
- Si el proveedor creó una orden, preferencia, sesión o intento de pago.
- Qué estado exacto tiene la operación en la base de datos.
- Si el estado local coincide con el estado del proveedor.
- Si los webhooks están llegando y se validan correctamente.
- Si el mensaje de verificación se debe a una revisión legítima, a un webhook retrasado, a un error de comunicación o a una operación local que quedó bloqueada.
- Qué mecanismo actual activa la cuenta y si es idempotente.

No se debe asumir que un `409` significa que el pago fue aprobado ni que fue rechazado.

---

## 3. Experiencia propuesta para el usuario

Agregar una sección o vista denominada **“Recuperar mi pago”** o **“Estado de mi suscripción”**.

La vista debe estar disponible desde la pantalla de acceso, el flujo de registro/checkout y, si existe, el panel de cuenta. Debe poder utilizarse aunque la cuenta todavía no esté activada.

### 3.1 Estados visuales

| Estado interno normalizado | Mensaje para el usuario | Acción disponible |
|---|---|---|
| `created` | Se inició tu solicitud de pago. | Consultar estado |
| `pending` | Estamos esperando la confirmación del pago. | Actualizar estado |
| `processing` | Tu pago está siendo procesado. | Actualizar estado |
| `under_review` | El proveedor está verificando tu pago. No realices otro pago todavía. | Consultar estado / ver instrucciones |
| `requires_action` | Se requiere completar una acción para continuar. | Continuar pago, si el proveedor lo permite |
| `approved` | Pago confirmado. Estamos activando tu cuenta. | Ir al acceso |
| `activation_pending` | Tu pago fue confirmado. La activación está terminando. | Reintentar consulta |
| `active` | Tu suscripción y cuenta están activas. | Entrar al POS |
| `rejected` | El pago no fue aprobado. | Generar un nuevo intento |
| `cancelled` | La operación fue cancelada. | Intentar nuevamente |
| `expired` | La sesión de pago expiró. | Generar un nuevo intento |
| `unknown` | No pudimos confirmar el estado. No vuelvas a pagar todavía. | Reintentar consulta / contactar soporte |

Los estados anteriores son una propuesta de normalización interna. Deben mapearse a los estados reales del proveedor y del modelo actual, sin inventar estados que contradigan la integración existente.

### 3.2 Diseño sugerido

La vista debe mostrar:

- Título: **Recupera tu pago**.
- Explicación breve: “Si tu pago quedó pendiente o en verificación, puedes consultar su estado sin generar otro cobro”.
- Identificador de operación o referencia parcialmente oculto.
- Nombre del plan contratado.
- Fecha y hora de creación.
- Importe y moneda, obtenidos del backend.
- Estado actual y explicación.
- Última actualización.
- Botón principal contextual.
- Enlace a soporte cuando no se pueda resolver automáticamente.

No mostrar datos completos de tarjetas, credenciales, tokens privados ni información sensible del proveedor.

### 3.3 Acceso a la recuperación

Preferentemente, el usuario debe poder recuperar la operación mediante una sesión autenticada o un enlace de recuperación seguro enviado al correo verificado.

Si se utiliza correo y referencia:

- No permitir consultar operaciones únicamente con un correo sin verificar.
- Utilizar un token aleatorio, de un solo propósito, con expiración y almacenamiento seguro (por ejemplo, hash del token).
- No exponer identificadores secuenciales que permitan enumerar pagos.
- Limitar intentos y aplicar protección contra abuso.
- Evitar revelar si un correo está registrado cuando ello pueda facilitar la enumeración de cuentas.

---

## 4. Flujo funcional esperado

### Escenario A: el usuario vuelve después de recibir el 409

1. El usuario abre “Recuperar mi pago”.
2. El frontend solicita al backend el estado de su operación pendiente.
3. El backend valida la identidad o el token de recuperación.
4. El backend consulta el estado local.
5. Si el estado local es incierto o está desactualizado, el backend consulta al proveedor mediante su API, cuando esta consulta esté disponible.
6. El backend normaliza el estado.
7. El frontend presenta el resultado y la acción permitida.
8. Si el pago está aprobado, el backend ejecuta o reintenta la activación de manera idempotente.
9. El frontend consulta nuevamente hasta recibir `active` o un estado que requiera intervención.

### Escenario B: el proveedor confirma el pago

1. El proveedor envía un webhook al backend.
2. El backend valida la firma, autenticidad, timestamp y demás controles exigidos por el proveedor.
3. Se identifica la operación mediante el ID del proveedor y la referencia interna.
4. Se comprueba que el importe, la moneda, el comercio/cuenta receptora y la operación correspondan a la suscripción esperada.
5. Se registra el evento de forma idempotente.
6. Se actualiza el pago a `approved`.
7. Se ejecuta la activación de la suscripción y de la cuenta en una transacción o proceso recuperable.
8. Se registra el resultado de activación.
9. Se notifica al usuario y la vista refleja el estado actualizado.

El webhook debe ser la vía principal de confirmación asíncrona si el proveedor la soporta. La consulta de estado debe funcionar como mecanismo complementario de recuperación.

### Escenario C: el pago continúa en revisión

- Mantener la operación asociada al usuario.
- No crear otro cobro.
- Mostrar que el proveedor continúa verificando el pago.
- Mostrar instrucciones oficiales o el plazo estimado únicamente si el proveedor lo informa.
- Permitir consultar nuevamente con límites de frecuencia.
- No activar la cuenta hasta recibir confirmación válida.

### Escenario D: el proveedor confirma rechazo, cancelación o expiración

- Guardar el estado final y la evidencia de la respuesta.
- Permitir generar un nuevo intento.
- No reutilizar una sesión expirada.
- Mantener la trazabilidad del intento anterior.
- Evitar que un webhook tardío o duplicado revierta una operación más reciente o active una suscripción incorrecta.

### Escenario E: el pago está aprobado pero la activación falló

- Mantener el pago como aprobado.
- Registrar la activación como pendiente o fallida, sin cambiar el pago a rechazado.
- Reintentar la activación mediante un proceso seguro.
- Mostrar al usuario: “Tu pago fue confirmado. Estamos terminando de activar tu cuenta”.
- Alertar a administración si se supera el número o tiempo de reintentos definido.
- No solicitar al usuario que pague de nuevo.

---

## 5. Arquitectura recomendada

Separar claramente tres conceptos:

1. **Intento de pago:** interacción concreta con el proveedor.
2. **Pago:** resultado financiero confirmado o no confirmado.
3. **Suscripción/activación:** derecho de acceso que se concede después de validar el pago.

No utilizar un único campo genérico para representar los tres procesos.

### 5.1 Modelo de datos de referencia

Adaptar los nombres y campos a la estructura existente. No crear tablas duplicadas antes de inspeccionar el esquema actual.

#### Tabla conceptual `payment_attempts`

| Campo | Propósito |
|---|---|
| `id` | Identificador interno |
| `user_id` / `account_id` | Propietario de la operación |
| `subscription_id` | Suscripción relacionada, si ya existe |
| `provider` | Proveedor de pagos |
| `provider_payment_id` | ID de pago en el proveedor |
| `provider_checkout_id` | ID de sesión/orden/preferencia, si aplica |
| `status` | Estado normalizado del intento |
| `amount` | Importe esperado |
| `currency` | Moneda |
| `idempotency_key` | Clave única para evitar duplicados |
| `recovery_token_hash` | Hash del token, si se usa recuperación por enlace |
| `created_at` | Fecha de creación |
| `updated_at` | Última actualización |
| `expires_at` | Expiración, si aplica |
| `last_provider_check_at` | Última consulta al proveedor |
| `failure_code` | Código de fallo normalizado |
| `failure_message` | Mensaje seguro y no sensible |

#### Tabla conceptual `payment_webhook_events`

| Campo | Propósito |
|---|---|
| `id` | Identificador interno |
| `provider` | Proveedor |
| `provider_event_id` | ID único del evento |
| `event_type` | Tipo de evento |
| `payment_attempt_id` | Intento asociado |
| `signature_valid` | Resultado de validación |
| `payload_redacted` | Payload minimizado y sin secretos |
| `received_at` | Fecha de recepción |
| `processed_at` | Fecha de procesamiento |
| `processing_status` | Recibido, procesado, fallido |
| `processing_error` | Error técnico seguro |

Crear una restricción única para `(provider, provider_event_id)` cuando el proveedor proporcione un ID de evento estable. También debe existir una estrategia de deduplicación cuando no lo proporcione.

#### Registro de activación

Puede ser una tabla de activaciones o un registro dentro de la suscripción/cuenta existente. Debe permitir conocer:

- Qué pago autorizó la activación.
- Qué cuenta y suscripción se activaron.
- Fecha de activación.
- Resultado.
- Número de reintentos.
- Último error.
- Fecha del próximo reintento, si se usa una cola.

Debe existir una restricción única o mecanismo equivalente para impedir que un mismo pago active dos veces el mismo beneficio.

---

## 6. Endpoints propuestos

Los nombres son una propuesta. Antes de implementarlos, revisar las rutas, controladores, middleware y convenciones actuales del backend.

### 6.1 Consultar operación pendiente

```http
GET /api/suscripciones/public/payment-recovery/:recoveryToken
```

Responsabilidad:

- Validar token y expiración.
- Resolver la operación autorizada.
- Consultar el estado local.
- Consultar al proveedor si corresponde y si es seguro hacerlo.
- Ejecutar activación idempotente si existe aprobación válida.
- Devolver información mínima para la vista.

Respuesta conceptual:

```json
{
  "success": true,
  "payment": {
    "reference": "REF-OCULTA",
    "status": "under_review",
    "amount": 299.00,
    "currency": "MXN",
    "createdAt": "2026-11-05T10:00:00.000Z",
    "updatedAt": "2026-11-05T10:03:00.000Z"
  },
  "subscription": {
    "status": "pending"
  },
  "account": {
    "status": "inactive"
  },
  "nextAction": "wait_and_check"
}
```

La respuesta es ilustrativa. Los importes, moneda, fechas, referencias y estados deben proceder de datos reales del backend.

### 6.2 Consultar estado de una operación autenticada

```http
GET /api/suscripciones/me/payment-status
```

Responsabilidad:

- Requerir autenticación.
- Devolver únicamente pagos pertenecientes a la cuenta autenticada.
- Permitir recuperar el último intento relevante sin exponer operaciones ajenas.

### 6.3 Solicitar reintento de pago

```http
POST /api/suscripciones/public/payment-recovery/:recoveryToken/retry
```

Responsabilidad:

- Validar el token.
- Consultar el estado actual antes de crear otro intento.
- Rechazar el reintento si existe un pago pendiente, en proceso o en revisión.
- Permitir un nuevo intento solo cuando el anterior esté en un estado terminal que lo permita.
- Usar una nueva clave de idempotencia para el nuevo intento.
- Responder con la nueva sesión/URL del proveedor si procede.

No debe ser posible forzar un nuevo cobro mediante parámetros del frontend.

### 6.4 Webhook del proveedor

```http
POST /api/webhooks/payments/:provider
```

Responsabilidad:

- Validar la firma conforme a la documentación oficial del proveedor.
- Validar que el evento corresponda a una operación conocida.
- Procesar eventos duplicados sin repetir efectos.
- Confirmar importe, moneda y destinatario.
- Actualizar el pago y activar la suscripción/cuenta de forma segura.
- Responder al proveedor según el contrato de su webhook.

No confiar en el ID de pago enviado por el navegador como prueba de pago.

### 6.5 Estado administrativo y recuperación operativa

Crear una ruta administrativa protegida para consultar:

- Referencia interna.
- Estado local y estado del proveedor.
- Historial de eventos.
- Resultado de activación.
- Último error.
- Acciones de reintento permitidas.

Cualquier acción manual debe exigir permisos administrativos, registrar quién la ejecutó y conservar auditoría. Una acción manual no debe marcar un pago como aprobado sin evidencia verificable del proveedor y un procedimiento autorizado.

---

## 7. Reglas críticas de seguridad e integridad

### 7.1 No confiar en el frontend

El frontend nunca puede:

- Enviar `status: "approved"` para activar una cuenta.
- Definir el importe final que se considera pagado.
- Elegir libremente el `user_id` o `account_id` que recibirá la activación.
- Cambiar una operación de pendiente a aprobada.
- Reutilizar una referencia de otro usuario.

El backend debe obtener la operación, usuario, importe y plan desde sus propios registros.

### 7.2 Idempotencia

La misma notificación, callback o solicitud puede llegar varias veces. La lógica debe tolerarlo.

- Un evento de webhook ya procesado no debe volver a producir efectos.
- Una operación aprobada no debe crear una segunda activación.
- Una petición repetida de recuperación no debe crear un cobro nuevo por accidente.
- La creación del checkout debe protegerse con una clave de idempotencia y una restricción de unicidad adecuada.
- Las transiciones de estado deben ser atómicas o controladas mediante bloqueo/actualización condicional.

### 7.3 Transiciones permitidas

Definir una máquina de estados. Ejemplo de reglas:

- `created` → `pending`, `processing`, `requires_action`, `approved`, `rejected`, `cancelled`, `expired`.
- `pending` → `processing`, `under_review`, `requires_action`, `approved`, `rejected`, `cancelled`, `expired`.
- `processing` → `under_review`, `approved`, `rejected`, `cancelled`, `expired`.
- `under_review` → `approved`, `rejected` o permanecer en revisión.
- `approved` → no volver a `pending` ni `rejected`.
- `rejected`, `cancelled`, `expired` → no reabrir el mismo intento; crear otro intento relacionado cuando corresponda.

La máquina real debe ajustarse a los estados y garantías del proveedor. Los eventos tardíos deben procesarse con reglas de precedencia y evidencia, no por orden de llegada solamente.

### 7.4 Verificación del pago

Antes de activar, comprobar al menos:

- Autenticidad de la notificación o respuesta del proveedor.
- Identificador del pago asociado al intento interno.
- Importe exacto esperado.
- Moneda esperada.
- Cuenta/comercio receptor correcto.
- Estado de pago que el proveedor documente como efectivamente pagado.
- Ausencia de reembolso, contracargo o reversión que impida conceder el beneficio.
- Correspondencia entre el plan comprado y la suscripción que se activará.

### 7.5 Protección de endpoints

- Rate limiting en consulta y recuperación.
- Tokens de recuperación aleatorios, con expiración y revocación.
- No incluir secretos del proveedor en respuestas o logs.
- Validación de entrada.
- Autorización por propietario de la operación.
- Auditoría de cambios de estado.
- HTTPS.
- CORS limitado a orígenes legítimos.
- No registrar datos completos de tarjetas ni payloads sensibles.

---

## 8. Lógica de activación robusta

La activación debe ser una operación independiente y repetible.

Pseudoflujo:

```text
procesarPagoAprobado(paymentAttempt):
    iniciar transacción

    bloquear/leer paymentAttempt

    verificar que el pago pertenece a la cuenta y suscripción esperadas
    verificar que la evidencia de aprobación sea válida
    verificar importe, moneda y proveedor

    si el pago ya fue procesado:
        devolver resultado existente

    marcar pago como approved

    registrar una tarea de activación única
    confirmar transacción

    procesar tarea de activación:
        iniciar transacción

        bloquear tarea y suscripción/cuenta

        si la activación ya existe:
            marcar tarea como completada
            finalizar

        activar la suscripción según el plan comprado
        habilitar la cuenta según las reglas del producto
        registrar payment_attempt_id como origen de la activación
        marcar tarea como completada

        confirmar transacción
```

### Patrón recomendado: outbox o tarea recuperable

Si el pago y la activación utilizan la misma base de datos, una transacción puede guardar la aprobación y una tarea pendiente de activación. Un worker procesa esa tarea.

Si la activación involucra servicios externos, no mantener una transacción SQL abierta durante llamadas de red. Utilizar un proceso recuperable con reintentos, idempotencia y registro de errores.

Definir:

- Número máximo de reintentos.
- Espera progresiva entre reintentos.
- Manejo de errores permanentes y transitorios.
- Alertas para operaciones que requieren intervención.
- Herramienta administrativa de reejecución segura.

---

## 9. Comportamiento del frontend

La vista debe consumir exclusivamente endpoints del backend.

### Componentes sugeridos

- `PaymentRecoveryView.vue`: vista principal.
- `PaymentStatusCard.vue`: estado, importe, plan y referencia.
- `PaymentRecoveryActions.vue`: botones según estado.
- `paymentRecoveryService.js` o equivalente: llamadas HTTP.
- Store Pinia, si el proyecto ya utiliza Pinia para el estado global.

No duplicar lógica de autorización o reglas de pago en Vue.

### Estados de interfaz

1. `loading`: consultando operación.
2. `pending`: esperando confirmación.
3. `under_review`: revisión del proveedor.
4. `requires_action`: acción adicional disponible.
5. `approved`: pago confirmado.
6. `activation_pending`: pago confirmado, activación en proceso.
7. `active`: cuenta habilitada.
8. `failed`: rechazo o error recuperable/no recuperable.
9. `expired`: enlace u operación expirada.
10. `not_found`: operación no disponible o no autorizada; usar un mensaje que no revele información de otras cuentas.

### Botones contextuales

| Estado | Botón |
|---|---|
| `pending` / `processing` | Actualizar estado |
| `under_review` | Consultar nuevamente |
| `requires_action` | Continuar pago |
| `approved` / `activation_pending` | Verificar activación |
| `active` | Entrar al POS |
| `rejected` / `cancelled` / `expired` | Intentar nuevo pago |
| `unknown` | Consultar nuevamente / Contactar soporte |

No habilitar un botón de “Pagar otra vez” mientras el estado sea incierto, pendiente, en proceso o en revisión.

### Actualización automática

Se puede consultar el estado periódicamente mientras la vista esté abierta, con intervalo prudente y límite de duración. Detener el sondeo cuando el estado sea terminal (`active`, `rejected`, `cancelled`, `expired`) o cuando el usuario salga de la vista.

El sondeo del navegador no sustituye los webhooks ni la reconciliación del backend.

### Accesibilidad y claridad

- Mostrar fecha y hora de la última consulta.
- Diferenciar “pago confirmado” de “cuenta activada”.
- Evitar mensajes técnicos como `409`, nombres de tablas o códigos internos.
- No presentar una pantalla de éxito hasta que el backend confirme `active`.
- Mantener un identificador de soporte para facilitar el diagnóstico.

---

## 10. Tratamiento específico del HTTP 409 actual

El frontend debe interpretar el `409` como un estado recuperable de negocio, no como un error genérico.

Respuesta recomendada:

```json
{
  "success": false,
  "code": "PAYMENT_VERIFICATION_IN_PROGRESS",
  "message": "Tu pago todavía está en verificación. Consulta su estado antes de intentar pagar nuevamente.",
  "recoveryAvailable": true,
  "statusUrl": "/api/suscripciones/me/payment-status"
}
```

La respuesta real debe evitar exponer rutas internas o referencias sensibles a usuarios no autenticados. Si se utiliza un token de recuperación, la URL debe construirse de acuerdo con ese mecanismo.

En el frontend:

- Mostrar un aviso de pago en verificación.
- Ofrecer “Consultar estado del pago”.
- Ofrecer acceso a “Recuperar mi pago”.
- No repetir automáticamente el POST de checkout.
- No generar otro checkout por actualizar la página.

---

## 11. Plan de implementación

### Fase 1: diagnóstico del sistema actual

Antes de modificar código, inspeccionar:

- `src/app.js` y registro de rutas.
- Ruta/controlador del endpoint `POST /api/suscripciones/public/checkout`.
- Servicio que se comunica con el proveedor de pagos.
- Modelos y tablas de pagos, suscripciones, cuentas y usuarios.
- Webhook actual y su validación.
- Lógica de activación de cuenta.
- Middleware de autenticación y permisos.
- Componentes Vue del checkout y del acceso.
- Logs del backend alrededor de una operación real que haya devuelto `409`.

**Entregable:** mapa del flujo actual y correspondencia entre estados locales y estados del proveedor.

### Fase 2: robustecer el backend

1. Definir estados y transiciones permitidas.
2. Implementar consulta segura del estado.
3. Implementar consulta al proveedor cuando corresponda.
4. Corregir o completar el webhook.
5. Incorporar deduplicación e idempotencia.
6. Separar aprobación del pago y activación de cuenta.
7. Implementar reintentos recuperables de activación.
8. Registrar auditoría.

**Entregable:** endpoints probados y flujo de pago recuperable sin duplicar cobros.

### Fase 3: construir la vista

1. Crear la ruta de recuperación.
2. Agregar acceso desde checkout y login.
3. Implementar tarjeta de estado.
4. Agregar acciones contextuales.
5. Implementar consulta manual y sondeo limitado.
6. Redirigir al POS únicamente cuando la cuenta esté activa.
7. Mostrar soporte cuando no exista una recuperación automática segura.

**Entregable:** experiencia de recuperación integrada al POS.

### Fase 4: pruebas y despliegue

1. Ejecutar pruebas automatizadas.
2. Probar en ambiente de pruebas del proveedor.
3. Revisar logs y métricas.
4. Desplegar backend.
5. Desplegar frontend.
6. Validar con una operación real controlada.
7. Verificar que el webhook y la activación funcionen después del despliegue.

No modificar directamente registros de producción para simular aprobaciones.

---

## 12. Matriz de pruebas obligatorias

| Caso | Resultado esperado |
|---|---|
| Checkout devuelve 409 por revisión | Se muestra recuperación y no se crea otro cobro |
| Usuario vuelve a la vista | Se encuentra la operación anterior |
| Proveedor sigue en revisión | Se mantiene el bloqueo de nuevo pago |
| Proveedor confirma aprobación | Se marca el pago como aprobado |
| Webhook de aprobación llega dos veces | Una sola activación |
| Webhook llega antes del retorno del navegador | La vista muestra el estado real del backend |
| Navegador regresa con parámetro de éxito, sin webhook confirmado | No se activa la cuenta |
| Proveedor rechaza el pago | Se informa rechazo y se permite nuevo intento cuando corresponda |
| Checkout expira | Se permite crear un intento nuevo |
| API del proveedor no responde | Se conserva el estado incierto; no se duplica el cobro |
| Pago aprobado, activación falla | Se reintenta activación sin volver a cobrar |
| Usuario intenta consultar pago ajeno | Acceso denegado sin revelar datos |
| Token de recuperación expirado | Se solicita un nuevo mecanismo de verificación |
| Dos solicitudes simultáneas de checkout | Solo se crea el intento permitido |
| Evento tardío de un intento anterior | No altera indebidamente una suscripción más reciente |
| Pago reembolsado o revertido | Se aplica la política de suscripción correspondiente y se registra auditoría |

---

## 13. Observabilidad y soporte

Registrar eventos estructurados con:

- `request_id`.
- `payment_attempt_id`.
- `subscription_id`.
- `account_id` interno.
- Proveedor.
- Estado anterior y nuevo.
- Origen del cambio (`checkout`, `webhook`, `status_sync`, `admin`, `activation_worker`).
- Resultado de validación.
- Duración de consulta.
- Código de error normalizado.

No registrar contraseñas, tokens, secretos, datos completos de tarjetas ni enlaces de pago que contengan credenciales.

Métricas recomendadas:

- Pagos pendientes por antigüedad.
- Pagos en revisión.
- Pagos aprobados sin cuenta activa.
- Activaciones fallidas.
- Webhooks inválidos o duplicados.
- Consultas al proveedor fallidas.
- Operaciones que requieren intervención administrativa.

Crear una alerta cuando existan pagos aprobados que no hayan activado la cuenta dentro del umbral operativo definido.

---

## 14. Criterios de aceptación

La funcionalidad se considera terminada cuando:

- El usuario puede recuperar una operación pendiente sin iniciar otro cobro.
- El sistema muestra el estado real y actualizado de la operación.
- El usuario puede continuar un pago solo cuando el proveedor permite hacerlo.
- Un pago confirmado activa la cuenta automáticamente.
- Una falla temporal de activación no obliga a pagar nuevamente.
- Los webhooks repetidos no duplican activaciones.
- Los estados inciertos no se convierten en aprobados por inferencia.
- Las operaciones pertenecen exclusivamente al usuario/cuenta autorizados.
- Los pagos y activaciones quedan auditados.
- La vista distingue claramente entre pago aprobado y cuenta activa.
- Los casos de la matriz de pruebas están cubiertos.

---

## 15. Información necesaria para adaptar la solución al código real

Antes de implementar, confirmar:

1. **Proveedor de pagos:** nombre y producto utilizado (por ejemplo, Stripe Checkout, Mercado Pago Checkout Pro u otro).
2. **Persistencia:** tablas/modelos actuales de pagos, suscripciones y cuentas.
3. **Webhook:** ruta actual, validación de firma y eventos recibidos.
4. **Activación:** función o servicio que cambia la cuenta a activa.
5. **Frontend:** ubicación del checkout, router y sistema de autenticación.

No se debe implementar una integración genérica con un proveedor supuesto. La consulta del estado, los estados terminales, la validación de webhook y la reanudación del checkout dependen de las capacidades y reglas documentadas del proveedor real.

---

## 16. Recomendación final

Implementar la recuperación como un flujo de **reconciliación de pago + activación idempotente**, no como un botón que simplemente repite el checkout.

La prioridad técnica es resolver este caso:

> El proveedor ya pudo haber recibido el dinero, pero el usuario no sabe si el pago se confirmó y la cuenta todavía no está activa.

La solución debe poder determinar de forma segura si el pago fue aprobado, continuar esperando si está en revisión, permitir un nuevo intento solo si el anterior terminó sin cobro y completar la activación sin generar una segunda transacción.

**Orden recomendado:** primero auditar el flujo actual y el origen del `409`; después robustecer webhook, consulta de estado e idempotencia; finalmente construir la vista de recuperación sobre esos servicios. Así la interfaz no oculta un problema de consistencia del backend y el proceso puede recuperarse incluso si el usuario cierra el navegador o el servidor falla durante la activación.

---

## 17. Implementación en este repositorio

La implementación se adapta a **Stripe Checkout para suscripciones** y al registro existente `pos_pending_signups`; no agrega un proveedor genérico ni duplica las tablas de pagos y suscripciones.

- `POST /api/suscripciones/public/payment-recovery` solicita por correo un enlace temporal. La respuesta es genérica para no confirmar si existe una contratación y las solicitudes del mismo registro se limitan a una por minuto.
- El enlace contiene un token aleatorio de 256 bits; en la base de datos solo se guarda su hash y vence en 30 minutos.
- `GET /api/suscripciones/public/payment-recovery/:token` consulta Stripe y devuelve el estado, importe, moneda, fecha y acciones permitidas. Una sesión pagada se reconcilia con el servicio existente antes de mostrar la activación.
- `POST /api/suscripciones/public/payment-recovery/:token/retry` solo crea otro Checkout si Stripe devuelve una sesión `expired`, de modo `subscription` y con `payment_status` `unpaid`. Una sesión abierta, completa o incierta no permite otro cobro.
- `POST /api/suscripciones/public/payment-recovery/:token/resend-account-email` permite reintentar el correo mediante el enlace de recuperación, conservando la limitación existente de reenvío.
- La vista pública está disponible en `/recuperar-pago`, con accesos desde Planes y Login; incluye consulta automática limitada, continuación del Checkout, reintento seguro y reenvío del correo de activación.
- `GET /api/suscripciones/me/payment-status` requiere autenticación y devuelve el estado de la suscripción y el último pago de la organización en sesión.

Los estados de Checkout se obtienen directamente de Stripe. La confirmación del pago y la activación de la cuenta se presentan como etapas distintas; el retorno del navegador no se utiliza como evidencia de pago.
