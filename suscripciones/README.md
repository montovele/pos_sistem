# Suscripciones SaaS

## Estado actual

- `GET /suscripciones/account/subscription` y `POST /suscripciones/account/subscription/refresh` resuelven la cuenta exclusivamente desde `req.session.user.id` y `saas_account_users`.
- `POST /suscripciones/account/subscription` permite el alta inicial: deriva el usuario desde la sesión, crea o reutiliza su cuenta SaaS y registra la suscripción sin exigir que el frontend conozca un `account_id`.
- `GET /suscripciones/account/providers/:proveedorId/subscriptions` solo devuelve suscripciones de un proveedor relacionado con la cuenta del usuario autenticado; no requiere permiso administrativo porque el alcance se deriva de la sesion.
- El CRUD administrativo esta separado de las rutas de cuenta: `GET /suscripciones/admin/saas/subscriptions`, `GET /suscripciones/admin/saas/subscriptions/:subscriptionId`, `GET /suscripciones/admin/saas/users/:userId/subscriptions`, `POST /suscripciones/admin/saas/accounts/:accountId/subscription`, `PUT /suscripciones/admin/saas/subscriptions/:subscriptionId`, `PUT /suscripciones/admin/saas/accounts/:accountId/subscription` y `DELETE /suscripciones/admin/saas/subscriptions/:subscriptionId`.
- Alta, actualizacion y cancelacion requieren autenticacion, rol administrativo y permisos `saas.subscription.create`, `saas.subscription.update` o `saas.subscription.cancel`; cancelar cambia el estado a `canceled` y no elimina filas.
- `saas_accounts` es la unidad comercial y de cobro; `saas_account_providers` relaciona sus proveedores operativos. `proveedor_id` limita datos y operaciones, pero no crea una suscripcion separada.
- La ruta CT piloto valida que el `proveedor_id` de la sesion pertenezca a la cuenta SaaS mediante `saas_account_providers`.
- Refresh invalida `saas:entitlements:account:{accountId}:v1` antes de reconstruir la proyeccion.
- Las rutas administrativas requieren sesion, rol `admin` real y permisos `saas.subscription.read`, `saas.subscription.update` o `saas.entitlement.update`. Mientras se migra el catalogo de permisos, un `admin` sin lista explicita conserva compatibilidad temporal.
- Los cambios administrativos usan transaccion y registran `saas_subscription_audit`.
- Solo `active` y `trialing` conceden entitlements. Redis tiene fallback de lectura a base de datos; un fallo de base de datos no autoriza acceso.

## Contrato CRUD publico

Todas las respuestas exitosas usan `{ "data": ... }`. La alta administrativa recibe `plan_id` (codigo de plan activo), `status`, `started_at`, `current_period_end`, `cancel_at_period_end` y, opcionalmente, identificadores externos. Devuelve `201`; actualizaciones devuelven `200`. El borrado administrativo es una cancelacion logica y devuelve la proyeccion efectiva.

Los filtros de listado administrativo son `account_id`, `proveedor_id` y `status`; los dos primeros solo son filtros administrativos y nunca determinan el alcance de un usuario B2B. Las rutas de cuenta ignoran cualquier `account_id` recibido del navegador y derivan la cuenta desde la sesion y sus relaciones.

Errores publicos: `401 UNAUTHORIZED`, `403 PERMISSION_DENIED`, `403 SUBSCRIPTION_REQUIRED`, `404 ACCOUNT_NOT_FOUND` o `SUBSCRIPTION_NOT_FOUND`, y `422 INVALID_PLAN` o `INVALID_SUBSCRIPTION_STATUS`. No se incluyen secretos, SQL ni datos de billing.

## Bloqueo CT

No se aplica `requireEntitlement('ct')` al router completo de CT. `ct/routes/ctRoutes.js` mezcla rutas legacy con cadenas distintas de autenticacion: algunas usan `requireRole` y las rutas B2B usan `requireB2BAuth`, que admite un contexto por `proveedor_id` en body cuando no hay sesion. No existe una frontera unica y segura para insertar el entitlement sin cambiar el comportamiento de rutas existentes ni confiar en datos del navegador.

La ruta piloto actual es `GET /ct/saas/pilot` con `requireAuth -> resolveAccount -> requireRole -> requireEntitlement('ct')`. Toma `proveedor_id` exclusivamente de la sesion y no modifica las rutas CT legacy. No se conectaron billing ni webhooks.

## Pendientes de infraestructura

- Las migraciones `005` y `006` se ejecutan mediante `ct/config/db_ct.js` sobre `ssaxxon_ct_db`; pueden repetirse con `node setup/run-saas-migration.js` y `node setup/run-saas-account-providers-migration.js` de forma idempotente.
- `node setup/seed-saas-accounts.js` sigue bloqueando el poblamiento heuristico porque `user` no tiene `proveedor_id` y `proveedores` no tiene `user_id`.
- El mapeo autorizado de `usuario_general` se aplico en `ssaxxon_ct_db` con `node setup/seed-saas-user-provider.js --apply`: cuenta `1`, usuario local `8`, proveedor `21` (`Emma Whatzon`), rol `proveedor`, suscripcion `legacy` activa y entitlements `local_service`, `ct` y `billing`.
- Los permisos granulares SaaS estan en `middleware/requirePermission.js`; el fallback de `admin` es temporal hasta persistir permisos explicitos.
- El webhook SaaS de Stripe usa firma, transacción, invalidación de caché y auditoría; la deduplicación persistente de `event.id` queda como siguiente endurecimiento operativo.

## Checkout de suscripciones con Stripe

El catálogo público usa `GET /suscripciones/plans` (el alias existente `GET /suscripciones/account/plans` también se conserva). El flujo de pago usa `POST /suscripciones/account/checkout`, requiere sesión autenticada y un header `Idempotency-Key` estable por intento lógico. El body debe enviar el `codigo` de un plan activo publicado por el catálogo:

```json
{ "plan_id": "monthly" }
```

El backend selecciona exclusivamente el Price Stripe activo asociado a la versión de precio del plan SaaS y el frontend nunca envía importe, moneda, descuento ni `stripe_price_id`. Un plan solo se publica si tiene esa versión activa y su Price Stripe configurado.

Variables requeridas:

- `STRIPE_SECRET_KEY`
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (o el secreto Stripe existente como fallback)

Variables opcionales: `FRONTEND_URL`, `STRIPE_SUBSCRIPTION_SUCCESS_URL` y `STRIPE_SUBSCRIPTION_CANCEL_URL`.

Respuesta exitosa:

```json
{ "data": { "checkout_url": "https://checkout.stripe.com/...", "checkout_session_id": "cs_...", "plan_id": "annual" } }
```

El webhook SaaS es `POST /stripe/subscriptions/webhook`. Debe configurarse en Stripe para `checkout.session.completed` y `customer.subscription.created`, `customer.subscription.updated` y `customer.subscription.deleted`. El webhook verifica la firma con el body crudo, sincroniza el estado y `current_period_end` en UTC, y limpia la caché de entitlements.

## Decision de unidad comercial

La cuenta SaaS representa a la empresa que contrata el servicio y es la unidad de cobro. Una cuenta puede agrupar varios usuarios y proveedores. La suscripcion se consulta por `account_id` y sus entitlements habilitan los modulos para los proveedores asociados, mientras cada operacion conserva `proveedor_id` como alcance de datos.

```text
saas_accounts (unidad comercial/cobro)
	-> saas_account_users -> user
	-> saas_account_providers -> proveedores
```

Una asignacion valida requiere confirmar explicitamente `account_id`, `user_id`, `proveedor_id` y `rol`. El seed no crea estas filas automaticamente porque el esquema actual no contiene una relacion verificable entre `user` y `proveedores`.

## Integracion de suscripcion mensual en el POS

El POS ejecuta `pos_backend` y usa `usuarios.organization_id` como la cuenta comercial; no comparte la autenticacion por sesion ni la base `ssaxxon_ct_db` de las rutas SaaS anteriores. La integración POS se encuentra en `posSubscription.service.js` y `pos_backend/src/routes/subscription.routes.js` y se monta como `/api/suscripciones`.

- La base POS crea el plan mensual inicial de **599 MXN** durante `initializeDatabase()`.
- En `/suscripcion`, el superadministrador puede editar nombre, descripción, precio, publicación del plan y administrar el acceso de todas las organizaciones. En membresías manuales puede asignar o cambiar las fechas exactas de contratación/inicio y vencimiento con los calendarios de la tabla. El acceso comienza a las 00:00:00 UTC del inicio elegido; la fecha de vencimiento es inclusiva hasta las 23:59:59 UTC. Un inicio futuro deja la membresía programada y no concede acceso antes de esa fecha. Las suscripciones Stripe conservan sus propias fechas de periodo y ciclo de cobro; no se sobrescriben desde el panel.
- Cualquier usuario autenticado de una organización puede iniciar el checkout para contratar el plan de su propia organización. Admin y superadmin pueden además cancelar la renovación; ningún rol de organización puede cambiar la oferta SaaS global.
- Cambiar el precio crea un nuevo Price mensual de Stripe y solo se aplica a nuevas suscripciones; no modifica contratos existentes.
- El pago se procesa con Stripe Checkout. `POST /api/suscripciones/checkout` devuelve la URL de pago, requiere autenticación y `Idempotency-Key`, y siempre toma la organización del usuario autenticado. Se usa el correo del usuario o, si no existe, el correo de contacto de la organización.
- Configura `STRIPE_SECRET_KEY`, `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (o `STRIPE_WEBHOOK_SECRET`) y `FRONTEND_URL` en el backend. No guardes estas credenciales en el repositorio.
- El mensaje "Stripe no está configurado" significa que faltan las claves en el entorno de ejecución del backend; el precio solo se puede sincronizar después de configurar Stripe. Para habilitar checkout local, define ambas variables `STRIPE_*` en `pos_backend/.env`, configura el webhook indicado y reinicia el servidor.
- Configura el webhook de Stripe en `POST /api/suscripciones/webhook` para `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`. Si el webhook no llega al volver de Checkout, la pantalla llama `POST /api/suscripciones/reconcile`, que verifica una sesión completada directamente con Stripe y sincroniza la suscripción solo tras comprobar pago, cliente, organización, plan y estado; el endpoint obtiene la organización de la sesión autenticada.
- Cada factura confirmada (`invoice.paid`) se conserva de forma idempotente en `pos_subscription_payments`, con índice único por ID de factura. `GET /api/suscripciones/payments` devuelve únicamente el historial de la organización autenticada y se muestra en `/suscripcion`; la reconciliación de Stripe también recupera facturas pagadas cuando faltó el webhook.
- Los endpoints de suscripcion estan disponibles para que una organizacion sin acceso pueda revisar y renovar. El resto de los endpoints protegidos del POS devuelve `402 SUBSCRIPTION_REQUIRED` cuando no existe una suscripcion activa y vigente. El modo demo permanece accesible.
- La pantalla `/suscripcion` está disponible para cualquier usuario autenticado para consultar el plan y estado de acceso de su organización e iniciar la contratación. Solo `admin` y `superadmin` pueden cancelar la renovación; la administración global SaaS y el acceso de otras organizaciones se reservan al superadministrador. Solo un superadministrador puede otorgar ese rol desde Usuarios. Para crear el primer superadministrador, define `SUPERADMIN_USERNAME` con un usuario ya existente en `pos_backend/.env` y reinicia el backend; no configures una cuenta de acceso genérica en producción.
