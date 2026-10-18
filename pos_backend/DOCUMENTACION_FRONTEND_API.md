# Documentación de conexión frontend - Backend POS

## 1. Base URL

```text
http://localhost:3000/api
```

## 2. CORS

El backend permite peticiones desde:

- http://localhost:5173
- http://127.0.0.1:5173
- http://localhost:3000

## 3. Formato de respuesta

Todas las respuestas exitosas siguen este patrón:

```json
{
  "success": true,
  "data": {},
  "message": "Operación exitosa"
}
```

Las respuestas de error siguen este formato:

```json
{
  "success": false,
  "message": "Mensaje descriptivo"
}
```

## 4. Autenticación

El backend usa un token Bearer en el header `Authorization`.

Ejemplo:

```http
Authorization: Bearer demo-token-1
```

### Endpoints de autenticación

#### Login

```http
POST /api/auth/login
Content-Type: application/json
```

Body:

```json
{
  "username": "admin",
  "password": "1234"
}
```

Respuesta esperada:

```json
{
  "success": true,
  "data": {
    "token": "demo-token-1",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@pos.local",
      "nombreEmpleado": "Administrador",
      "numeroEmpleado": 1,
      "role": "admin",
      "photo": ""
    }
  }
}
```

#### Logout

```http
POST /api/auth/logout
```

#### Obtener usuario actual

```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Verificar token

```http
GET /api/auth/verify-token
Authorization: Bearer <token>
```

---

## 5. Productos

### Listado

```http
GET /api/products?page=1&perPage=50&search=camisa&category=1
```

Respuesta:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigoProd": "P001",
      "codigoAltern": "A001",
      "nombreProd": "Producto Demo 1",
      "price": 19.99,
      "stock": 10,
      "org_id": 1,
      "id_category": 1,
      "description": "Producto de prueba 1",
      "image": ""
    }
  ],
  "total": 1,
  "page": 1,
  "perPage": 50,
  "totalPages": 1
}
```

### Buscar por código

```http
GET /api/products/by-code?code=P001
```

### Buscar por categoría

```http
GET /api/products/category/1
```

### Obtener por ID

```http
GET /api/products/1
```

### Actualizar producto

```http
PUT /api/products/1
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "nombreProd": "Nuevo nombre",
  "price": 25.5,
  "stock": 12
}
```

---

## 6. Empleados

### Listado

```http
GET /api/employees
Authorization: Bearer <token>
```

### Crear empleado

```http
POST /api/employees
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "username": "empleado1",
  "nombreEmpleado": "Empleado Uno",
  "numeroEmpleado": 10,
  "role": "cashier",
  "email": "empleado1@pos.local"
}
```

### Actualizar empleado

```http
PUT /api/employees/2
Authorization: Bearer <token>
Content-Type: application/json
```

### Eliminar empleado

```http
DELETE /api/employees/2
Authorization: Bearer <token>
```

---

## 7. Caja

### Estado de caja

```http
GET /api/caja/status
Authorization: Bearer <token>
```

### Abrir caja

```http
POST /api/caja/open
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "montoApertura": 500,
  "cajero": "admin"
}
```

### Cerrar caja

```http
POST /api/caja/close
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "efectivoFinal": 650
}
```

### Arqueo

```http
GET /api/caja/arqueo
Authorization: Bearer <token>
```

### Ventas de caja

```http
GET /api/caja/ventas
Authorization: Bearer <token>
```

---

## 8. Transacciones

### Listado

```http
GET /api/transactions
Authorization: Bearer <token>
```

### Crear transacción

```http
POST /api/transactions
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "items": [
    {
      "id": 1,
      "codigoProd": "P001",
      "nombreProd": "Producto Demo 1",
      "quantity": 2,
      "price": 19.99
    }
  ],
  "total": 39.98,
  "paymentMethod": "cash",
  "employeeNumber": 1
}
```

Respuesta esperada:

```json
{
  "success": true,
  "data": {
    "codigoTransaccion": "TX-1710000000000",
    "codigoTicket": "TICKET-1710000000000",
    "fechaDeTrans": "2026-09-10T00:00:00.000Z",
    "items": [],
    "total": 39.98,
    "nombreCajero": "Administrador",
    "numeroEmpleado": 1,
    "status": "completed",
    "timestamp": 1710000000000,
    "paymentMethod": "cash"
  }
}
```

### Obtener transacción por ID

```http
GET /api/transactions/TX-1710000000000
Authorization: Bearer <token>
```

### Confirmar transacción

```http
POST /api/transactions/TX-1710000000000/confirm
Authorization: Bearer <token>
```

### Cancelar transacción

```http
POST /api/transactions/TX-1710000000000/cancel
Authorization: Bearer <token>
```

---

## 9. Reportes

```http
GET /api/reports?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "totalSales": 1200,
    "totalItems": 30,
    "averageTicket": 40,
    "transactions": [],
    "topProducts": []
  }
}
```

---

## 10. Recomendación de consumo desde frontend

1. Hacer login con el endpoint `/api/auth/login`.
2. Guardar el token en localStorage o memoria.
3. Incluir el header `Authorization: Bearer <token>` en cada petición autenticada.
4. Usar los endpoints de productos para listar, buscar y paginar elementos.
5. En transacciones, enviar `items`, `total`, `paymentMethod` y `employeeNumber`.

Ejemplo en JavaScript:

```js
const login = async () => {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '1234' })
  });

  const data = await res.json();
  localStorage.setItem('token', data.data.token);
  return data;
};
```

Ejemplo con autorización:

```js
const token = localStorage.getItem('token');

const products = await fetch('http://localhost:3000/api/products?page=1&perPage=50', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

---

## 11. Observaciones

- El backend usa modo demo si MySQL no está disponible.
- Cuando MySQL está activo, intenta priorizar la base de datos real.
- Para mayor estabilidad, el frontend debe usar el mismo puerto base: `3000`.

