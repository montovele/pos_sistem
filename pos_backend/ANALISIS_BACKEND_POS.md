# Análisis para corregir el backend del POS

## Resumen ejecutivo

El frontend del proyecto ya quedó con una capa offline básica y con una estructura más sólida para persistencia local, pero la integración real con backend sigue fallando por dos motivos principales:

1. La configuración de red del cliente no está alineada con el puerto real del backend.
2. La API del backend no está implementada de forma consistente con la estructura esperada por el frontend.

Esto provoca que la aplicación no pueda enviar ni recibir información del backend, y además se confunda la capa local con la capa remota.

---

## 1. Qué está fallando en el sistema actual

### 1.1 Confusión de configuración de API

Se encontraron referencias históricas a los puertos `3000`, `3001` y `4000`. La configuración actual usa el backend POS en `http://localhost:4080`; Vite mantiene `VITE_API_URL=/api` y reenvía `/api` a `http://127.0.0.1:4080`. Vite prioriza `.env.local`, así que ambos archivos de entorno deben conservar el mismo destino.

Esto genera que el cliente no sepa a qué servidor apuntar. En la práctica, una app puede compilar pero fallar en tiempo de ejecución si la API no está escuchando en el puerto correcto.

### 1.2 Frontend esperando endpoints que backend no ofrece

El frontend usa rutas como:

- `/auth/login`
- `/auth/current-user`
- `/auth/verify-token`
- `/products`
- `/transactions`

Esto requiere que el backend tenga un contrato claro con esos endpoints y con la forma de respuesta esperada:

```json
{
  "success": true,
  "data": {...},
  "message": "..."
}
```

Si el backend devuelve otra estructura o responde con 404/500, el frontend interpreta el resultado como error y nunca llega a completar la operación.

### 1.3 La app intenta usar backend y capa local sin una estrategia clara

Se hizo una mezcla de:

- IndexedDB local
- llamadas directas a Axios
- fallback offline
- proxy de Vite

Sin una regla clara de qué se hace cuando hay conexión y qué se hace cuando no hay conexión, el sistema termina con comportamientos inconsistentes.

---

## 2. Diagnóstico del problema real

El problema no es solo “el backend no funciona”, sino que hay un desalineamiento de capas:

- Frontend no apunta a un backend único
- Vite proxy apunta a una URL distinta de la que realmente usa Axios
- El backend esperado por la app no está implementado o no está levantado en el puerto correcto
- La lógica del frontend asume un contrato de respuesta que no está garantizado del backend

En otras palabras: el sistema está preparado para trabajar con una API Express, pero el backend real no está siendo respetado como una dependencia consistente.

---

## 3. Recomendación técnica para corregir el backend

### 3.1 Estándar de puerto

Usar un único puerto para el backend: `4080`.

```text
http://localhost:4080
```

Con eso, todas las llamadas desde frontend pueden apuntar a la misma base URL.

### 3.2 Contrato de API unificado

El backend debe responder siempre con el mismo formato:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operación exitosa"
}
```

Para errores:

```json
{
  "success": false,
  "message": "Mensaje claro del error"
}
```

Esto permite que el frontend no falle por diferencias de estructura.

### 3.3 Endpoints mínimos necesarios

El backend debe implementar al menos estos endpoints:

#### Autenticación

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/verify-token`

#### Productos

- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/search`
- `GET /api/products/by-code`
- `GET /api/products/category/:categoryId`

#### Transacciones

- `POST /api/transactions`
- `GET /api/transactions`
- `GET /api/transactions/:id`
- `POST /api/transactions/:id/confirm`
- `POST /api/transactions/:id/cancel`

---

## 4. Reglas para el backend

### 4.1 CORS

El backend debe permitir el origen del frontend:

```js
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}))
```

### 4.2 Body parser

Debe aceptar JSON:

```js
app.use(express.json())
```

### 4.3 Respuesta uniforme

Toda respuesta debe seguir una estructura consistente:

```js
res.json({
  success: true,
  data: result,
  message: 'OK'
})
```

### 4.4 Manejo de errores

Cada endpoint debe devolver:

```js
res.status(400).json({
  success: false,
  message: 'Error descriptivo'
})
```

---

## 5. Qué falta para que el backend sea usable

### 5.1 Persistencia real

Aunque la app tiene modo offline, el backend necesita datos reales para:

- autenticación
- inventario
- ventas
- cierre de caja
- reportes

### 5.2 Validación del flujo de login

El frontend guarda el token en `localStorage` con la clave `auth_token`, por lo que el backend debe generar un token autenticado y devolverlo en el login.

### 5.3 Validación de productos

La búsqueda por productos, códigos y categorías depende de una API consistente. Si el backend no expone esos endpoints, la UI queda rota aunque frontend sea correcto.

### 5.4 Manejo de transacciones

Se deben crear y confirmar ventas con payloads compatibles con la estructura del frontend. El payload actual incluye:

```json
{
  "items": [...],
  "total": 350,
  "paymentMethod": "cash",
  "employeeNumber": 12
}
```

El backend debe aceptar ese formato o mapearlo internamente.

---

## 6. Plan recomendado de corrección

### Fase 1: estabilizar red

1. Dejar un único puerto para API: `3000`
2. Unificar `VITE_API_URL`
3. Corregir proxy de Vite
4. Alinear Axios y API base

### Fase 2: estabilizar API

1. Crear endpoints mínimos
2. Crear middleware de errores
3. Devolver un formato uniforme de respuesta
4. Validar CORS y JSON parser

### Fase 3: validar los flujos críticos

1. Login
2. Obtener productos
3. Crear transacción
4. Confirmar transacción
5. Obtener historial

### Fase 4: integrar modo offline

1. Guardar ventas pendientes localmente
2. Reintentar sincronización con backend
3. Mostrar estado visual a usuario

---

## 7. Recomendación concreta para este proyecto

Lo más prudente es construir un backend Express mínimo, con estos módulos:

- `auth.routes.js`
- `products.routes.js`
- `transactions.routes.js`
- `server.js`
- `.env`

Con este patrón:

```js
app.get('/api/products', async (req, res) => {
  try {
    const products = await getProducts()
    res.json({ success: true, data: products, message: 'Productos cargados' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al cargar productos' })
  }
})
```

---

## 8. Conclusión

La solución no debe enfocarse solo en el frontend, sino en el contrato completo entre cliente y backend. Mientras la configuración de red y la estructura de respuestas no sean uniformes, la app seguirá fallando aunque el código del frontend se vea bien.

La corrección real pasa por:

- endpoint único
- puerto único
- respuesta uniforme
- CORS correcto
- backend mínimamente funcional con login, productos y transacciones

Esto es lo que debe corregirse primero antes de seguir mejorando la capa offline.
