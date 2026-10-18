# Análisis de integración: backend, impresión local y apertura de caja

**Fecha:** 2026-10-01  
**Alcance:** determinar la integración existente entre Express, el agente local de hardware y la apertura lógica/física de caja; proponer una capa directa frontend-agente para las instrucciones de impresión.

## Conclusión ejecutiva

El backend Express **no está conectado directamente** al `hardware-agent` para imprimir ni para abrir físicamente el cajón. Sí existe un agente separado, con endpoints para impresión, prueba y pulso de cajón. La arquitectura documentada actualmente es que el frontend llama al backend para registrar la venta y, tras recibir confirmación, llama al agente local de la misma computadora.

La caja del backend y el cajón físico son funciones distintas:

- `POST /api/caja/open` crea una sesión lógica de caja y guarda su base; no activa hardware.
- `POST /api/caja/close` guarda arqueo y cierra la sesión lógica; no activa hardware.
- `POST /print` en el agente puede imprimir y solicitar el pulso del cajón en una sola operación.
- `POST /drawer/open` solicita un pulso manual al cajón.

Por tanto, el enfoque recomendado es una **capa adaptadora en el frontend**: recibe la venta confirmada por el backend (o la venta local persistida en el flujo offline), la transforma a un formato de ticket estable y envía la instrucción directamente al agente de esa caja. El backend sigue siendo autoridad de ventas, caja, precios y permisos; el agente se limita a operar dispositivos.

## Estado verificado

| Superficie | Estado actual |
|---|---|
| Registro de ventas | Express expone `/api/transactions`; el flujo documentado registra primero la venta. |
| Administración de caja | `/api/caja/open`, `/close`, `/status`, arqueo e historial administran estado de negocio, sin llamadas al agente. |
| Agente local | `hardware-agent/server.js` implementa `/health`, `/printers`, `/test/print`, `/print`, `/drawer/open` y lectura de báscula. |
| Conexión backend-agente | No se encontró cliente HTTP del agente, router de hardware ni importación del agente desde `src/app.js` o los servicios de ventas/caja. |
| Conexión frontend-agente | La documentación especifica `VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181` y llamadas directas del navegador. El proyecto frontend no está incluido en este workspace, por lo que no se pudo verificar su implementación efectiva. |
| Ejecución | `npm run agent` inicia el agente como proceso separado del servidor Express (`npm start`). |

### Evidencia local

- [src/app.js](src/app.js) monta caja y transacciones, pero no una ruta de hardware.
- [src/routes/caja.routes.js](src/routes/caja.routes.js) delega apertura/cierre a `cajaService`.
- [src/services/cajaService.js](src/services/cajaService.js) persiste la sesión lógica, sin operaciones de impresión ni red hacia el agente.
- [hardware-agent/server.js](hardware-agent/server.js) contiene los endpoints y el acceso al transporte de impresora/cajón.
- [package.json](package.json) define `start` y `agent` como procesos independientes.
- [DOCUMENTACION_FRONTEND_HARDWARE_AGENT.md](DOCUMENTACION_FRONTEND_HARDWARE_AGENT.md) describe el flujo online: guardar venta en Express y luego enviar el ticket desde Vue al agente local.
- [DOCUMENTACION_FLUJO_OFFLINE_AGENTE_HARDWARE.md](DOCUMENTACION_FLUJO_OFFLINE_AGENTE_HARDWARE.md) describe la impresión de ventas offline directamente desde el POS.

## Arquitectura recomendada

El agente escucha en `127.0.0.1:18181` **en la computadora de la caja**. Si Express está alojado en un servidor central, `127.0.0.1` desde ese servidor apunta al servidor, no a la caja del usuario. Por ello, agregar una llamada desde el backend central a esa dirección no conectaría con la impresora del cliente.

```text
Frontend POS en la caja
  |                                  Backend POS central
  | POST /api/transactions                    |
  |------------------------------------------>|
  |<------------------------------------------|
  | venta confirmada                           |
  |                                            |
  | Adaptador de impresión                     |
  | normaliza venta -> PrintJob                |
  |                                            |
  | POST http://127.0.0.1:18181/print          |
  |------------------------------------------->| Hardware Agent local
                                                | -> impresora
                                                | -> pulso cajón (si aplica)
```

La capa directa debe ser un servicio/adaptador del frontend (por ejemplo, `printJobFactory` más `hardwareAgentClient`), no una segunda autoridad de negocio. Debe aceptar dos orígenes de datos con un mismo contrato:

1. **Online:** los datos devueltos por `POST /api/transactions` después de confirmar la venta.
2. **Offline:** la venta completa ya persistida localmente antes de imprimir, siguiendo el flujo offline existente.

Ambos se convierten a una instrucción común y se envían al mismo endpoint del agente. Esto da al agente un formato coherente “como instrucción del backend”, aunque la petición de hardware viaje desde el frontend local.

## Contrato propuesto para la capa frontend

El adaptador debe recibir una venta y opciones de operación, sin aceptar del UI campos privilegiados como empleado, precio oficial o estado de pago para validar la venta. Para impresión, produce un objeto compatible con el contrato actual del agente:

```json
{
  "saleId": "TX-1720000000000",
  "type": "SALE",
  "openDrawer": true,
  "ticket": {
    "storeName": "SSAXXON POS",
    "folio": "TICKET-1720000000000",
    "items": [
      {
        "name": "Producto",
        "quantity": 2,
        "price": 10,
        "total": 20
      }
    ],
    "total": 20
  }
}
```

El frontend envía este JSON a `POST http://127.0.0.1:18181/print` con `Content-Type: application/json` y `X-Agent-Token`. Para efectivo, debe usar `openDrawer: true` en esa misma petición, no imprimir y luego enviar un segundo pulso; así se evita abrir dos veces el cajón. La respuesta debe conservar por separado el estado de impresión y el del cajón.

El renderer actual del agente consume `businessName`/`storeName`, `codigoTicket`/`folio`/`saleId`, `items` con `quantity`, `nombreProd`/`name`, `total`/`price` y el `total` general. Campos como fecha, subtotal, impuestos, cliente, método de pago y pie de página se aceptan en el JSON, pero el renderer actual no los imprime. La capa debe mapear los datos que el renderer sí admite; ampliar el ticket impreso requiere un cambio posterior en el renderer del agente.

### Reglas de operación

- **Venta online:** solo intentar impresión después de que el backend confirme la venta. Un fallo del agente no revierte ni vuelve a cobrar la venta; se marca impresión pendiente y se permite reimpresión.
- **Venta offline:** persistir primero la venta con identificador estable; después enviar la copia local al agente y sincronizar con el backend cuando vuelva la conexión.
- **Reimpresión:** reutilizar la venta existente con `type: "REPRINT"` y `openDrawer: false`.
- **Pago no efectivo:** usar `openDrawer: false`.
- **Apertura manual:** llamar `/drawer/open` solo desde una acción explícita autorizada en la aplicación; el agente por sí solo no conoce el rol de la sesión POS.
- **Estado de caja:** comprobar la sesión mediante `/api/caja/status`; no inferir apertura física del cajón a partir de `abierta: true`.

## Seguridad y límites actuales que deben corregirse

1. **Token opcional fail-open:** en `hardware-agent/server.js`, la autorización equivale a permitir todas las peticiones cuando `HARDWARE_AGENT_TOKEN` está vacío. La configuración debe fallar cerrada: el agente no debería iniciar en modo operativo si no tiene un secreto configurado.
2. **Token expuesto en frontend:** un `VITE_HARDWARE_AGENT_TOKEN` compilado puede ser inspeccionado por quien tenga acceso al bundle. Usar un token distinto por caja reduce el alcance de una filtración, pero no convierte el token del navegador en secreto. Para un despliegue público, hace falta provisionamiento/rotación por dispositivo y límites locales apropiados.
3. **Origen permitido no sustituye autenticación:** CORS protege el acceso desde navegadores, pero no autentica clientes no-browser. Mantener agente ligado a loopback y exigir token no vacío.
4. **Apertura del cajón no está implementada para `windows`:** la función `openDrawer()` solo devuelve éxito con transporte `mock` o envía un pulso ESC/POS con `tcp`; en cualquier otro transporte devuelve `DRAWER_NOT_CONFIGURED`. Así, con `HARDWARE_PRINTER_TRANSPORT=windows`, `/print` puede reportar impresión exitosa y cajón no abierto. `HARDWARE_OPEN_DRAWER_ON_CASH` aparece en configuración/documentación, pero no se consume en el código actual del agente.
5. **Respuesta compuesta:** `/print` devuelve `success: true` si imprimió, aunque `drawer.ok` sea falso. El frontend debe inspeccionar ambos resultados y no presentar “cajón abierto” si la respuesta no lo confirma.
6. **No enviar órdenes arbitrarias:** el adaptador debe formar tickets a partir de datos de venta y elegir endpoints/tipos permitidos. No se recomienda exponer una caja genérica para que cualquier módulo envíe bytes ESC/POS crudos desde el navegador.

## Alternativa si se exige que el backend inicie la impresión

Un endpoint Express como `POST /api/print` puede validar identidad/venta y producir una instrucción normalizada, pero no puede alcanzar el agente local de cada cliente mediante `localhost` desde un backend remoto. Para conservar ese requisito habría que cambiar la topología: el agente local tendría que abrir una conexión saliente autenticada al backend (por ejemplo, WebSocket o sondeo de una cola por `deviceId`) y recoger trabajos asignados a su caja. Esto requiere entrega/reintentos, deduplicación del trabajo, expiración, control de permisos y asociación segura `deviceId`-usuario. Es una ampliación distinta y más compleja; no es necesaria para el flujo directo recomendado.

## Validación ejecutada y pendientes

- La inspección de código confirma que caja lógica, backend de transacciones y agente son componentes separados.
- `npm.cmd run agent:test` sin configuración explícita **falló**: el test esperaba HTTP `200` para `/print`, pero recibió `503`. Al repetirlo con `HARDWARE_PRINTER_TRANSPORT=mock` y un token de prueba, el contrato pasó. El test no fija el transporte por sí mismo; Windows selecciona `windows` por defecto y ese transporte requiere una impresora configurada. El resultado mock no demuestra que haya impresión física disponible ni valida integración backend-agente.
- Antes de usar en caja real: probar por separado impresión física y cajón con el transporte/adaptador soportado; confirmar que los estados `print.ok` y `drawer.ok` se muestran independientemente.
- La implementación del POS frontend está fuera del workspace y no se pudo confirmar si ya existe un adaptador ejecutable o si solo está descrito en la documentación.

## Decisión

Mantener Express como autoridad para validar y registrar ventas y sesiones de caja. Implementar/centralizar en el frontend una capa `sale -> PrintJob -> Hardware Agent local`, con contrato versionado, credenciales propias por dispositivo y estados independientes de venta, impresión y cajón. Mantener impresión fuera de la transacción comercial: el hardware puede fallar sin invalidar una venta confirmada.