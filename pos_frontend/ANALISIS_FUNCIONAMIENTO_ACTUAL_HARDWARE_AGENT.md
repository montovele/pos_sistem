# Análisis del funcionamiento actual del sistema

## 1. Resumen ejecutivo

El proyecto es un agente local de hardware para una caja POS. Su función principal es actuar como una capa de integración entre el frontend de la caja y los dispositivos físicos conectados a la computadora: impresora térmica, cajón de dinero y báscula.

La arquitectura actual está construida como un servicio Express que corre en el equipo local y expone una API HTTP protegida por un token compartido. No almacena ventas ni hace lógica de negocio; solo procesa solicitudes del frontend para imprimir tickets, abrir el cajón y leer el peso de una báscula.

El sistema está diseñado para ser independiente del backend central. En otras palabras, la venta debe confirmarse antes en el sistema principal y, luego, el agente local ejecuta solo la parte física.

---

## 2. Arquitectura general

El flujo de inicio se concentra en estos archivos:

- `server.js`: punto de entrada del proceso.
- `src/agent.js`: crea la aplicación y los managers.
- `src/app.js`: define la API HTTP con autenticación, CORS y endpoints.
- `src/printer.js`: encapsula la lógica de impresión y apertura del cajón.
- `src/scale.js`: encapsula la lógica de lectura y tara de la báscula.
- `src/config.js`: centraliza la configuración desde variables de entorno.

El patrón general es:

1. Carga la configuración de entorno.
2. Instancia un `PrinterManager` y un `ScaleManager`.
3. Crea una aplicación Express.
4. Escucha en `127.0.0.1:18181` por defecto.
5. Recibe peticiones protegidas por `X-Agent-Token`.
6. Ejecuta acciones sobre hardware local según la solicitud.

---

## 3. Arranque y configuración

El arranque se realiza desde `server.js`:

```js
import { startAgent } from './src/agent.js';
startAgent();
```

Luego, en `src/agent.js`, la función `startAgent()` hace esto:

- crea un `PrinterManager` con la configuración actual,
- crea un `ScaleManager`,
- llama a `createAgentApp()`,
- levanta un servidor HTTP con `createServer(app)`,
- escucha en `host` y `port` configurados.

La configuración se lee desde `src/config.js` y utiliza `dotenv`. Los valores clave son:

- `host`: por defecto `127.0.0.1`
- `port`: por defecto `18181`
- `token`: `HARDWARE_AGENT_TOKEN`
- `allowedOrigins`: orígenes permitidos para CORS
- `printerTransport`: `mock`, `network`, `auto` o `usb`
- `scaleEnabled`: habilita o deshabilita la bascula
- `scalePort`, `SCALE_BAUD_RATE`, `SCALE_DATA_BITS`, etc.

Esto hace que el sistema sea muy configurable según la máquina cliente, sin requerir cambios de código.

---

## 4. Seguridad y validación de origen

En `src/app.js` hay dos capas de protección:

### 4.1 Autenticación por token

La función `auth(token)` valida que todas las rutas, excepto `/health`, traigan el header:

```http
X-Agent-Token: <token>
```

Si falta o es incorrecto, responde con:

```json
{ "success": false, "error": "UNAUTHORIZED_AGENT" }
```

Con código HTTP `401`.

### 4.2 CORS y validación de origen

La función `originGuard(allowedOrigins)` bloquea peticiones con `Origin` ajeno a la lista configurada. Si el `Origin` no está permitido, responde `403` con:

```json
{ "success": false, "error": "ORIGIN_NOT_ALLOWED" }
```

Además, configura:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Headers: Content-Type, X-Agent-Token`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`

Esto deja el agente preparado para funcionar en un entorno local con un frontend en un puerto distinto, siempre que ese origen esté explícitamente autorizado.

---

## 5. Endpoints principales y su comportamiento

La API expone varios endpoints, y el comportamiento actual es el siguiente:

### 5.1 `GET /health`

No requiere token. Consulta:

- listado de impresoras via `printerManager.list()`
- estado de la báscula via `scaleManager.status()`

Construye un resumen:

```json
{
  "success": true,
  "status": "ok" | "degraded",
  "agent": "1.0.0",
  "computer": "...",
  "printers": [...],
  "data": {
    "printer": true,
    "drawer": true,
    "scale": true
  },
  "scale": {...}
}
```

Es un punto importante para monitoreo local, porque comunica si la impresora y la báscula están disponibles antes de intentos de venta.

### 5.2 `GET /printers`

Devuelve la lista de impresoras disponibles según el adaptador activo.

### 5.3 `POST /print`

Este es el endpoint más central del sistema.

Valida que el cuerpo tenga un `ticket`:

```js
if (!req.body?.ticket) ...
```

Luego determina si debe abrir cajón según:

- `openDrawer` explícito en el body, o
- `config.openDrawerOnCash` y el método de pago detectado como `cash` o `efectivo`.

Se ejecutan dos operaciones de forma concurrente:

```js
const printPromise = printerManager.printTicket(...)
const drawerPromise = shouldOpenDrawer ? printerManager.openDrawer() : Promise.resolve(null)
```

Y se resuelven con `Promise.allSettled` para que una falla no impida evaluar la otra.

Si la impresión falla, responde con `503` y `PRINTER_UNAVAILABLE`.

### 5.4 `POST /drawer/open`

Abre el cajón con el adaptador actual de impresora. Es un endpoint independiente y útil para pruebas o uso manual.

### 5.5 `POST /test/print`

Genera un ticket de prueba con datos mínimos para validar la impresora sin depender de una venta real.

### 5.6 `GET /scale/status`

Devuelve si la báscula está conectada y en qué puerto.

### 5.7 `GET /scale/weight`

Lee peso repetidamente hasta cumplir la estabilidad configurada. Si la báscula está desconectada devuelve `SCALE_NOT_CONNECTED`; si no es estable devuelve `SCALE_UNSTABLE`.

### 5.8 `POST /scale/tare`

Ejecuta el comando de tara configurado en el puerto del dispositivo.

---

## 6. Funcionamiento de la impresora

La lógica de impresión está encapsulada en `src/printer.js` y utiliza un patrón de adaptadores.

### 6.1 Adapters disponibles

#### MockPrinterAdapter

Se usa en pruebas o cuando no hay hardware real. Simula una impresión exitosa y devuelve un estado `ready`.

#### NetworkPrinterAdapter

Se usa cuando `printerTransport === 'network'`.

- crea un socket TCP hacia `host` y `port`
- envía el buffer ESC/POS
- para abrir cajón, envía un pulso con `escpos.drawerPulse()`
- valida la conexión enviando un socket de longitud cero

Es útil para impresoras que en red expongan puerto TCP 9100.

#### WindowsPrinterAdapter

Se usa cuando `printerTransport` es `auto` o `usb`.

- consulta la lista de impresoras instaladas con PowerShell
- intenta detectar una impresora térmica por nombre, driver o puerto
- si no encuentra una, usa la predeterminada
- imprime enviando RAW con `WritePrinter` a la cola de Windows

Es una solución práctica para entornos Windows, donde muchas copias de impresoras térmicas se manejan como cola de impresión local.

### 6.2 Generación del ticket

Antes de imprimir, `PrinterManager.printTicket()` hace esto:

```js
const buffer = buildTicket(ticket, this.config.paperColumns, {
  top: this.config.paperTopMargin,
  bottom: this.config.paperBottomMargin
});
```

Esto genera un buffer en formato ESC/POS usando la utilidad `buildTicket` y `escpos` importada desde `escpos.js`.

El sistema:

- normaliza la estructura del ticket,
- formatea articulos,
- inserta margenes superiores e inferiores,
- genera bytes imprimibles,
- envia el contenido al adaptador.

La intención es dejar la impresión en formato compatible con térmicas de recibos, sin depender del backend central.

### 6.3 Apertura del cajón

Cuando el pago es en efectivo, el flujo actual intenta abrir el cajón junto con la impresión. Esto ocurre en `/print` cuando `paymentMethod` es `cash` o `efectivo` y `config.openDrawerOnCash` está activado.

La lógica del sistema determina la apertura del cajón usando:

```js
const shouldOpenDrawer = req.body.openDrawer ?? (config.openDrawerOnCash && ['cash', 'efectivo'].includes(paymentMethod));
```

Es decir, existe un override explícito que puede desactivar o forzar la apertura del cajón por solicitud.

---

## 7. Funcionamiento de la báscula

La bascula está encapsulada en `src/scale.js`.

### 7.1 Modo de operación

El sistema soporta dos adaptadores:

- `SerialScaleAdapter`: lee directamente del puerto serial (COM o `/dev/ttyUSB*`)
- `MockScaleAdapter`: simula lecturas para pruebas

La clase `ScaleManager` solo habilita la lógica si `config.scaleEnabled` es `true`.

### 7.2 Lectura de serial

`SerialScaleAdapter.open()` abre el puerto configurado con parámetros como:

- `baudRate`
- `dataBits`
- `stopBits`
- `parity`
- `path`

Luego se conecta con `ReadlineParser` para recibir líneas del puerto serial. La lectura usa un timeout configurado por `scaleReadTimeoutMs`.

### 7.3 Normalización de lectura

La función `normalizeReading()` toma una línea cruda, elimina caracteres de control, intenta detectar un número y una unidad, por ejemplo:

- `0.250kg`
- `250g`
- `ST,GS,0.250kg`

Convertir a un formato interno común:

```js
{
  weightGrams: 250,
  weightKg: 0.25,
  unit: 'KG',
  stable: false,
  raw: 'ST,GS,0.250kg'
}
```

Si la línea no contiene un valor válido, lanza `SCALE_INVALID_READING`.

### 7.4 Estabilidad

La lógica de estabilidad se implementa con `scaleStableReads` y `scaleStabilityToleranceGrams`:

```js
for (let index = 0; index < this.config.scaleStableReads; index += 1) {
  readings.push(await this.readSample());
}
const first = readings[0];
const stable = readings.every((reading) => Math.abs(reading.weightGrams - first.weightGrams) <= this.config.scaleStabilityToleranceGrams);
```

Si las lecturas cambian más que la tolerancia, devuelve `SCALE_UNSTABLE`.

Esto evita aceptar una lectura fluctuante como peso final válido para venta o cierre.

### 7.5 Tara

La función `tare()` abre el puerto, escribe el comando configurado en `SCALE_TARE_COMMAND`, y devuelve:

```json
{ "tareApplied": true }
```

Es un mecanismo básico y útil, pero depende enteramente de que la báscula acepte ese comando concreto.

---

## 8. Manejo de errores

El sistema tiene un manejo explícito de errores por tipo de dispositivo.

### 8.1 Errores de autenticación

- `401 UNAUTHORIZED_AGENT`

### 8.2 Errores de origen

- `403 ORIGIN_NOT_ALLOWED`

### 8.3 Errores de impresora

- `503 PRINTER_UNAVAILABLE`

### 8.4 Errores de báscula

- `503 SCALE_NOT_CONNECTED` cuando no hay conexión
- `422 SCALE_UNSTABLE` cuando la lectura no es estable
- `SCALE_TARE_FAILED` cuando falla la tara

Este enfoque permite que el frontend tome decisiones claras según la causa del problema.

---

## 9. Puntos fuertes del sistema actual

1. Separación clara de responsabilidades.
   - `app.js` se encarga de HTTP.
   - `printer.js` maneja la impresión.
   - `scale.js` maneja la báscula.
   - `config.js` centraliza el entorno.

2. Soporte real para múltiples tipos de impresora.
   - mock
   - red
   - Windows + spooler

3. Validación de estabilidad en báscula.
   - evita aceptar pesos inestables.

4. Seguridad local por token.
   - obliga a que el frontend tenga una credencial compartida.

5. Diagnóstico sencillo con `GET /health`.
   - ideal para verificar la caja antes de comenzar el día.

6. Pruebas automatizadas.
   - `tests/agent.test.js` valida salud, impresión, rechazo por token, bascula estable y bascula inestable.

---

## 10. Limitaciones y riesgos actuales

1. La capa de hardware no es totalmente tolerante a fallos.
   - si un puerto serial falla, el sistema responde con error, pero no reintenta con parámetros alternativos ni hace reconexión inteligente.

2. La apertura del cajón está acoplada a la impresión por defecto para pagos en efectivo.
   - esto es útil, pero no se controla completamente si el dispositivo de cajón no está físicamente conectado o no responde.

3. La detección de método de pago es frágil.
   - solo se verifica si el texto se convierte a minúsculas y coincide con `cash` o `efectivo`.
   - el sistema no normaliza múltiples variantes de nombres de métodos de pago ni errores de mayúsculas o espacios.

4. El manejo de CORS es mínimo.
   - solo acepta orígenes explícitos y no tiene un mecanismo más robusto para ambientes multi-frontend.

5. La lógica de escala está diseñada para un modelo definido por línea de texto.
   - si la báscula usa una sintaxis distinta, `normalizeReading()` podría rechazarla con `SCALE_INVALID_READING`.

6. El agente no gestiona ventas ni auditoría.
   - esto es intencional, pero también implica que el responsable de validación de venta queda en la capa superior.

7. `health` usa una evaluación sencilla de estado.
   - solo considera si el estatus de la impresora es `ready` o `mock` y si la báscula está conectada.
   - no reporta detalles más profundos de la salud del puerto ni del adaptador real.

---

## 11. Conclusión

El sistema actual funciona como un agente local de hardware bien estructurado: integra impresora, cajón y báscula con una capa HTTP segura, sin depender del backend central para tocar dispositivos físicos locales.

Su punto más fuerte es la separación clara entre capa de red, adaptadores de hardware y validación de sensores. Además, la lógica de estabilidad en báscula y el manejo de errores aportan robustez para un entorno de caja real.

Su principal responsabilidad operacional es actuar como un puente confiable entre la lógica de venta y los periféricos del cliente. En términos prácticos, el frontend debe confirmar la venta en el backend y luego invocar a este agente para ejecutar la parte física: imprimir ticket, abrir cajón y leer el peso cuando aplica.

El diseño actual es funcional y adecuado para un entorno local, pero aún tiene margen de mejora en tolerancia a fallos, normalización de datos de pago y soporte más amplio a variantes de hardware.

---

## 12. Integración con ventas offline

El agente local no necesita internet para operar. El frontend puede enviar directamente al agente:

- `GET /scale/weight` para obtener una lectura estable de la báscula.
- `POST /print` para imprimir un ticket de venta offline.
- `openDrawer: true` en la misma solicitud de impresión cuando el pago es en efectivo.

El frontend guarda la venta completa en IndexedDB antes de llamar al hardware. Si la impresión falla,
la venta permanece pendiente y puede reintentarse; si la impresión es exitosa, el ticket conserva un
folio local mientras espera la confirmación del backend central.

Cuando vuelve internet, la venta se envía a `POST /api/transactions/sync` con `deviceId` y
`clientTransactionId`. El backend debe hacer la operación idempotente para no duplicar la venta si
la respuesta original se pierde o el navegador reintenta.

Por lo tanto, el agente sí permite continuar la operación física offline, pero no confirma por sí
mismo inventario, caja, contabilidad ni validez fiscal. Esas responsabilidades permanecen en el
backend y deben reflejarse visualmente como "pendiente de sincronización" hasta recibir respuesta.
