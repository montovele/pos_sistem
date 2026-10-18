# Guia de integracion del frontend con Hardware Agent

## Objetivo y arquitectura

El POS web se comunica directamente con el agente que corre en la misma computadora que la impresora. Esta comunicacion local no depende de que el backend central este disponible:

```text
POS en la caja                         Backend central
     |                                       |
     | venta local persistida               | (sin conexion en modo offline)
     |                                       |
     +---- HTTP a 127.0.0.1:18181/print ---> Hardware Agent
                                               +-- impresora
                                               +-- cajon
```

El agente solo ejecuta operaciones de hardware. No valida precios, permisos, pagos ni ventas y no guarda transacciones. El POS debe persistir primero la venta y mantener estados separados para venta/sincronizacion, impresion y cajon.

## 1. Instalar el cliente

El paquete del agente exporta un cliente frontend sin dependencias del servidor en `ssaxxon-pos-hardware-agent/client`.

Si ambos repositorios estan disponibles en la maquina de desarrollo, instala el paquete local desde la carpeta del POS. Ajusta la ruta relativa segun la ubicacion real:

```powershell
npm install ..\hardware-agent
```

Si el frontend se construye en CI o en otro repositorio, publica el paquete cliente en el registro privado aprobado por el proyecto o distribuye los archivos `client/` como paquete versionado. No copies el codigo a varios componentes del POS; centraliza el uso en un servicio de hardware.

## 2. Configurar agente y frontend

En el archivo `.env` de la instalacion local del agente:

```env
HARDWARE_AGENT_HOST=127.0.0.1
HARDWARE_AGENT_PORT=18181
HARDWARE_AGENT_TOKEN=token-unico-de-esta-caja
HARDWARE_AGENT_ALLOWED_ORIGINS=http://localhost:5173
```

`HARDWARE_AGENT_TOKEN` es obligatorio para iniciar el agente. Incluye cada origen exacto desde el que se sirve el POS, separados por coma. `http://localhost:5173` y `http://127.0.0.1:5173` son origenes diferentes; agrega ambos solo si realmente se usan. En produccion configura el dominio del POS, puerto y protocolo exactos.

En un frontend Vite, la configuracion de URL y token puede venir de variables `VITE_`:

```env
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
VITE_HARDWARE_AGENT_TOKEN=token-unico-de-esta-caja
```

Estas variables se incorporan al bundle al compilar. Un token `VITE_` no es secreto: quien inspeccione la aplicacion puede extraerlo. No reutilices el token de autenticacion del backend ni un token compartido entre todas las cajas. Para una distribucion publica o de alto riesgo hace falta un mecanismo de provisionamiento y rotacion por dispositivo; CORS por si solo no autentica clientes.

Reinicia el agente y vuelve a compilar/servir el frontend despues de cambiar la configuracion de Vite. El navegador debe abrir el POS en un origen listado en `HARDWARE_AGENT_ALLOWED_ORIGINS`.

## 3. Crear el cliente

Centraliza la instancia, por ejemplo en `src/services/hardwareAgent.js`:

```js
import { HardwareAgentClient } from 'ssaxxon-pos-hardware-agent/client';

export const hardwareAgent = new HardwareAgentClient({
  baseUrl: import.meta.env.VITE_HARDWARE_AGENT_URL || 'http://127.0.0.1:18181',
  token: import.meta.env.VITE_HARDWARE_AGENT_TOKEN
});
```

El cliente tiene `health()`, `printSale(sale, options)` y `reprintSale(sale, options)`. Las solicitudes a `/print` usan `Content-Type: application/json` y `X-Agent-Token`; el agente responde al preflight CORS del navegador.

## 4. Forma de la venta

El POS debe enviar el objeto de venta que ya guardo, no volver a calcular precios desde el formulario. El adaptador acepta estos campos:

| Dato | Campos reconocidos |
|---|---|
| Identificador estable | `saleId`, `id`, `folio` o `codigoTicket` |
| Nombre de tienda | `storeName` o `businessName`; opcionalmente `options.storeName` |
| Forma de pago | `paymentMethod` o `metodoPago` |
| Productos | `items`, arreglo no vacio |
| Nombre del producto | `name`, `nombreProd` o `productName` |
| Cantidad | `quantity` o `cantidad`, mayor que cero |
| Precio unitario | `price` o `precio`, igual o mayor que cero |
| Total de linea | `total` o `subtotal`; si falta, se calcula `quantity * price` |
| Total de venta | `total` o `totalVenta`; si falta, se suman las lineas |

Ejemplo de venta local persistida:

```js
{
  id: 'LOCAL-550e8400-e29b-41d4-a716-446655440000',
  paymentMethod: 'cash',
  items: [
    { name: 'Producto', quantity: 2, price: 10, total: 20 }
  ],
  total: 20
}
```

Genera el identificador una sola vez al crear la venta y guardalo junto con ella. No uses un ID nuevo cuando reintentes imprimir o sincronizar. Para evitar colisiones entre cajas, incluye un UUID u otro identificador globalmente unico.

## 5. Venta offline e impresion

El orden importa: persiste la venta local antes de llamar al agente. La venta y el intento de impresion son procesos independientes.

```js
import { hardwareAgent } from './services/hardwareAgent.js';

export async function printOfflineSale(sale, saleRepository) {
  await saleRepository.save({
    ...sale,
    syncStatus: 'pending',
    printStatus: 'pending',
    drawerStatus: 'pending'
  });

  try {
    const result = await hardwareAgent.printSale(sale, { source: 'offline' });
    await saleRepository.update(sale.id, {
      printStatus: result.printStatus,
      drawerStatus: result.drawerStatus,
      printedAt: new Date().toISOString()
    });
    return result;
  } catch (error) {
    await saleRepository.update(sale.id, {
      printStatus: 'pending',
      printError: error.code || 'PRINT_FAILED'
    });
    throw error;
  }
}
```

`source: 'offline'` etiqueta el origen de la instruccion; no convierte al agente en una base de datos. Conserva la venta aunque el agente no este disponible. La desconexion del backend no impide llamar a `127.0.0.1`, siempre que el agente este instalado y ejecutandose en la caja.

Para una venta en efectivo, el adaptador usa `openDrawer: true` en la misma operacion de impresion. Para otros medios de pago no solicita el pulso por defecto. No llames ademas a `/drawer/open` despues de imprimir en efectivo, porque podrias abrir el cajon dos veces.

## 6. Venta online

Primero espera la confirmacion de `POST /api/transactions`; despues imprime la venta confirmada con el mismo cliente:

```js
const confirmedSale = await transactionsApi.create(salePayload);
const printResult = await hardwareAgent.printSale(confirmedSale, { source: 'online' });
```

Un error del agente no debe cancelar ni volver a enviar la transaccion comercial. Guarda la venta confirmada y marca su impresion como pendiente para poder reimprimirla. El SDK del agente no sustituye la validacion del backend.

## 7. Errores y reimpresion

`HardwareAgentError` incluye `code` y, para respuestas HTTP, `status`. Codigos relevantes:

- `AGENT_UNREACHABLE`: el navegador no pudo conectar con el agente; comprueba que corre en la computadora de la caja y que escucha en el puerto configurado.
- `AGENT_TOKEN_REQUIRED`: falta `VITE_HARDWARE_AGENT_TOKEN` en la configuracion del frontend.
- `UNAUTHORIZED_AGENT`: el token del frontend no coincide con `HARDWARE_AGENT_TOKEN` del agente.
- `ORIGIN_NOT_ALLOWED`: el origen actual del POS no esta incluido en `HARDWARE_AGENT_ALLOWED_ORIGINS`.
- `PRINTER_UNAVAILABLE`: el agente recibio la instruccion pero no pudo imprimir.

Una respuesta HTTP satisfactoria contiene `printStatus` y `drawerStatus` por separado. Los valores actuales son `printed` o `unknown` para impresion, y `opened`, `skipped` o `failed` para cajon. No muestres el cajon como abierto cuando el estado sea `failed`.

Si una llamada falla por desconexion, puede ser incierto si el agente alcanzo a ejecutar la impresion antes de perderse la respuesta. No repitas automaticamente una venta como `SALE`: podria salir un ticket duplicado o abrirse otra vez el cajon. Permite reintento explicito como reimpresion:

```js
const result = await hardwareAgent.reprintSale(sale, { source: 'offline' });
```

`reprintSale` envia `type: 'REPRINT'` con `openDrawer: false`. Registra cada intento en el POS para que el operador pueda distinguir el ticket original de una reimpresion.

## 8. Sincronizacion cuando vuelve la red

Cuando el backend vuelva a estar disponible:

1. Selecciona ventas locales con `syncStatus: 'pending'`.
2. Envia la venta al endpoint de transacciones existente, manteniendo el ID local como referencia/idempotency key si el backend lo soporta.
3. Marca la sincronizacion como completada solo despues de una confirmacion del backend.
4. No vuelvas a imprimir automaticamente ventas que ya tengan `printStatus: 'printed'`.
5. Mantiene el estado de impresion separado del estado de sincronizacion: son resultados diferentes.

El backend actual de este workspace no define el contrato de sincronizacion offline ni confirma soporte de idempotencia. Verifica esos dos puntos en el repositorio backend antes de habilitar reintentos automaticos de sincronizacion.

## 9. Comprobar la conexion

```js
const status = await hardwareAgent.health();
if (status.status !== 'ok') {
  // Mostrar hardware degradado y permitir que el POS mantenga la venta pendiente.
}
```

`GET /health` informa impresoras y bascula, pero no valida que el cajon se haya abierto fisicamente. La respuesta de `printSale` es la fuente para conocer el resultado del ultimo trabajo. La prueba con transporte `mock` valida el contrato, no el hardware real.

## Checklist de puesta en marcha

- El agente arranca con un `HARDWARE_AGENT_TOKEN` configurado y escucha en `127.0.0.1:18181`.
- La lista de origenes permitidos incluye exactamente la URL del POS.
- El navegador y el agente estan en la misma computadora de caja.
- La venta y su ID estable se guardan localmente antes de imprimir.
- Venta, sincronizacion, impresion y cajon mantienen estados separados.
- Un reintento incierto usa `REPRINT` y no solicita abrir el cajon.
- Se probo el modelo y transporte de impresora reales; el modo `mock` no confirma impresion fisica.
- Se probo el cajon fisico por separado; `drawerStatus: 'opened'` confirma la respuesta del adaptador, no un sensor que detecte la apertura mecanica.
