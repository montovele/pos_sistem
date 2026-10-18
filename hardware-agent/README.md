# SSAXXON POS Hardware Agent

Agente local independiente para imprimir tickets ESC/POS y abrir el cajon conectado a la impresora. Este proyecto no depende de `pos_backend`.

## Instalacion en la computadora del cliente

Requisitos: Node.js 18 o superior.

```powershell
cd C:\Users\Anderson\Documents\hardware-agent
npm.cmd install
Copy-Item .env.example .env
```

Edita `.env` y define un token compartido con el frontend:

```env
HARDWARE_AGENT_TOKEN=cambia-este-token-local
HARDWARE_PRINTER_TRANSPORT=mock
```

## Iniciar

```powershell
npm.cmd start
```

Para desarrollo:

```powershell
npm.cmd run dev
```

El agente escucha en:

```text
http://127.0.0.1:18181
```

El agente no inicia si `HARDWARE_AGENT_TOKEN` esta vacio. Define un token distinto por caja y configura en el agente los origenes web permitidos mediante `HARDWARE_AGENT_ALLOWED_ORIGINS`.

Verificar conectividad:

```powershell
Invoke-RestMethod http://127.0.0.1:18181/health
```

## Impresora de red

Para una impresora ESC/POS accesible por TCP:

```env
HARDWARE_PRINTER_TRANSPORT=network
HARDWARE_PRINTER_HOST=192.168.1.50
HARDWARE_PRINTER_PORT=9100
```

## Impresora local en Linux (CUPS)

En Linux el transporte `auto`, `cups` o `usb` usa la cola CUPS configurada. Instala una cola para la impresora térmica con soporte de datos RAW ESC/POS y, preferiblemente, selecciónala como cola predeterminada:

```env
HARDWARE_PRINTER_TRANSPORT=auto
HARDWARE_PRINTER_NAME=AUTO
```

También puedes fijar el nombre exacto de la cola en `HARDWARE_PRINTER_NAME`. El usuario que ejecuta el agente necesita acceso al socket CUPS (normalmente grupo `lp`). El agente invoca `lpstat` para estado y `lp -o raw` para enviar los bytes ESC/POS; la instalación de CUPS, la cola y el driver/filtro del fabricante corresponde al sistema operativo.

## Impresora termica por USB en Windows

Para cualquier impresora termica instalada con su controlador de Windows, el agente localiza automaticamente la cola y el puerto USB (`USB001`, `USB002`, etc.) y envia ESC/POS RAW al spooler:

```env
HARDWARE_PRINTER_TRANSPORT=auto
HARDWARE_PRINTER_NAME=AUTO
```

Puedes poner el nombre exacto de la cola en `HARDWARE_PRINTER_NAME`; con `AUTO`, se priorizan impresoras cuyo nombre, controlador o puerto indique que son termicas y despues la impresora predeterminada de Windows. La impresora debe aparecer en **Configuracion de Windows > Bluetooth y dispositivos > Impresoras y escaneres**. El pulso del cajon se envia a la misma impresora y se inicia en paralelo con el ticket cuando la venta es en efectivo.

El margen del papel se puede ajustar con `HARDWARE_PAPER_TOP_MARGIN` y `HARDWARE_PAPER_BOTTOM_MARGIN`, expresados en lineas de avance antes del contenido y antes del corte.

## Bascula USB o serial

Configura el puerto local de la bascula. En Windows usa el puerto COM visible en el Administrador de dispositivos; en Linux usa `/dev/ttyUSB0` o equivalente:

```env
SCALE_ENABLED=true
SCALE_PORT=COM3
SCALE_BAUD_RATE=9600
SCALE_DATA_BITS=8
SCALE_STOP_BITS=1
SCALE_PARITY=none
SCALE_UNIT=kg
SCALE_READ_TIMEOUT_MS=2500
SCALE_STABLE_READS=2
```

Endpoints protegidos por `X-Agent-Token`:

- `GET /scale/status`: detecta el puerto y devuelve el estado.
- `GET /scale/weight`: espera lecturas consecutivas estables y devuelve gramos y kilogramos.
- `POST /scale/tare`: envia el comando de tara configurado.

La lectura de una bascula desconectada devuelve `SCALE_NOT_CONNECTED`; una lectura variable devuelve `SCALE_UNSTABLE`. El agente no guarda ventas: el frontend debe confirmar primero la venta en el backend y despues solicitar la impresion.

## Integracion frontend y modo offline

El frontend puede instalar este proyecto como dependencia local del POS y usar el cliente:

```js
import { HardwareAgentClient } from 'ssaxxon-pos-hardware-agent/client';

const hardwareAgent = new HardwareAgentClient({
	baseUrl: import.meta.env.VITE_HARDWARE_AGENT_URL || 'http://127.0.0.1:18181',
	token: import.meta.env.VITE_HARDWARE_AGENT_TOKEN
});

// La venta debe estar guardada localmente antes de llamar al agente.
const result = await hardwareAgent.printSale(localSale, { source: 'offline' });
// Persiste result.printStatus y result.drawerStatus por separado.
```

`printSale` acepta los campos `id`/`saleId`, `items` (`name`/`nombreProd`, `quantity`/`cantidad`, `price`/`precio`), `total` y `paymentMethod`/`metodoPago`. Para ventas en efectivo solicita el pulso en la misma peticion de impresion. En una venta online, llama al mismo metodo solo despues de que el backend confirme la venta; el agente no valida ni guarda transacciones.

Ante un error de red, conserva la impresion como pendiente sin revertir la venta. Si no sabes si una solicitud llego a imprimirse, usa `reprintSale(localSale, { source: 'offline' })` al reintentar: envia `type: 'REPRINT'` y nunca abre el cajon. El POS debe persistir el ID local estable y los estados para evitar crear otra venta o disparar otro pulso al sincronizar.

El token de navegador es visible para quien pueda inspeccionar el bundle, por lo que no debe reutilizarse como credencial del backend. Limita cada token a una caja, manten el agente ligado a loopback y configura CORS con el origen exacto del POS.

## API

Todas las rutas salvo `/health` requieren el header `X-Agent-Token`.

- `GET /health`
- `GET /printers`
- `POST /print`
- `POST /drawer/open`
- `POST /test/print`

El cajon debe estar conectado al puerto `DK/RJ11` de la impresora. Una respuesta exitosa de `/drawer/open` confirma que el agente envio el pulso ESC/POS a la cola de impresion; no confirma que el cajon se haya abierto fisicamente. Para diagnosticarlo, revisa `GET /printers` y verifica que muestre la impresora termica esperada; en Windows, el resultado del pulso incluye el transporte y puerto usados. Si el envio termina correctamente pero el cajon no abre, comprueba el cable y el puerto `DK/RJ11`, la configuracion del cajon en la impresora/controlador y el funcionamiento del cajon con la prueba local de la impresora. Las pruebas automatizadas usan un adaptador simulado y no accionan hardware.

La venta debe confirmarse primero en el backend central; el agente solamente ejecuta impresion y hardware local.

## Pruebas

```powershell
npm.cmd test
```
