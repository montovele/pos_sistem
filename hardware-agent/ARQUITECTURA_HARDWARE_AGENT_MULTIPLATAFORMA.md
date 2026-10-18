 # Arquitectura y funcionamiento del Hardware Agent

## Propósito

Este documento describe el módulo `hardware-agent` y sirve como especificación funcional para clonarlo como una aplicación instalable en Windows y Linux. Separa el comportamiento comprobado en el código actual de las piezas que todavía habría que implementar para producir y mantener instaladores multiplataforma.

El agente es un servicio local que recibe solicitudes del POS y opera el hardware conectado a la computadora de caja. No es el POS ni el backend comercial: no crea ventas, no valida pagos y no mantiene inventario.

## Resumen ejecutivo

El módulo actual es una aplicación Node.js con API HTTP Express. El proceso se inicia con `node server.js`, escucha por defecto en `127.0.0.1:18181` y expone operaciones para:

- Consultar salud del agente y disponibilidad de dispositivos.
- Listar la impresora seleccionada.
- Imprimir tickets ESC/POS y, según la solicitud, enviar el pulso de apertura del cajón.
- Abrir manualmente el cajón conectado a la impresora.
- Consultar y leer una báscula serie, y solicitar su tara.

La venta se confirma o se persiste en el POS antes de imprimir. La llamada al agente puede originarse desde el POS local incluso cuando no hay conexión con el backend, pero el agente no sincroniza ni almacena esa venta.

**Estado de distribución:** el repositorio contiene el servicio y sus dependencias de desarrollo, pero no define instaladores, empaquetado de aplicación, registro como servicio del sistema ni actualizaciones. El transporte de impresora USB con selección automática utiliza PowerShell y el spooler de Windows; no es una implementación Linux. Linux sí puede usar el transporte de impresora TCP y el puerto serie de la báscula, siempre que el dispositivo y el sistema estén configurados.

## Componentes actuales

```text
server.js
  └─ src/agent.js
       ├─ src/config.js          Configuración desde variables de entorno
       ├─ src/app.js             API HTTP, autenticación y control CORS
       ├─ src/printer.js         Gestión de impresora y pulso del cajón
       │    └─ src/escpos.js     Comandos ESC/POS y composición del ticket
       └─ src/scale.js           Gestión del puerto serie y lecturas de báscula

client/
  ├─ hardware-agent-client.js    Cliente HTTP reutilizable para el POS
  └─ print-job.js                Validación y normalización de instrucciones

tests/
  ├─ agent.test.js               API, autenticación y adaptadores simulados
  └─ client.test.js              Normalización e integración del cliente
```

### Arranque y ciclo de vida

1. `server.js` invoca `startAgent()` desde `src/agent.js`.
2. `src/config.js` carga `.env` con `dotenv` y determina host, puerto, token, origenes permitidos, transporte de impresora, márgenes y parámetros de báscula.
3. `startAgent()` no arranca si `HARDWARE_AGENT_TOKEN` está vacío.
4. `createAgent()` instancia `PrinterManager`, `ScaleManager` y la aplicación Express. Los adaptadores de impresora y báscula se pueden inyectar para pruebas.
5. El servidor HTTP escucha en el host y puerto configurados. Por defecto: `http://127.0.0.1:18181`.

El proceso escribe solicitudes, respuestas, fallos de autenticación y operaciones de impresión en la consola. Las pruebas usan adaptadores simulados y no operan dispositivos reales.

### API local

Todas las rutas, excepto `GET /health`, requieren el header `X-Agent-Token`. Si el token falta o no coincide, se devuelve HTTP `401` con `UNAUTHORIZED_AGENT`. Los orígenes web con header `Origin` se limitan a `HARDWARE_AGENT_ALLOWED_ORIGINS`; un origen no permitido recibe HTTP `403` con `ORIGIN_NOT_ALLOWED`. Las peticiones CORS `OPTIONS` permitidas reciben HTTP `204`.

| Método y ruta | Autenticación | Función |
|---|---|---|
| `GET /health` | No | Devuelve estado general, impresora, báscula y nombre de equipo. |
| `GET /printers` | Sí | Devuelve el estado de la impresora del adaptador activo. |
| `POST /print` | Sí | Imprime `ticket`; puede abrir el cajón según `openDrawer` o la forma de pago. |
| `POST /drawer/open` | Sí | Envía el pulso ESC/POS para el cajón. |
| `POST /test/print` | Sí | Envía un ticket de prueba. |
| `GET /scale/status` | Sí | Devuelve disponibilidad y configuración básica de la báscula. |
| `GET /scale/weight` | Sí | Lee varias muestras y devuelve un peso si son estables. |
| `POST /scale/tare` | Sí | Envía el comando de tara configurado. |

El JSON de impresión tiene la forma básica:

```json
{
  "saleId": "LOCAL-0042",
  "type": "SALE",
  "source": "offline",
  "openDrawer": false,
  "ticket": {
    "folio": "LOCAL-0042",
    "storeName": "Mi tienda",
    "paymentMethod": "cash",
    "items": [
      { "name": "Producto", "quantity": 2, "price": 10, "total": 20 }
    ],
    "total": 20
  }
}
```

`POST /print` exige `ticket`. Si `openDrawer` no está definido, la apertura se decide con `HARDWARE_OPEN_DRAWER_ON_CASH` y el método `cash` o `efectivo`. Impresión y pulso se inician concurrentemente. Un fallo de impresión devuelve HTTP `503` y `PRINTER_UNAVAILABLE`; si solo falla el cajón, la respuesta puede indicar que la impresión tuvo éxito y el cajón no. La respuesta satisfactoria no demuestra que el papel haya salido ni que el cajón se haya abierto físicamente; indica el resultado de envío reportado por el adaptador.

### Impresión y cajón

`src/escpos.js` genera bytes ESC/POS para inicializar la impresora, alinear y poner texto en negrita, avanzar papel, imprimir los datos de venta y cortar el papel. El contenido incluye tienda, folio, fecha, cliente, líneas, subtotal, impuestos, total, forma de pago, efectivo recibido/cambio cuando se proporcionan y pie de ticket. La anchura y márgenes son configurables. La conversión de texto actual usa ASCII; para nombres con caracteres fuera de ASCII puede ser necesario añadir codificación y selección de code page compatibles con cada impresora.

`PrinterManager` usa un adaptador:

| Transporte configurado | Implementación actual | Compatibilidad conocida |
|---|---|---|
| `mock` (predeterminado) | Simula estado, impresión y pulso. | Desarrollo y pruebas; no imprime. |
| `network` | Envía bytes a un host y puerto TCP (predeterminado `9100`), con timeout de cinco segundos. | Windows y Linux si la impresora acepta ESC/POS por red. |
| `auto` o `usb` | En Windows busca una cola mediante `Get-Printer`/CIM y envía datos RAW al spooler. En Linux usa una cola CUPS y envía ESC/POS con `lp -o raw`. | Windows y Linux; la cola y el filtro/driver compatibles deben estar instalados en el sistema. |

En el adaptador Windows, se intenta el nombre exacto configurado; en modo automático se prioriza un nombre/controlador/puerto que parezca térmico, después la impresora predeterminada y, finalmente, la primera cola. En Linux, el transporte `auto`/`cups`/`usb` consulta `lpstat`; respeta el nombre exacto solicitado o elige la cola predeterminada y, si no hay una, la primera cola publicada. El servicio instalado se ejecuta con permisos de acceso a `lp` y `dialout`. CUPS debe tener una cola que admita RAW ESC/POS; el agente no instala el servidor de impresión ni drivers del fabricante.

El cajón se conecta al puerto RJ11/DK de la impresora. El agente envía el comando ESC/POS `ESC p 0 25 250` a esa misma impresora; no controla un puerto de cajón independiente.

### Báscula

`src/scale.js` implementa un adaptador serie con `serialport` y parser por salto de línea. Admite configuración de puerto, velocidad, bits, paridad, unidad, timeout, número de lecturas estables y tolerancia en gramos. Los ejemplos usuales de puerto son `COM3` en Windows y `/dev/ttyUSB0` en Linux, sujetos a permisos y drivers.

La lectura limpia caracteres de control, interpreta un número y unidad opcional (`kg` o gramos), limita el peso máximo y convierte el resultado a gramos y kilogramos. Para declarar una lectura estable compara cada muestra configurada con la primera, usando la tolerancia. Los fallos representativos son `SCALE_NOT_CONNECTED`, `SCALE_UNSTABLE` y `SCALE_INVALID_READING`. El comando de tara predeterminado es `T\r\n`, pero puede depender del fabricante de la báscula.

Con `SCALE_ENABLED=false` (predeterminado), la báscula se informa deshabilitada y las operaciones de lectura/tara fallan como no conectada. Una lectura estable depende del protocolo de salida de la báscula; no se implementa aquí un protocolo específico por marca/modelo.

### Cliente para el POS y flujo de negocio

`client/print-job.js` normaliza formatos habituales de venta, requiere identificador estable y una lista no vacía de artículos, y valida cantidades y precios no negativos. Acepta `SALE` y `REPRINT`, y los orígenes `online` y `offline`. Para reimpresiones siempre deshabilita la apertura del cajón.

`client/hardware-agent-client.js` envía las peticiones al agente con `X-Agent-Token`, traduce errores HTTP/red a `HardwareAgentError` y devuelve estados separados de impresión y cajón. El POS debe:

1. Confirmar la venta en el backend o persistirla localmente antes de imprimir.
2. Conservar el identificador estable de la venta y el resultado de impresión/cajón.
3. Tratar la impresión como operación independiente: un error de hardware no debe anular una venta confirmada.
4. Reimprimir con `REPRINT` si corresponde, sin volver a abrir el cajón automáticamente.

El token usado en frontend web puede quedar visible en el bundle y no debe considerarse secreto de backend. La configuración actual protege rutas con un token compartido y restringe orígenes de navegador, pero CORS no sustituye autenticación fuerte ni evita clientes no navegador.

## Configuración actual

Variables reconocidas en `src/config.js`:

| Variable | Valor predeterminado | Uso |
|---|---|---|
| `HARDWARE_AGENT_HOST` | `127.0.0.1` | Interfaz de red de escucha. |
| `HARDWARE_AGENT_PORT` / `PORT` | `18181` | Puerto HTTP. |
| `HARDWARE_AGENT_TOKEN` | Vacío (impide iniciar) | Token obligatorio para las rutas protegidas. |
| `HARDWARE_AGENT_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Lista separada por comas de orígenes web permitidos. |
| `HARDWARE_PRINTER_TRANSPORT` | `mock` | `mock`, `network`, `auto` o `usb`. |
| `HARDWARE_PRINTER_NAME` | `POS-80` | Nombre de impresora; `AUTO` permite selección automática en Windows. |
| `HARDWARE_PRINTER_HOST` / `HARDWARE_PRINTER_PORT` | `127.0.0.1` / `9100` | Destino TCP para impresora de red. |
| `HARDWARE_PAPER_COLUMNS` | `42` | Columnas de impresión. |
| `HARDWARE_PAPER_TOP_MARGIN` / `HARDWARE_PAPER_BOTTOM_MARGIN` | `3` / `6` | Avances antes y después del contenido. |
| `HARDWARE_OPEN_DRAWER_ON_CASH` | `true` | Apertura automática en pagos en efectivo si no se indica `openDrawer`. |
| `SCALE_ENABLED` | `false` | Habilita la báscula serie. |
| `SCALE_PORT` | Vacío | Puerto del dispositivo. |
| `SCALE_BAUD_RATE` / `SCALE_DATA_BITS` / `SCALE_STOP_BITS` / `SCALE_PARITY` | `9600` / `8` / `1` / `none` | Parámetros serie. |
| `SCALE_UNIT` | `kg` | Unidad asumida si la trama no declara unidad. |
| `SCALE_READ_TIMEOUT_MS` / `SCALE_STABLE_READS` | `2500` / `2` | Timeout por muestra y número de muestras. |
| `SCALE_STABILITY_TOLERANCE_GRAMS` / `SCALE_MAX_WEIGHT_KG` | `1` / `300` | Tolerancia y límite de lectura. |
| `SCALE_TARE_COMMAND` | `T\r\n` | Comando enviado para tara. |

La configuración se carga con `dotenv`. El `.env` contiene credenciales y valores por máquina: no debe incluirse en el instalador ni en el repositorio. El proyecto de instalación genera una plantilla `.env` sin secretos y crea un token aleatorio durante la instalación en cada equipo.

## Arquitectura objetivo para una aplicación instalable Windows/Linux

### Principios

1. Mantener un **agente local por equipo/caja**. El dispositivo puede comunicarse por `127.0.0.1`; el backend central no puede acceder al USB/COM del cliente.
2. Separar negocio de hardware. El POS sigue siendo responsable de venta, autorización, persistencia y sincronización.
3. Mantener una API local estable y adaptadores reemplazables para impresora y báscula.
4. Usar adaptadores nativos por plataforma, ocultos detrás de contratos comunes; no fingir que `usb` o `auto` tienen soporte idéntico en todos los sistemas.
5. Mantener compatibilidad de configuración de hardware y una migración explícita de configuración al actualizar.

### Capas recomendadas

```text
POS local
  └─ Cliente HTTP / API local
       └─ Servicio Hardware Agent
            ├─ Configuración, autenticación, logs y diagnóstico
            ├─ Impresión
            │    ├─ ESC/POS renderer común
            │    ├─ Windows: spooler RAW (adaptador existente)
            │    ├─ Linux: CUPS/lp para cola configurada (implementado)
            │    └─ Impresora de red: TCP (adaptador existente)
            ├─ Cajón: pulso enviado por la impresora
            └─ Báscula: puerto serie USB/RS-232 (adaptador existente)
```

La API y la lógica de normalización pueden conservarse. La capa de instalación administra el ejecutable/runtime, configuración por máquina, permisos, inicio automático, logs y desinstalación, sin mezclar esos asuntos con las rutas HTTP.

### Compatibilidad y trabajo faltante

| Área | Reutilizable del módulo | Trabajo para clon instalable |
|---|---|---|
| API y cliente POS | Rutas Express y cliente `client/`. | Definir política de versión/API, diagnóstico y proceso robusto de apagado/errores. |
| Windows | Spooler RAW y búsqueda de colas ya existen. | Empaquetar runtime y dependencia nativa de `serialport`, instalador/actualizador, configuración protegida e instalación del servicio. |
| Linux | Adaptador CUPS/lp para colas configuradas, impresora TCP y puerto serie. | Validar modelos de impresora y colas RAW en las distribuciones objetivo; instalador inicial `.deb` para amd64 en Debian 12/Ubuntu 24.04 o posterior. |
| Impresoras | Renderer ESC/POS y envío TCP. | Probar modelos reales, codificaciones/code pages, corte y comandos específicos; documentar protocolos soportados. |
| Básculas | Lectura serie, normalización, estabilidad y tara configurable. | Certificar modelos/protocolos, nombres de dispositivos y permisos en cada distribución. |
| Empaquetado | Instalador Windows x64 con Node incluido; paquete Debian amd64 con Node incluido y servicio `systemd`. | Firma del `.exe`, validación de instalación/desinstalación en equipos limpios, `.rpm` y otras arquitecturas si se requieren. |
| Configuración | Variables de entorno existentes. | Proveer `.env.example` sin secretos, asistente o herramienta de configuración local y ubicación persistente adecuada en cada OS. |

No se debe decidir el formato final de distribución solo por el hecho de que Node.js sea multiplataforma: `serialport` incorpora bindings nativos y el acceso a impresoras/puertos es dependiente del sistema operativo. Deben fijarse primero las versiones de Windows/Linux, arquitecturas CPU y modelos de impresora/báscula soportados; después generar y probar artefactos por plataforma. Un empaquetador de Node puede ser opción, pero debe demostrarse con los módulos nativos y el driver antes de adoptarlo.

### Instalación y operación objetivo

Una instalación final debería:

- Instalar el agente y sus dependencias nativas por plataforma.
- Crear configuración inicial con token aleatorio por equipo, host loopback y puerto configurable.
- Ejecutar el agente al inicio del sistema bajo una cuenta con los permisos mínimos necesarios.
- En Windows, usar el spooler y una cola previamente instalada; el acceso a COM depende del usuario del servicio.
- En Linux, instalar una unidad `systemd` y dar acceso explícito al usuario del servicio a la cola CUPS y al grupo/ACL del puerto serie, cuando aplique.
- Ofrecer un comando o UI para probar conectividad, imprimir ticket de prueba, listar estado de dispositivos y leer báscula.
- Mantener logs rotados y no registrar secretos. Limitar o redactar datos personales y contenido completo de tickets en logs de producción.
- Actualizar sin borrar configuración; desinstalar sin eliminar datos/configuración de caja salvo opción explícita.

Para un primer clon, la alternativa más sencilla es conservar un proceso de servicio Node sin interfaz gráfica y distribuir un instalador específico por sistema operativo. Una UI de escritorio/tray es opcional y puede añadirse como capa separada, no como requisito de la API de hardware.

## Seguridad y operación

- Mantener `HARDWARE_AGENT_HOST=127.0.0.1` por defecto; no exponer el servicio a la LAN sin un diseño de autenticación y red revisado.
- Generar un token distinto por caja, no reutilizar credenciales del backend y evitar incluir el token de servicio dentro de un bundle público del POS.
- `GET /health` no requiere token. Si el servicio se expone fuera de loopback, valorar restringir también esta ruta y evitar incluir información de dispositivos innecesaria.
- Validar la configuración y los límites de datos al arrancar (puerto, números, orígenes, transporte), y usar límites apropiados en producción. Express limita el JSON a `256kb`.
- CORS restringe navegadores; no es un control de acceso para clientes HTTP arbitrarios.
- La afirmación `ready` solo refleja el adaptador y su comprobación. En el transporte de red el estado consulta el host/puerto; para Windows consulta cola/estado del spooler. No hay confirmación física de salida del papel o apertura real del cajón.
- La selección automática puede elegir una cola inesperada si no hay coincidencia térmica. En instalaciones productivas es preferible fijar el nombre de cola y validar impresión/cajón con equipo real.
- Evitar datos sensibles en logs de producción. El código actual registra estructura y contenido imprimible del ticket; la distribución clonada debe reducir o desactivar ese detalle, con configuración segura por defecto.

## Pruebas y criterios para el clon

Las pruebas existentes se ejecutan con `npm test` y usan `node:test`. Cubren salud y lista, autenticación, CORS, impresión/cajón simulado, venta offline, reimpresión y lecturas de báscula simuladas. No validan impresoras, básculas, permisos del SO, instaladores ni persistencia del servicio.

Antes de declarar listo un clon instalable, verificar al menos:

1. Instalación limpia y desinstalación en cada versión de Windows/Linux objetivo.
2. Arranque automático, reinicio, actualización y recuperación ante fallo del proceso.
3. Impresión ESC/POS real, corte y cajón con cada familia de impresoras soportada.
4. Conexión/desconexión, lectura estable/inestable y tara de cada báscula declarada compatible.
5. API con token correcto/incorrecto, origen permitido/bloqueado, dispositivo ausente y timeout.
6. Ventas `SALE` y reimpresiones `REPRINT`, verificando que una reimpresión nunca vuelve a abrir el cajón.
7. Privacidad de logs, almacenamiento del token y aislamiento del agente a loopback.

## Referencias del módulo

- `server.js`
- `src/agent.js`
- `src/app.js`
- `src/config.js`
- `src/printer.js`
- `src/escpos.js`
- `src/scale.js`
- `client/hardware-agent-client.js`
- `client/print-job.js`
- `tests/agent.test.js`
- `tests/client.test.js`
- `README.md`
- `ANALISIS_FUNCIONAMIENTO_ACTUAL_HARDWARE_AGENT.md`
- `ANALISIS_INTEGRACION_BACKEND_AGENTE_IMPRESION_CAJA.md`
- `DOCUMENTACION_ACTUALIZACION_HARDWARE_AGENT_BASCULA.md`
- `GUIA_INTEGRACION_FRONTEND_MODO_OFFLINE.md`
