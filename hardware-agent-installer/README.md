# SSAXXON POS Hardware Agent portable

Este proyecto genera un instalador ejecutable Windows y paquetes portables del agente para Windows x64 y Linux x64. `dist\SSAXXON-POS-Hardware-Agent-Setup.exe` abre un asistente de instalacion, permite elegir carpeta y accesos directos, instala el runtime y el agente, y registra la desinstalacion en Windows. El equipo cliente no necesita instalar Node.js. Ademas se conserva el directorio portable `dist\windows-x64` y el paquete Linux. No es una extension del editor Atom.

## Que hace el agente

El agente es un servicio Express local que escucha por defecto en `127.0.0.1:18181`. El frontend lo utiliza para imprimir tickets ESC/POS, accionar el cajon conectado a la impresora y, opcionalmente, leer una bascula USB/serial. No guarda ni sincroniza ventas. Las rutas operativas requieren `X-Agent-Token`; `/health` es publica.

El generador toma el token de `VITE_HARDWARE_AGENT_TOKEN` en `pos_frontend/.env` y valida que coincida con el frontend compilado. Lo escribe en la configuracion predeterminada del agente, asi que no es necesario abrir un editor ni copiar el token a mano. El agente arranca en `127.0.0.1` y el transporte de impresora se configura como `auto`:

- Windows: `HARDWARE_PRINTER_TRANSPORT=auto` usa una impresora instalada en Windows.
- Linux: `HARDWARE_PRINTER_TRANSPORT=auto` usa la cola CUPS predeterminada; CUPS debe estar configurado para datos ESC/POS RAW.
- Red: usa `HARDWARE_PRINTER_TRANSPORT=network` y asigna `HARDWARE_PRINTER_HOST` y `HARDWARE_PRINTER_PORT`.
- Bascula: establece `SCALE_ENABLED=true` y configura `SCALE_PORT` (por ejemplo, `COM3` en Windows o `/dev/ttyUSB0` en Linux).

La impresora y el agente quedan listos al iniciar; Linux requiere que la cola CUPS ya este configurada. La bascula permanece desactivada por defecto porque el puerto serial depende del equipo: para habilitarla se necesita `SCALE_ENABLED` y `SCALE_PORT`. El frontend lleva su token dentro del bundle, por lo que ese token no es un secreto frente a quien pueda inspeccionar el navegador. Usa un token distinto por despliegue y manten el agente en loopback; no lo expongas a la red.

## Generacion de paquetes

Requisitos para compilar:

- Node.js 20 o superior y npm.
- Conexion a internet para instalar dependencias y descargar el runtime oficial de Node.js.
- La herramienta `tar` disponible en el PATH (incluida habitualmente en Windows 10/11 y Linux).
- Para generar Windows: Windows x64 con el compilador `csc.exe` de .NET Framework.
- `pos_frontend/.env` con `VITE_HARDWARE_AGENT_TOKEN` y un frontend compilado en `pos_frontend/dist` que ya incluya ese mismo token.
- Windows x64 o Linux x64. La generacion de Linux desde Windows es posible porque `serialport` incluye el binario Linux x64 precompilado; aun asi, valida el paquete Linux en una maquina Linux antes de distribuirlo.

Desde esta carpeta, ejecuta:

```powershell
npm.cmd run build
```

Se genera `dist\SSAXXON-POS-Hardware-Agent-Setup.exe` para instalar Windows y los paquetes portables bajo `dist\windows-x64` y `dist\linux-x64`, junto a los archivos `.tar.gz` correspondientes. El instalador Windows se compila con `csc.exe` de .NET Framework. Tambien puedes generar un solo destino:

```powershell
npm.cmd run build:windows
npm.cmd run build:linux
```

En Linux usa `npm run build`, `npm run build:windows` o `npm run build:linux`. En Windows, los archivos `.tar.gz` se extraen con `tar -xzf <archivo>`.

El generador instala las dependencias usando el lockfile del agente fuente, comprueba el SHA-256 de los archivos oficiales de Node.js y empaqueta solo los archivos de ejecucion. Genera la configuracion lista para usar con el token del frontend y la impresora en modo automatico. Cada destino usa el runtime con la misma version que Node.js que ejecuta el generador. Los artefactos existentes para los destinos solicitados se reemplazan al reconstruirlos.

## Uso en la caja

1. En Windows, ejecuta `SSAXXON-POS-Hardware-Agent-Setup.exe`, elige una carpeta y completa el asistente; el agente inicia al terminar y queda un acceso directo. Para desinstalar, usa la entrada del agente en **Aplicaciones instaladas** de Windows; se puede conservar el `.env`.
2. Para el paquete portable de Windows, extrae la carpeta completa y ejecuta `HardwareAgent.exe`. En Linux, ejecuta `sh ./launch.sh`. Ambos crean `.env` automaticamente desde los valores listos del paquete y arrancan el agente sin pedir datos ni abrir el editor.
3. La impresora instalada de Windows se detecta automaticamente. En Linux, configura previamente una cola CUPS; para una impresora TCP, asigna el transporte y la direccion en `.env`. Para usar una bascula, asigna su puerto serial a `SCALE_PORT` y habilita `SCALE_ENABLED=true`.
4. En Linux, agrega el usuario del servicio al grupo con permisos del puerto serial y de CUPS segun corresponda.
5. Comprueba `http://127.0.0.1:18181/health`. El frontend compilado debe ser el mismo que se valido al generar el paquete.

El runtime Linux oficial requiere una distribucion compatible con la version de glibc de Node.js. Los paquetes generados no estan firmados; distribuyelos solo por un canal controlado y valida el hardware real en cada sistema objetivo. Las pruebas automatizadas del proyecto usan adaptadores simulados y no accionan dispositivos.
