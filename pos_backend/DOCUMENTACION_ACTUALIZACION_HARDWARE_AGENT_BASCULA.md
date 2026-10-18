# Actualizacion del Hardware Agent: impresion, cajon y bascula

## Objetivo

Actualizar el agente local de cada caja para integrar en un mismo flujo:

- Impresion de tickets ESC/POS.
- Apertura del cajon de dinero.
- Lectura de peso desde una bascula conectada a la computadora de la caja.
- Comunicacion segura entre el frontend y el agente local.

El agente se ejecuta en la computadora donde esta conectado el hardware. El backend POS central no debe intentar abrir puertos `COM` de la computadora del cliente.

```text
Frontend Vue en la caja
    |
    +--> Backend POS central: ventas, productos e inventario
    |
    +--> http://127.0.0.1:18181: impresion, cajon y bascula
             |
             +--> Impresora termica ESC/POS
             +--> Cajon conectado a la impresora
             +--> Bascula USB, serial o RS-232
```

## Variables de entorno

Crear un archivo `.env` en la instalacion local del agente:

```env
PORT=18181
HARDWARE_AGENT_TOKEN=cambia-este-token-local
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

En Linux, el puerto puede ser similar a `/dev/ttyUSB0`.

El frontend debe usar la misma configuracion del agente:

```env
VITE_API_URL=http://localhost:3000/api
VITE_HARDWARE_AGENT_URL=http://127.0.0.1:18181
VITE_HARDWARE_AGENT_TOKEN=cambia-este-token-local
```

El token de `Authorization: Bearer` del backend y `X-Agent-Token` del agente son credenciales diferentes.

## Contrato de respuestas

Todas las respuestas del agente deben indicar explicitamente el resultado:

```json
{
  "success": true,
  "data": {}
}
```

Los errores deben conservar este formato:

```json
{
  "success": false,
  "error": "SCALE_NOT_CONNECTED",
  "message": "No fue posible leer la bascula"
}
```

## Endpoints del agente

### Salud

```http
GET /health
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "printer": true,
    "drawer": true,
    "scale": true
  }
}
```

### Leer peso

```http
GET /scale/weight
X-Agent-Token: cambia-este-token-local
```

Respuesta con lectura estable:

```json
{
  "success": true,
  "data": {
    "weightGrams": 250,
    "weightKg": 0.25,
    "unit": "KG",
    "stable": true,
    "raw": "ST,GS,0.250kg"
  }
}
```

El agente debe devolver `SCALE_NOT_CONNECTED` si la bascula no esta disponible y `SCALE_UNSTABLE` si la lectura cambia demasiado.

No se debe devolver una lectura como venta si `stable` es `false`.

### Tara de la bascula

```http
POST /scale/tare
X-Agent-Token: cambia-este-token-local
Content-Type: application/json
```

Cuerpo:

```json
{}
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "tareApplied": true
  }
}
```

### Estado de la bascula

```http
GET /scale/status
X-Agent-Token: cambia-este-token-local
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "connected": true,
    "port": "COM3",
    "unit": "KG",
    "stable": true
  }
}
```

### Imprimir ticket

```http
POST /print
X-Agent-Token: cambia-este-token-local
Content-Type: application/json
```

Cuerpo:

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
        "name": "Manzana roja",
        "quantity": 0.25,
        "unit": "KG",
        "unitPrice": 120,
        "subtotal": 30
      },
      {
        "name": "Envase plastico",
        "quantity": 2,
        "unit": "PZA",
        "unitPrice": 5,
        "subtotal": 10
      }
    ],
    "total": 40
  }
}
```

### Abrir cajon

```http
POST /drawer/open
X-Agent-Token: cambia-este-token-local
Content-Type: application/json
```

Cuerpo:

```json
{}
```

La apertura del cajon debe ser independiente de la venta. Si falla la impresora o el cajon, la venta ya confirmada en el backend no debe revertirse.

### Prueba de impresion

```http
POST /test/print
X-Agent-Token: cambia-este-token-local
Content-Type: application/json
```

## Protocolo de bascula

El adaptador de bascula debe ocultar las diferencias entre fabricantes y entregar siempre un objeto comun:

```js
{
  weightGrams: 250,
  weightKg: 0.25,
  stable: true,
  raw: 'ST,GS,0.250kg'
}
```

El adaptador debe:

1. Leer datos del puerto serial.
2. Ignorar caracteres no validos y saltos de linea.
3. Detectar el valor numerico y su unidad.
4. Convertir gramos a kilogramos cuando sea necesario.
5. Rechazar valores negativos, NaN o fuera del limite configurado.
6. Confirmar estabilidad con `SCALE_STABLE_READS` lecturas consecutivas.
7. Aplicar tara cuando se solicite.

Conversiones:

```js
const weightKg = unit === 'g' ? weightValue / 1000 : weightValue;
const weightGrams = Math.round(weightKg * 1000);
```

## Flujo de venta por peso

1. El frontend obtiene el producto mediante `GET /api/products` o `GET /api/products/by-code`.
2. Si el producto contiene `unit: "KG"` y `saleByWeight: true`, muestra el boton `Pesar`.
3. El frontend solicita la lectura a `GET /scale/weight`.
4. El frontend convierte o conserva `weightKg` y muestra el peso al cajero.
5. El frontend envia la venta al backend central:

```json
{
  "items": [
    {
      "productId": 101,
      "quantity": 0.25,
      "unit": "KG",
      "weightGrams": 250
    }
  ],
  "paymentMethod": "cash"
}
```

6. El backend vuelve a consultar el producto y usa su unidad, precio y stock autoritativos.
7. El backend calcula `precioPorKg * cantidadEnKg`.
8. El backend valida el stock en kilogramos y guarda la venta.
9. Solo despues de recibir `success: true`, el frontend solicita la impresion.
10. Si el pago es en efectivo, el frontend solicita la apertura del cajon o envia `openDrawer: true` al endpoint de impresion.

El frontend no debe enviar una lectura de bascula como `quantity: 250` cuando el producto es `KG`. Debe enviar `0.250` kilogramos o `weightGrams: 250` para que el backend haga la conversion.

## Flujo de venta por pieza

Para productos `PZA`:

```json
{
  "productId": 102,
  "quantity": 2,
  "unit": "PZA"
}
```

El backend debe rechazar:

```json
{
  "productId": 102,
  "quantity": 1.5,
  "unit": "PZA"
}
```

## Flujo completo despues del pago

```js
const saleResponse = await apiRequest('/transactions', {
  method: 'POST',
  body: JSON.stringify({ items, paymentMethod })
});

const sale = saleResponse.data;

try {
  await hardwareAgent.print(saleToTicket(sale), {
    saleId: sale.codigoTransaccion,
    openDrawer: paymentMethod === 'cash'
  });
} catch (error) {
  // La venta permanece registrada. Mostrar opcion de reimpresion.
  console.error('Venta guardada, pero fallo el hardware:', error);
}
```

## Seguridad y disponibilidad

- Permitir peticiones CORS solo desde el frontend local esperado.
- Validar `X-Agent-Token` en todos los endpoints excepto `/health` si asi se decide para monitoreo.
- No aceptar comandos de impresion arbitrarios sin autenticacion.
- No guardar la venta en el agente; la fuente de verdad es el backend POS.
- Evitar reintentos automaticos que impriman dos veces el mismo ticket.
- Usar `saleId` y un registro local de trabajos para hacer la impresion idempotente.
- No abrir el cajon dos veces al reintentar una impresion.
- Liberar el puerto serial al apagar el agente.

## Errores recomendados

| Codigo | Significado | Accion del frontend |
|---|---|---|
| `SCALE_NOT_CONNECTED` | Bascula desconectada | Permitir captura manual o impedir venta por peso |
| `SCALE_UNSTABLE` | Peso no estable | Solicitar que se espere una lectura estable |
| `SCALE_INVALID_READING` | Lectura invalida | No agregar el producto |
| `SCALE_TARE_FAILED` | No se pudo aplicar tara | Mostrar error y conservar el peso anterior |
| `PRINTER_NOT_CONNECTED` | Impresora no disponible | Mantener venta y ofrecer reimpresion |
| `DRAWER_OPEN_FAILED` | No se pudo abrir cajon | Mantener venta y mostrar aviso |
| `AGENT_UNAUTHORIZED` | Token incorrecto | Revisar configuracion local |

## Pruebas obligatorias

1. `GET /health` devuelve el estado de impresora, cajon y bascula.
2. Lectura estable de `250 g` devuelve `0.250 KG`.
3. Una lectura inestable devuelve `SCALE_UNSTABLE`.
4. La tara devuelve confirmacion.
5. Un producto `KG` genera una linea con cantidad `0.250`.
6. Un producto `PZA` conserva cantidades enteras.
7. Una venta mixta imprime ambas unidades correctamente.
8. El ticket muestra `KG` para productos por peso y `PZA` para piezas.
9. Una venta confirmada permanece registrada aunque el agente este apagado.
10. Reintentar impresion no abre dos veces el cajon ni duplica el ticket.
11. Un token invalido no puede leer la bascula, imprimir ni abrir el cajon.
12. Desconectar el cable serial devuelve `SCALE_NOT_CONNECTED` sin detener el agente.

## Checklist de actualizacion

- [ ] Agregar adaptador serial de la bascula.
- [ ] Configurar puerto, baud rate, paridad y unidad.
- [ ] Implementar `/scale/weight`, `/scale/tare` y `/scale/status`.
- [ ] Normalizar gramos y kilogramos.
- [ ] Validar estabilidad de lectura.
- [ ] Mantener `/health`, `/print`, `/drawer/open` y `/test/print`.
- [ ] Separar token del backend y token del agente.
- [ ] Implementar impresion idempotente por `saleId`.
- [ ] Probar ventas `KG`, `PZA` y mixtas.
- [ ] Probar desconexion de bascula, impresora y cajon.
- [ ] Distribuir un token diferente por caja.
