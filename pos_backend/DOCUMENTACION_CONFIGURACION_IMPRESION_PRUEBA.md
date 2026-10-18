# Configuración de impresión de prueba

## 1. Objetivo

Configurar la impresión de prueba desde la sección de configuración del frontend usando el agente local de hardware.

La impresora debe estar conectada a la computadora donde se ejecuta el frontend POS. El backend central no necesita acceso directo al USB o al puerto de la impresora.

```text
Frontend Vue
    |
    | http://127.0.0.1:18181
    v
Hardware Agent local
    |
    v
Impresora térmica
```

## 2. Requisitos

- Windows instalado en la computadora de la caja.
- Impresora instalada y visible en Windows.
- Node.js instalado.
- Proyecto del backend disponible localmente.
- Frontend ejecutándose en `http://localhost:5173` o `http://127.0.0.1:5173`.
- Nombre exacto de la impresora.

## 3. Obtener el nombre de la impresora

En Windows abrir:

```text
Configuración > Bluetooth y dispositivos > Impresoras y escáneres
```

Copiar el nombre exacto de la impresora. Ejemplo:

```text
POS-80
```

También puede consultarse con PowerShell:

```powershell
Get-Printer | Select-Object Name, PrinterStatus, WorkOffline
```

## 4. Configuración del Hardware Agent

Crear o actualizar el archivo `.env` en la raíz del backend:

```env
HARDWARE_AGENT_HOST=127.0.0.1
HARDWARE_AGENT_PORT=18181
HARDWARE_AGENT_TOKEN=cambia-este-token-local
HARDWARE_AGENT_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

HARDWARE_PRINTER_TRANSPORT=windows
HARDWARE_PRINTER_NAME=POS-80
HARDWARE_PAPER_COLUMNS=42
HARDWARE_OPEN_DRAWER_ON_CASH=true
```

### Variables principales

| Variable | Descripción |
|---|---|
| `HARDWARE_AGENT_HOST` | Dirección local del agente |
| `HARDWARE_AGENT_PORT` | Puerto del agente, normalmente `18181` |
| `HARDWARE_AGENT_TOKEN` | Token compartido entre frontend y agente |
| `HARDWARE_AGENT_ALLOWED_ORIGINS` | Orígenes permitidos del frontend |
| `HARDWARE_PRINTER_TRANSPORT` | Transporte: `windows`, `tcp` o `mock` |
| `HARDWARE_PRINTER_NAME` | Nombre exacto de la impresora Windows |
| `HARDWARE_PRINTER_HOST` | IP de una impresora ESC/POS de red |
| `HARDWARE_PRINTER_PORT` | Puerto TCP de la impresora, normalmente `9100` |
| `HARDWARE_PAPER_COLUMNS` | Columnas del papel térmico |

## 5. Iniciar el agente

Desde PowerShell, ubicado en el proyecto:

```powershell
npm run agent
```

Debe aparecer un mensaje similar a:

```text
Hardware Agent escuchando en http://127.0.0.1:18181
Transporte de impresora: windows
```

El agente debe permanecer ejecutándose mientras se usa el POS.

## 6. Configuración del frontend

En el proyecto Vue crear o actualizar `.env.development`:

```env
VITE_API_URL=http://localhost:4000/api
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
VITE_HARDWARE_AGENT_TOKEN=cambia-este-token-local
```

El valor de `VITE_HARDWARE_AGENT_TOKEN` debe ser exactamente igual a `HARDWARE_AGENT_TOKEN` del agente.

Después de modificar variables `VITE_*`, reiniciar el servidor del frontend:

```powershell
npm run dev
```

## 7. Cliente frontend requerido

El frontend debe llamar al agente local, no al backend central, para probar la impresora:

```js
const agentUrl = import.meta.env.VITE_HARDWARE_AGENT_URL || 'http://127.0.0.1:18181';
const agentToken = import.meta.env.VITE_HARDWARE_AGENT_TOKEN || '';

export async function testPrinter() {
  const response = await fetch(`${agentUrl}/test/print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': agentToken
    },
    body: '{}'
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) {
    throw new Error(body.detail || body.error || 'No fue posible imprimir la prueba');
  }

  return body;
}
```

El botón de configuración debe ejecutar `testPrinter()` y mostrar:

- éxito: `Impresión de prueba enviada correctamente`;
- error de token: `Token del agente inválido`;
- agente apagado: `No se pudo conectar con el agente local`;
- impresora no disponible: `La impresora no está disponible`.

## 8. Endpoints del agente

### Estado del agente

```http
GET http://127.0.0.1:18181/health
```

No requiere token y responde con el transporte y las impresoras detectadas.

### Listar impresoras

```http
GET http://127.0.0.1:18181/printers
X-Agent-Token: cambia-este-token-local
```

### Imprimir prueba

```http
POST http://127.0.0.1:18181/test/print
X-Agent-Token: cambia-este-token-local
Content-Type: application/json
```

Cuerpo:

```json
{}
```

Respuesta correcta:

```json
{
  "success": true,
  "print": {
    "ok": true,
    "test": true,
    "printer": "POS-80",
    "mocked": false
  }
}
```

## 9. Probar desde PowerShell

Consultar estado:

```powershell
Invoke-RestMethod http://127.0.0.1:18181/health
```

Imprimir prueba:

```powershell
$headers = @{ 'X-Agent-Token' = 'cambia-este-token-local' }
Invoke-RestMethod `
  -Uri http://127.0.0.1:18181/test/print `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body '{}'
```

## 10. Transporte para impresoras de red

Si la impresora es ESC/POS y está conectada por red, usar:

```env
HARDWARE_PRINTER_TRANSPORT=tcp
HARDWARE_PRINTER_HOST=192.168.1.50
HARDWARE_PRINTER_PORT=9100
```

Reiniciar el agente después de cambiar la configuración.

## 11. Modo de prueba sin impresora

Para validar frontend y agente sin enviar papel:

```env
HARDWARE_PRINTER_TRANSPORT=mock
```

La respuesta indicará:

```json
{
  "success": true,
  "print": {
    "ok": true,
    "test": true,
    "mocked": true
  }
}
```

El modo `mock` no debe utilizarse en producción.

## 12. Errores frecuentes

### `Failed to fetch`

El agente no está iniciado o el frontend apunta a una URL incorrecta.

Verificar:

```env
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
```

Y ejecutar:

```powershell
npm run agent
```

### `INVALID_AGENT_TOKEN`

Los tokens no coinciden. Comparar:

```env
HARDWARE_AGENT_TOKEN=...
VITE_HARDWARE_AGENT_TOKEN=...
```

### `PRINTER_UNAVAILABLE`

Revisar:

- impresora encendida;
- impresora instalada en Windows;
- nombre exacto en `HARDWARE_PRINTER_NAME`;
- cola de impresión sin documentos bloqueados;
- transporte configurado como `windows`;
- agente reiniciado después de modificar `.env`.

### `Origen no permitido`

Agregar el origen real del frontend:

```env
HARDWARE_AGENT_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## 13. Checklist de instalación

- [ ] La impresora aparece en Windows.
- [ ] `HARDWARE_PRINTER_NAME` coincide con el nombre de Windows.
- [ ] El token del frontend coincide con el token del agente.
- [ ] El agente inicia en el puerto `18181`.
- [ ] `/health` responde correctamente.
- [ ] El frontend usa `VITE_HARDWARE_AGENT_URL`.
- [ ] La sección de configuración llama `POST /test/print`.
- [ ] La impresión de prueba genera un ticket.
- [ ] El modo `mock` está desactivado en producción.

## 14. Archivos relacionados

- [hardware-agent/server.js](hardware-agent/server.js)
- [DOCUMENTACION_FRONTEND_CONEXION_HARDWARE_AGENT.md](DOCUMENTACION_FRONTEND_CONEXION_HARDWARE_AGENT.md)
- [.env.example](.env.example)
