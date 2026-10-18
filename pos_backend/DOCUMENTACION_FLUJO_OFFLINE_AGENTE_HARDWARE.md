# Flujo offline del POS y compatibilidad con Hardware Agent

## 1. Objetivo

Permitir que la caja continue operando cuando el backend central o internet no estan disponibles,
sin perder la comunicacion con el agente local de hardware.

Durante una interrupcion de red, el POS debe poder:

- aceptar una venta local,
- leer la bascula cuando el producto se vende por peso,
- imprimir el ticket en la impresora local,
- abrir el cajon para pagos en efectivo,
- guardar la venta completa en IndexedDB,
- sincronizarla con el backend cuando vuelva la conexion,
- evitar ventas duplicadas durante reintentos.

El agente local no reemplaza al backend. El agente solo opera hardware; el frontend conserva la
venta temporalmente y el backend central sigue siendo responsable de validar y registrar la venta.

## 2. Regla de compatibilidad

El flujo online actual debe mantenerse sin cambios de comportamiento:

```text
Backend disponible
  -> POST /api/transactions
  -> respuesta de venta registrada
  -> POST http://127.0.0.1:18181/print
```

El flujo offline se activa unicamente ante un error de red o cuando el navegador confirma que no
hay conexion. Un error funcional del backend, por ejemplo caja cerrada, empleado no autorizado o
venta invalida, no debe convertirse automaticamente en una venta offline.

```text
Backend no disponible por red
  -> guardar venta completa en IndexedDB
  -> leer hardware local si corresponde
  -> imprimir ticket local
  -> abrir cajon desde la misma solicitud de impresion
  -> marcar venta como pendiente de sincronizacion
```

## 3. Responsabilidades por componente

### Frontend POS

- Construye y valida el carrito.
- Genera `clientTransactionId` y conserva un `deviceId` por caja.
- Persiste la venta antes de operar hardware.
- Solicita la lectura de bascula al agente local.
- Solicita impresion y apertura del cajon.
- Presenta el estado real al cajero: impresa localmente, impresion pendiente o pendiente de
  sincronizacion.
- Reintenta la sincronizacion sin crear un nuevo identificador de venta.

### Hardware Agent

- Escucha en `127.0.0.1:18181`.
- Valida `X-Agent-Token` y el origen permitido.
- Lee la bascula por puerto serial o adaptador configurado.
- Genera bytes ESC/POS e imprime mediante el adaptador configurado.
- Abre el cajon mediante el pulso de la impresora.
- No registra ventas, no descuenta inventario y no decide si una venta es valida.

### Backend central

- Valida caja, empleado, productos, precios, inventario y permisos.
- Registra la venta sincronizada.
- Responde de forma idempotente cuando recibe de nuevo la misma venta offline.
- Conserva la relacion entre el folio local y el folio oficial.
- Reporta rechazos que requieren revision manual.

## 4. Identidad e idempotencia

Cada venta offline debe conservar estos campos:

```json
{
  "clientTransactionId": "uuid-estable-de-la-venta",
  "deviceId": "uuid-estable-de-la-caja",
  "createdAt": "2026-09-22T18:30:00.000Z"
}
```

La clave logica de idempotencia es:

```text
deviceId + clientTransactionId
```

El identificador se genera una sola vez al confirmar el pago y no debe cambiar durante los
reintentos. El backend debe devolver la venta ya registrada si recibe nuevamente esa combinacion.
En una base de datos real debe existir una restriccion `UNIQUE` para respaldar esta regla.

## 5. Persistencia local

La venta se almacena en el object store `pendingTransactions` de IndexedDB antes de imprimir.
Debe conservar como minimo:

```json
{
  "id": "clientTransactionId",
  "clientTransactionId": "uuid-estable",
  "deviceId": "uuid-de-la-caja",
  "codigoTransaccion": "LOCAL-ABC12345",
  "codigoTicket": "TICKET-LOCAL-ABC12345",
  "fechaDeTrans": "2026-09-22T18:30:00.000Z",
  "items": [],
  "total": 100,
  "discount": 0,
  "paymentMethod": "cash",
  "employeeNumber": 2,
  "customer": { "nombre": "Consumidor final" },
  "status": "pending",
  "attempts": 0,
  "lastError": null,
  "payload": {}
}
```

La persistencia debe ocurrir antes de imprimir porque un fallo del agente no debe perder una venta
que ya fue aceptada por la caja.

## 6. Contrato con el Hardware Agent

### Salud del agente

```http
GET http://127.0.0.1:18181/health
```

No depende del backend central. Sirve para conocer la disponibilidad local de impresora y bascula.

### Lectura de bascula

```http
GET http://127.0.0.1:18181/scale/weight
X-Agent-Token: <token-local>
```

Respuesta esperada:

```json
{
  "success": true,
  "weightGrams": 250,
  "weightKg": 0.25,
  "unit": "g",
  "stable": true
}
```

Reglas:

- No agregar automaticamente el producto si `stable` es `false`.
- Permitir captura manual si la bascula esta desconectada o la lectura es inestable.
- No llamar al backend para leer la bascula.
- Mantener la cantidad final dentro de `items` de la venta offline.

El agente implementado expone esta ruta. Para pruebas puede configurarse
`HARDWARE_SCALE_WEIGHT_GRAMS`; si no existe una lectura disponible responde `503
SCALE_UNAVAILABLE` y el frontend debe permitir captura manual.

### Impresion y cajon

```http
POST http://127.0.0.1:18181/print
X-Agent-Token: <token-local>
Content-Type: application/json
```

```json
{
  "saleId": "LOCAL-ABC12345",
  "type": "SALE_OFFLINE",
  "openDrawer": true,
  "ticket": {
    "storeName": "LEMARQUET POS",
    "folio": "TICKET-LOCAL-ABC12345",
    "saleId": "LOCAL-ABC12345",
    "date": "2026-09-22T18:30:00.000Z",
    "customerName": "Consumidor final",
    "items": [],
    "total": 100,
    "paymentMethod": "cash",
    "footer": "Pendiente de sincronizacion"
  }
}
```

Para efectivo, el agente debe imprimir y abrir el cajon dentro de la misma operacion. El frontend
no debe llamar adicionalmente a `/drawer/open`, porque podria generar un doble pulso.

Una respuesta valida puede contener:

```json
{
  "success": true,
  "print": { "ok": true },
  "drawer": { "ok": true }
}
```

Si la impresion falla, la venta permanece en IndexedDB. Si la impresion es correcta pero el cajon
falla, la venta no debe duplicarse: se conserva como venta impresa y se registra la incidencia del
cajon para revision.

## 7. Sincronizacion con el backend

Cuando vuelve internet, el frontend envia la venta pendiente sin cambiar su identificador:

```http
POST /api/transactions/sync
Authorization: Bearer <token-del-backend>
Content-Type: application/json
```

```json
{
  "clientTransactionId": "uuid-estable-de-la-venta",
  "deviceId": "uuid-estable-de-la-caja",
  "createdAt": "2026-09-22T18:30:00.000Z",
  "items": [],
  "total": 100,
  "discount": 0,
  "paymentMethod": "cash",
  "employeeNumber": 2,
  "customer": { "nombre": "Consumidor final" }
}
```

El backend debe responder con la transaccion oficial. Si ya existe la clave idempotente, debe
responder la transaccion existente en lugar de crear otra.

La ruta ya implementada es `POST /api/transactions/sync`. La organización se obtiene del token
Bearer y nunca del payload offline. Una venta nueva responde `201` con `idempotent: false`; una
repetición de la misma combinación responde `200` con `idempotent: true`.

En MySQL la clave se persiste como combinación única:

```text
organization_id + device_id + client_transaction_id
```

El índice `uq_transacciones_offline_identity` evita duplicados después de reiniciar el backend.

La venta solo se elimina de `pendingTransactions` despues de una respuesta exitosa o idempotente.
Los errores de validacion se conservan como `failed` y deben quedar visibles para revision.

## 8. Estados de una venta offline

```text
pending
  Venta persistida localmente y pendiente de envio.

syncing
  Se esta intentando registrar en el backend.

failed
  El backend rechazo la venta o el intento fallo. Se conserva el error.

completed
  El backend confirmo la venta oficial y se puede retirar de la cola local.
```

El resultado del hardware debe registrarse de forma independiente:

```text
printed       Ticket local impreso correctamente.
print_failed  La venta esta guardada, pero requiere impresion o reimpresion.
drawer_failed Ticket impreso, cajon no confirmado.
```

No se debe usar el resultado de impresion como prueba de que el backend registro la venta.

## 9. Compatibilidad y cambios permitidos

Para no romper lo funcional:

1. No cambiar la URL ni el token del agente local.
2. No sustituir `POST /print` por una llamada al backend.
3. Mantener `POST /api/transactions` para el flujo online.
4. Agregar `/api/transactions/sync` como ruta separada.
5. Mantener los nombres de los campos del ticket aceptados por el agente.
6. Permitir que el agente ignore campos adicionales como `clientTransactionId` si no los necesita.
7. Mantener captura manual de peso como respaldo.
8. No abrir el cajon con una segunda llamada despues de usar `openDrawer: true`.
9. Usar reintentos con backoff y sin generar nuevos identificadores.
10. Versionar cualquier cambio incompatible del contrato del agente.

## 10. Matriz de pruebas

| Caso | Resultado esperado |
| --- | --- |
| Backend y agente disponibles, pago efectivo | Venta online, ticket impreso y cajon abierto una vez |
| Backend y agente disponibles, pago no efectivo | Venta online y ticket impreso sin abrir cajon |
| Backend desconectado, agente disponible, efectivo | Venta en IndexedDB, ticket local y cajon abierto una vez |
| Backend desconectado, agente disponible, tarjeta | Venta en IndexedDB y ticket local sin abrir cajon |
| Backend desconectado, agente desconectado | Venta en IndexedDB, estado `print_failed`, no se pierde el carrito antes de confirmar |
| Bascula estable offline | Peso leido del agente y agregado al carrito |
| Bascula inestable offline | No agregar automaticamente; permitir repetir o capturar manualmente |
| Respuesta perdida despues de sincronizar | Reintento devuelve la misma venta, sin duplicarla |
| Caja cerrada al sincronizar | Venta `failed` con motivo visible; no eliminarla |
| Impresion correcta y cajon fallido | Venta no duplicada; registrar `drawer_failed` |
| Recarga del navegador con pendientes | IndexedDB restaura la cola y el siguiente intento continua |

## 11. Criterios de aceptacion

El flujo se considera compatible cuando:

- una venta offline puede continuar sin internet,
- la impresion se realiza desde el equipo local,
- el cajon se abre solo para efectivo y como maximo una vez,
- la bascula local funciona sin backend,
- ninguna venta pendiente desaparece por un fallo de hardware,
- los reintentos no duplican ventas,
- una venta no se muestra como registrada oficialmente antes de la confirmacion del backend,
- el flujo online existente mantiene sus respuestas y comportamiento,
- las fallas de caja, inventario o permisos quedan pendientes de revision y no se ocultan como
  simples errores de red.

## 12. Pendientes antes de produccion

- Implementar la restriccion `UNIQUE(deviceId, clientTransactionId)` en la base de datos real.
- Confirmar como se reserva o valida inventario para ventas offline.
- Definir politica para caja cerrada durante la sincronizacion.
- Agregar una vista de ventas pendientes, fallidas y reimpresion.
- Probar impresora, bascula y cajon en cada modelo de hardware soportado.
- Agregar pruebas automatizadas de idempotencia y recuperacion despues de recarga.
- Verificar que el ticket offline incluya una leyenda visible de pendiente de sincronizacion cuando
  la normativa o la operacion del negocio lo requiera.
