# Actualizacion del frontend: conexion con Hardware Agent

## 1. Arquitectura

El frontend Vue se conecta a dos servicios diferentes:

```text
Frontend Vue en la computadora del cliente
        |
        +--> Backend POS central
        |    VITE_API_URL
        |
        +--> Hardware Agent local
             VITE_HARDWARE_AGENT_URL
             http://127.0.0.1:18181
                  |
                  +--> Impresora termica
                  +--> Cajon de dinero
```

El `hardware-agent` se ejecuta en cada computadora/caja del cliente. No se debe cambiar `VITE_HARDWARE_AGENT_URL` por la URL publica del backend.

## 2. Variables de entorno del frontend

En el proyecto Vue crear o actualizar `.env.development`:

```env
VITE_API_URL=http://localhost:3000/api
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
VITE_HARDWARE_AGENT_TOKEN=cambia-este-token-local
```

En produccion, `VITE_API_URL` debe apuntar al backend publicado:

```env
VITE_API_URL=https://api.tudominio.com/api
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
VITE_HARDWARE_AGENT_TOKEN=cambia-este-token-local
```

El valor de `VITE_HARDWARE_AGENT_TOKEN` debe ser exactamente igual a `HARDWARE_AGENT_TOKEN` en el archivo `.env` del agente instalado en esa caja:

```env
HARDWARE_AGENT_TOKEN=cambia-este-token-local
```

Despues de modificar variables `VITE_*`, reiniciar el servidor de desarrollo o volver a construir el frontend.

> El token se entrega al navegador porque el agente es un servicio local. Debe usarse un token diferente por caja y no debe reutilizarse como secreto del backend central.

## 3. Cliente para el Hardware Agent

Crear `src/services/hardwareAgent.js`:

```js
const hardwareAgentUrl = import.meta.env.VITE_HARDWARE_AGENT_URL || 'http://127.0.0.1:18181';
const hardwareAgentToken = import.meta.env.VITE_HARDWARE_AGENT_TOKEN || '';

async function hardwareRequest(path, options = {}) {
  const response = await fetch(`${hardwareAgentUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': hardwareAgentToken,
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.success === false) {
    const error = new Error(body.error || 'El Hardware Agent no respondio correctamente');
    error.code = body.error || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }

  return body;
}
export const hardwareAgent = {
  async health() {
    const response = await fetch(`${hardwareAgentUrl}/health`);
    const body = await response.json().catch(() => ({}));

    if (!response.ok || body.success === false) {
      throw new Error('Hardware Agent no disponible');
    }

    return body;
  },

  async listPrinters() {
    return hardwareRequest('/printers');
  },

  async print(ticket, { saleId, type = 'SALE', openDrawer = false } = {}) {
    return hardwareRequest('/print', {
      method: 'POST',
      body: JSON.stringify({
        saleId,
        type,
        openDrawer,
        ticket
      })
    });
  },

  async openDrawer() {
    return hardwareRequest('/drawer/open', {
      method: 'POST',
      body: '{}'
    });
  },

  async testPrint() {
    return hardwareRequest('/test/print', {
      method: 'POST',
      body: '{}'
    });
  }
};
```

## 4. Cliente para el backend POS

El cliente del backend debe conservar el token Bearer de autenticacion separado del token del agente:

```js
// src/services/api.js
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function apiRequest(path, options = {}) {
  const authToken = localStorage.getItem('auth_token');
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.message || 'El backend no pudo completar la operacion');
  }

  return body;
}
```

No enviar `VITE_HARDWARE_AGENT_TOKEN` como `Authorization`. El agente espera este header:

```http
X-Agent-Token: valor-del-token-local
```

## 5. Preparar el ticket desde la venta

El backend actual devuelve la venta en `response.data` con estos campos principales:

- `codigoTransaccion`
- `codigoTicket`
- `fechaDeTrans`
- `items`
- `subtotal`
- `discount`
- `total`
- `paymentMethod`
- `customer`

Crear `src/services/ticketMapper.js`:

```js
export function saleToTicket(sale) {
  return {
    storeName: 'SSAXXON POS',
    folio: sale.codigoTicket || sale.codigoTransaccion,
    saleId: sale.codigoTransaccion,
    date: sale.fechaDeTrans,
    customerName: sale.customer?.nombre || 'Publico general',
    items: (sale.items || []).map((item) => ({
      name: item.nombreProd || item.nombre || item.name || 'Producto',
      quantity: item.quantity || 1,
      price: item.unitPrice ?? item.price ?? 0,
      total: item.total ?? 0
    })),
    subtotal: sale.subtotal || 0,
    tax: sale.tax || sale.impuestos || 0,
    total: sale.total || 0,
    paymentMethod: sale.paymentMethod || 'cash',
    footer: 'Gracias por su compra'
  };
}

export function isCashPayment(paymentMethod) {
  return ['cash', 'efectivo'].includes(
    String(paymentMethod || '').toLowerCase()
  );
}
```

## 6. Flujo despues del pago exitoso

Crear o actualizar `src/services/saleService.js`:

```js
import { apiRequest } from './api';
import { hardwareAgent } from './hardwareAgent';
import { isCashPayment, saleToTicket } from './ticketMapper';

export async function createSaleAndPrint(payload) {
  // Paso 1: registrar y confirmar la venta en el backend.
  const response = await apiRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const sale = response.data;

  // Paso 2: la venta ya existe. Un fallo de hardware no debe cancelarla.
  try {
    const hardware = await hardwareAgent.print(saleToTicket(sale), {
      saleId: sale.codigoTransaccion,
      type: 'SALE',
      openDrawer: isCashPayment(sale.paymentMethod)
    });

    return {
      sale,
      print: {
        success: hardware.print?.ok === true,
        status: hardware.print?.ok === true ? 'printed' : 'failed',
        drawer: hardware.drawer,
        error: null
      }
    };
  } catch (error) {
    return {
      sale,
      print: {
        success: false,
        status: 'failed',
        drawer: null,
        error: error.code || error.message
      }
    };
  }
}
```

### Regla principal

```text
Backend responde success: true
        |
        +--> llamar POST /print

Backend responde error
        |
        +--> no llamar al Hardware Agent
```

Si la venta se registro y la impresora falla, no se debe volver a cobrar. Se debe mostrar una opcion de reimpresion.

## 7. Uso desde el componente de pago

```vue
<script setup>
import { ref } from 'vue';
import { createSaleAndPrint } from '@/services/saleService';

const processing = ref(false);
const saleResult = ref(null);
const message = ref('');

async function confirmPayment({ items, paymentMethod, customer }) {
  if (processing.value) return;

  processing.value = true;
  message.value = '';

  try {
    saleResult.value = await createSaleAndPrint({
      items,
      paymentMethod,
      customer,
      employeeNumber: 1
    });

    if (saleResult.value.print.status === 'failed') {
      message.value = `Venta registrada. Impresion pendiente: ${saleResult.value.print.error}`;
    } else {
      message.value = 'Venta registrada e impresa correctamente.';
    }
  } catch (error) {
    message.value = `No se registro la venta: ${error.message}`;
  } finally {
    processing.value = false;
  }
}
</script>
```

## 8. Reimpresion

La reimpresion usa la venta existente y nunca abre el cajon automaticamente:

```js
import { hardwareAgent } from './hardwareAgent';
import { saleToTicket } from './ticketMapper';

export async function reprintSale(sale) {
  return hardwareAgent.print(saleToTicket(sale), {
    saleId: sale.codigoTransaccion,
    type: 'REPRINT',
    openDrawer: false
  });
}
```

## 9. Comprobacion de conectividad

Al iniciar la pantalla POS, consultar el agente local:

```js
import { hardwareAgent } from '@/services/hardwareAgent';

export async function checkHardware() {
  try {
    const health = await hardwareAgent.health();
    return {
      connected: health.status === 'ok',
      printers: health.printers || [],
      error: null
    };
  } catch (error) {
    return {
      connected: false,
      printers: [],
      error: 'HARDWARE_AGENT_OFFLINE'
    };
  }
}
```

Estados sugeridos para la interfaz:

```text
Agente conectado / Impresora lista
Agente conectado / Impresora no disponible
Agente desconectado
Venta registrada / Impresion pendiente
```

## 10. Diagnostico de errores

### `401 UNAUTHORIZED_AGENT`

El frontend llego al agente, pero el token no coincide.

Revisar:

```env
# .env del agente local
HARDWARE_AGENT_TOKEN=valor-compartido

# .env del frontend Vue
VITE_HARDWARE_AGENT_TOKEN=valor-compartido
```

Reiniciar ambos procesos despues de cambiar variables.

### `403 ORIGIN_NOT_ALLOWED`

El origen del frontend no esta en `HARDWARE_AGENT_ALLOWED_ORIGINS`:

```env
HARDWARE_AGENT_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

### `PRINTER_UNAVAILABLE`

El agente respondio, pero no pudo comunicarse con la impresora. Revisar impresora, cableado y transporte configurado.

### No hay respuesta de `127.0.0.1:18181`

El agente no esta iniciado en la computadora del cliente. Ejecutar alli:

```powershell
cd C:\Users\Anderson\Documents\hardware-agent
npm.cmd start
```

## 11. Prueba manual desde el navegador

Con el agente iniciado, ejecutar desde la consola del frontend:

```js
fetch('http://127.0.0.1:18181/health')
  .then((response) => response.json())
  .then(console.log)
  .catch(console.error);
```

Para una ruta protegida:

```js
fetch('http://127.0.0.1:18181/printers', {
  headers: {
    'X-Agent-Token': import.meta.env.VITE_HARDWARE_AGENT_TOKEN
  }
})
  .then((response) => response.json())
  .then(console.log)
  .catch(console.error);
```

En la consola del agente deben aparecer:

```text
[AGENT REQUEST] GET /health desde http://localhost:5173
[AGENT HEALTH] Conexion recibida correctamente. Impresoras: 1
[AGENT RESPONSE] GET /health -> 200
```

Para `/print` debe aparecer adicionalmente:

```text
[AGENT AUTH] Token valido en POST /print
```

## 12. Ventas sin internet

El flujo online se conserva: primero se registra la venta en el backend y despues se imprime.
Si el backend no responde por un error de red, el frontend guarda la venta completa en IndexedDB,
la imprime mediante el agente local y la marca como pendiente de sincronizacion.

La venta pendiente contiene:

- `clientTransactionId`: UUID estable de la venta.
- `deviceId`: identificador persistente de la caja.
- `payload`: items, total, descuento, cliente, empleado y metodo de pago.
- `attempts` y `lastError`: control de reintentos.

Al recuperar internet se usa:

```text
POST /api/transactions/sync
```

El backend debe tratar la combinacion `deviceId + clientTransactionId` como unica.
Si recibe nuevamente la misma venta, debe devolver la transaccion ya registrada sin crear otra.
En produccion esta regla debe estar respaldada por una restriccion UNIQUE en la base de datos;
el backend demo actualmente mantiene sus datos en memoria.

Una venta offline impresa no debe presentarse como registrada oficialmente hasta que el backend
confirme la sincronizacion. Si la caja esta cerrada o el inventario ya no permite la venta,
la sincronizacion quedara en estado fallido para revision del responsable.
