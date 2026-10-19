# Integracion Vue 3 con agente local de impresion y cajon

## Importante: donde se ejecuta el agente

El `hardware-agent` **no se ejecuta en el servidor central ni en el hosting del backend**. Se instala y se inicia en cada computadora del cliente que tenga una impresora y/o cajon:

```text
Servidor central / Internet
  |
  +--> Backend POS y base de datos
  |
  +--> Frontend Vue 3 en el navegador del cliente
       |
       +--> http://127.0.0.1:18181
              |
              +--> Hardware Agent local
            |
            +--> Impresora termica
            +--> Cajon de dinero
```

Cada caja debe tener su propio agente ejecutandose localmente. Si existen tres cajas con tres impresoras, deben existir tres instalaciones del agente, una por computadora.

El navegador siempre debe llamar a `127.0.0.1` o `localhost`: esa direccion representa la computadora donde esta abierto el POS, no el servidor remoto.

## 1. Objetivo

El frontend debe seguir este orden:

```text
Vue 3 confirma el pago
        |
        v
POST /api/transactions
        |
        v
Backend guarda la venta correctamente
        |
        v
Vue recibe success: true
        |
        +--> POST http://127.0.0.1:18181/print
        |
        +--> El agente imprime el ticket
        |
        +--> Si el pago es efectivo, abre el cajon
```

La venta no depende de que la impresora o el cajon funcionen. Si el agente esta apagado, la venta continua registrada y el frontend debe mostrar una opcion de reimpresion.

## 2. Requisitos

- El backend POS puede estar en Internet o en la red local.
- El frontend Vue debe estar abierto en la computadora del cliente.
- El agente local debe estar ejecutandose en la misma computadora del cliente, en `http://127.0.0.1:18181`.
- El agente debe tener configurado el mismo token que usa el frontend.
- El navegador debe acceder al frontend desde un origen permitido, por ejemplo `http://localhost:5173`.
- La impresora debe ser compatible con ESC/POS. El cajon debe estar conectado al puerto `DK/RJ11` de la impresora.

Variables recomendadas para el frontend:

```env
VITE_API_URL=http://localhost:4080/api
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
VITE_HARDWARE_AGENT_TOKEN=cambia-este-token-local
```

`VITE_API_URL` apunta al backend central. `VITE_HARDWARE_AGENT_URL` apunta al equipo local del cliente. No deben apuntar al mismo servidor cuando la impresora esta instalada en la caja.

El token no debe exponerse en un frontend publico sin una estrategia adicional de provisionamiento por equipo. Para una instalacion local controlada, debe coincidir con `HARDWARE_AGENT_TOKEN` del agente.

## 3. Cliente HTTP del backend

```js
// src/services/api.js
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4080/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.message || 'No fue posible completar la operacion');
  }

  return body;
}
```

## 4. Cliente HTTP del agente

```js
// src/services/hardwareAgent.js
const agentUrl = import.meta.env.VITE_HARDWARE_AGENT_URL || 'http://127.0.0.1:18181';
const agentToken = import.meta.env.VITE_HARDWARE_AGENT_TOKEN || '';

async function agentRequest(path, options = {}) {
  const response = await fetch(`${agentUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': agentToken,
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body.error || 'El agente local no pudo completar la operacion');
    error.code = body.error || 'AGENT_ERROR';
    throw error;
  }

  return body;
}

export const hardwareAgent = {
  async health() {
    const response = await fetch(`${agentUrl}/health`);
    return response.json();
  },

  async printTicket(ticket, { saleId, type = 'SALE', openDrawer } = {}) {
    return agentRequest('/print', {
      method: 'POST',
      body: JSON.stringify({ saleId, type, ticket, openDrawer })
    });
  },

  async openDrawer() {
    return agentRequest('/drawer/open', { method: 'POST', body: '{}' });
  },

  async testPrint() {
    return agentRequest('/test/print', { method: 'POST', body: '{}' });
  }
};
```

## 5. Crear venta y mandar a imprimir

El endpoint actual del POS es `POST /api/transactions`. La respuesta exitosa tiene esta forma:

```json
{
  "success": true,
  "data": {
    "codigoTransaccion": "TX-1720000000000",
    "codigoTicket": "TICKET-1720000000000",
    "fechaDeTrans": "2026-09-15T15:00:00.000Z",
    "items": [
      {
        "nombreProd": "Mouse USB",
        "quantity": 1,
        "unitPrice": 180,
        "subtotal": 180,
        "discount": 0,
        "total": 180
      }
    ],
    "subtotal": 180,
    "discount": 0,
    "total": 180,
    "nombreCajero": "Administrador",
    "numeroEmpleado": 1,
    "status": "completed",
    "paymentMethod": "cash"
  }
}
```

Servicio recomendado:

```js
// src/services/saleService.js
import { apiRequest } from './api.js';
import { hardwareAgent } from './hardwareAgent.js';

const isCashPayment = (paymentMethod) =>
  ['cash', 'efectivo'].includes(String(paymentMethod || '').toLowerCase());

const toTicket = (sale) => ({
  storeName: 'SSAXXON POS',
  folio: sale.codigoTicket || sale.codigoTransaccion,
  saleId: sale.codigoTransaccion,
  date: sale.fechaDeTrans,
  customerName: sale.customer?.nombre || 'Publico general',
  items: (sale.items || []).map((item) => ({
    name: item.nombreProd || item.nombre || item.name || 'Producto',
    quantity: item.quantity,
    price: item.unitPrice ?? item.price,
    total: item.total
  })),
  subtotal: sale.subtotal,
  tax: sale.tax || sale.impuestos || 0,
  total: sale.total,
  paymentMethod: sale.paymentMethod,
  footer: 'Gracias por su compra'
});

export async function createSaleAndPrint(payload) {
  // 1. La venta se confirma primero en el backend.
  const result = await apiRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const sale = result.data;
  const print = {
    success: false,
    status: 'not_attempted',
    error: null
  };

  // 2. La venta ya existe. Un fallo del agente no debe revertirla.
  try {
    const hardwareResult = await hardwareAgent.printTicket(toTicket(sale), {
      saleId: sale.codigoTransaccion,
      type: 'SALE',
      openDrawer: isCashPayment(sale.paymentMethod)
    });

    print.success = hardwareResult.print?.ok === true;
    print.status = print.success ? 'printed' : 'failed';
    print.agent = hardwareResult;
  } catch (error) {
    print.status = 'failed';
    print.error = error.code || error.message;
  }

  return { sale, print };
}
```

## 6. Uso desde el componente Vue

```vue
<script setup>
import { ref } from 'vue';
import { createSaleAndPrint } from '@/services/saleService';

const isProcessing = ref(false);
const result = ref(null);
const errorMessage = ref('');

async function confirmPayment(paymentMethod, items, customer = null) {
  if (isProcessing.value) return;

  isProcessing.value = true;
  errorMessage.value = '';

  try {
    result.value = await createSaleAndPrint({
      items,
      paymentMethod,
      customer,
      employeeNumber: 1
    });

    if (result.value.print.status === 'failed') {
      errorMessage.value = 'La venta fue registrada, pero no se pudo imprimir el ticket.';
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isProcessing.value = false;
  }
}
</script>
```

La interfaz debe diferenciar estos estados:

```text
Venta registrada e impresa
Venta registrada, pero impresion fallida
No se pudo registrar la venta
```

No se debe mostrar `Venta fallida` cuando solamente fallo la impresora.

## 7. Contrato del agente local

Todas las rutas, excepto `/health`, requieren:

```http
X-Agent-Token: cambia-este-token-local
```

### Health

```http
GET http://127.0.0.1:18181/health
```

No requiere token. Se puede usar para mostrar si el agente esta disponible antes de cobrar.

### Imprimir ticket

```http
POST http://127.0.0.1:18181/print
Content-Type: application/json
X-Agent-Token: cambia-este-token-local
```

Body minimo:

```json
{
  "saleId": "TX-1720000000000",
  "type": "SALE",
  "openDrawer": true,
  "ticket": {
    "folio": "TICKET-1720000000000",
    "paymentMethod": "cash",
    "items": [
      {
        "name": "Mouse USB",
        "quantity": 1,
        "price": 180,
        "total": 180
      }
    ],
    "subtotal": 180,
    "total": 180
  }
}
```

Respuesta exitosa:

```json
{
  "success": true,
  "print": {
    "ok": true,
    "printerId": "POS-80",
    "transport": "mock",
    "bytes": 420
  },
  "drawer": {
    "success": true,
    "printerId": "POS-80"
  }
}
```

`openDrawer` puede omitirse. El agente lo activa automaticamente cuando `paymentMethod` es `cash` o `efectivo`, siempre que `HARDWARE_OPEN_DRAWER_ON_CASH=true`.

### Abrir cajon manualmente

```http
POST http://127.0.0.1:18181/drawer/open
Content-Type: application/json
X-Agent-Token: cambia-este-token-local
```

Esta operacion debe reservarse para usuarios autorizados, por ejemplo supervisor o administrador.

## 8. Reimpresion

La reimpresion no crea otra venta. Se reutiliza la venta existente:

```js
export async function reprintSale(sale) {
  return hardwareAgent.printTicket(toTicket(sale), {
    saleId: sale.codigoTransaccion,
    type: 'REPRINT',
    openDrawer: false
  });
}
```

Una reimpresion no debe abrir el cajon automaticamente.

## 9. Manejo de errores

### Backend no confirma la venta

```text
No llamar al agente.
Mostrar error de pago o persistencia.
Conservar el carrito para intentar nuevamente.
```

### Backend confirma y el agente no responde

```text
La venta queda registrada.
Mostrar: "Venta registrada, impresion pendiente".
Permitir reimpresion.
No volver a cobrar.
```

Errores comunes del agente:

| Codigo | Significado | Accion frontend |
|---|---|---|
| `UNAUTHORIZED_AGENT` | Token incorrecto | Revisar configuracion local |
| `ORIGIN_NOT_ALLOWED` | Origen no autorizado | Agregar origen al agente |
| `PRINTER_UNAVAILABLE` | Impresora desconectada o apagada | Mostrar reintento y reimpresion |
| `DRAWER_UNAVAILABLE` | No se pudo enviar el pulso al cajon | Informar sin invalidar la venta |
| `TICKET_REQUIRED` | Payload incompleto | Corregir el mapeo del ticket |

## 10. Instalacion en cada caja del cliente

En cada computadora que tenga impresora:

1. Copiar la carpeta `hardware-agent` junto con Node.js o empaquetarla como aplicacion instalable.
2. Crear el archivo `.env` con el token y la configuracion de esa caja.
3. Iniciar el agente como aplicacion residente o servicio de Windows.
4. Verificar desde esa misma computadora:

```powershell
Invoke-RestMethod http://127.0.0.1:18181/health
```

5. Probar la impresora con `POST /test/print` antes de habilitar cobros.

El backend central no necesita acceso USB, COM ni acceso directo a la impresora del cliente.

## 11. Recomendaciones de seguridad y operacion

- No llamar a `window.print()` para este flujo.
- No intentar imprimir antes de recibir `success: true` del backend.
- No revertir ni duplicar la venta si falla el hardware.
- Deshabilitar el boton de pago mientras la venta esta en proceso.
- Guardar localmente el identificador `codigoTransaccion` y `codigoTicket` para reimpresion.
- No abrir el cajon en reimpresiones ni pagos con tarjeta, salvo una accion explicita autorizada.
- Verificar `/health` al iniciar la caja y mostrar el estado del agente.
- Mantener el agente escuchando en `127.0.0.1`, no en todas las interfaces de red.
