# Implementación frontend para POS profesional

## 1. Objetivo

Integrar un frontend profesional para un sistema POS con:

- autenticación segura
- ventas con descuentos
- detalle de producto
- inventario
- reportes
- facturación desde el mismo flujo de ventas

La API backend expone endpoints REST con formato estándar:

```json
{
  "success": true,
  "data": {...},
  "message": "Operación exitosa"
}
```

Base URL recomendada:

```text
http://localhost:4080/api
```

---

## 2. Configuración del frontend

### 2.1 Variables de entorno

```env
VITE_API_URL=http://localhost:4080/api
VITE_APP_NAME=POS Professional
VITE_ENV=development
```

### 2.2 Cliente HTTP

Usar Axios o Fetch con un cliente centralizado:

```ts
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

---

## 3. Autenticación

### 3.1 Login

Endpoint:

```http
POST /api/auth/login
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

Guardado en frontend:

```ts
localStorage.setItem('auth_token', response.data.data.token);
localStorage.setItem('user_session', JSON.stringify(response.data.data.user));
```

### 3.2 Verificar sesión

```http
GET /api/auth/verify-token
Authorization: Bearer <token>
```

### 3.3 Usuario actual

```http
GET /api/auth/me
Authorization: Bearer <token>
```

---

## 4. Productos / inventario

### 4.1 Listado

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
      "nombreProd": "Laptop Pro 14",
      "price": 12999,
      "stock": 18,
      "org_id": 1,
      "id_category": 1,
      "description": "Laptop ultraligera para oficina y ventas.",
      "image": "",
      "category": "Tecnología",
      "sku": "LT-14",
      "cost": 9800,
      "unit": "pieza",
      "lowStockThreshold": 5,
      "active": true,
      "discountRate": 8,
      "taxRate": 0.16
    }
  ],
  "total": 1,
  "page": 1,
  "perPage": 50,
  "totalPages": 1
}
```

### 4.2 Buscar por código

```http
GET /api/products/by-code?code=P001
```

### 4.3 Buscar por categoría

```http
GET /api/products/category/1
```

### 4.4 Detalle de producto

```http
GET /api/products/:id
```

### Reglas UI

- Mostrar stock disponible en tiempo real.
- Deshabilitar venta si stock <= 0.
- Mostrar advertencia si stock está bajo el umbral.
- Permitir filtros por categoría y búsqueda por nombre o código.

---

## 5. POS / ventas

### 5.1 Estructura de item

```json
{
  "id": 1,
  "productId": 1,
  "codigoProd": "P001",
  "nombreProd": "Laptop Pro 14",
  "quantity": 1,
  "price": 12999,
  "discountRate": 8,
  "subtotal": 12999,
  "discount": 1039.92,
  "total": 11959.08
}
```

### 5.2 Crear venta / transacción

Endpoint:

```http
POST /api/transactions
Authorization: Bearer <token>
```

Body:

```json
{
  "items": [
    {
      "productId": 1,
      "codigoProd": "P001",
      "nombreProd": "Laptop Pro 14",
      "quantity": 2,
      "price": 12999,
      "discountRate": 10
    }
  ],
  "discount": 5,
  "paymentMethod": "cash",
  "employeeNumber": 1,
  "customer": {
    "nombre": "Consumidor final"
  }
}
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "codigoTransaccion": "TX-172...",
    "codigoTicket": "TICKET-172...",
    "fechaDeTrans": "2026-09-10T00:00:00.000Z",
    "items": [...],
    "subtotal": 25998,
    "discount": 1299.9,
    "total": 24698.1,
    "nombreCajero": "Administrador",
    "numeroEmpleado": 1,
    "status": "completed",
    "paymentMethod": "cash"
  }
}
```

### 5.3 Confirmar transacción

```http
POST /api/transactions/:id/confirm
Authorization: Bearer <token>
```

### 5.4 Cancelar transacción

```http
POST /api/transactions/:id/cancel
Authorization: Bearer <token>
```

### 5.5 Listado de ventas

```http
GET /api/transactions?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
```

---

## 6. Sistema de descuentos

### Regla recomendada para UI

- descuento por producto (line item)
- descuento global para toda la venta
- mostrar subtotal, descuento y total final claramente

### Lógica del cálculo

```ts
const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
const lineDiscount = items.reduce((sum, item) => sum + ((item.price * item.quantity) * (item.discountRate || 0)) / 100, 0);
const globalDiscount = subtotal * (saleDiscountPercent / 100);
const total = subtotal - lineDiscount - globalDiscount;
```

### Campos obligatorios en UI

- `discountRate` por producto
- `discount` o `discountPercent` en la venta
- total final calculado en frontend antes de enviar

---

## 7. Reportes

Endpoint:

```http
GET /api/reports
Authorization: Bearer <token>
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "totalSales": 50000,
    "totalDiscounts": 2500,
    "totalItems": 120,
    "averageTicket": 1250,
    "transactions": [],
    "topProducts": [
      { "name": "Laptop Pro 14", "quantity": 10, "revenue": 129990 }
    ],
    "productCount": 12,
    "lowStockProducts": [
      { "id": 2, "nombreProd": "Monitor 27\" Ultra", "stock": 3 }
    ],
    "cashFlow": {
      "totalSales": 50000,
      "totalDiscounts": 2500,
      "netSales": 47500
    }
  }
}
```

### KPIs recomendados en dashboard

- ingresos del día
- total de transacciones
- promedio por ticket
- descuentos aplicados
- productos con stock bajo
- productos más vendidos

---

## 8. Facturación desde POS

### 8.1 Previsualización de factura

```http
POST /api/facturas/preview
Authorization: Bearer <token>
```

Body:

```json
{
  "cliente": {
    "nombre": "Cliente demo",
    "rfc": "XAXX010101000"
  },
  "items": [
    {
      "productId": 1,
      "nombreProd": "Laptop Pro 14",
      "quantity": 1,
      "price": 12999,
      "discount": 0
    }
  ],
  "paymentMethod": "cash"
}
```

### 8.2 Generar factura desde el flujo actual

```http
POST /api/facturas/generate
Authorization: Bearer <token>
```

Body:

```json
{
  "cliente": {
    "nombre": "Cliente demo",
    "rfc": "XAXX010101000"
  },
  "items": [
    {
      "productId": 1,
      "nombreProd": "Laptop Pro 14",
      "quantity": 1,
      "price": 12999,
      "discountRate": 0
    }
  ],
  "paymentMethod": "cash",
  "discount": 0,
  "tipo": "ingreso",
  "metodoPago": "PUE"
}
```

### 8.3 Obtener factura por ID

```http
GET /api/facturas/:id
Authorization: Bearer <token>
```

### Recomendación UI

- Botón: “Facturar” dentro del checkout.
- Primero generar vista previa.
- Luego confirmar el pago y emitir factura.
- Guardar el comprobante con el número de transacción.

---

## 9. Modelo de estado recomendado en frontend

```ts
interface Product {
  id: number;
  codigoProd: string;
  nombreProd: string;
  price: number;
  stock: number;
  category?: string;
  discountRate?: number;
  taxRate?: number;
}

interface CartItem {
  productId: number;
  codigoProd: string;
  nombreProd: string;
  quantity: number;
  price: number;
  discountRate: number;
  subtotal: number;
  discount: number;
  total: number;
}

interface SalePayload {
  items: CartItem[];
  discount?: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  employeeNumber?: number;
  customer?: Record<string, unknown>;
}
```

---

## 10. Flujo recomendado de UX

1. Login
2. Abrir caja
3. Buscar producto por código o nombre
4. Agregar al carrito
5. Ajustar cantidad y descuento
6. Seleccionar método de pago
7. Revisar subtotal, descuento y total final
8. Confirmar venta
9. Generar factura si aplica
10. Mostrar comprobante y guardar en historial
11. Ver dashboard con reportes

---

## 11. Validaciones frontend importantes

- bloquear compra con cantidad > stock
- no permitir descuento mayor al 100%
- validar tokens expirados
- manejar errores de 401/403 claramente
- mostrar loading states en login, checkout y facturación

---

## 12. Sugerencia de UX visual

Diseño recomendado:

- sidebar de categorías
- listado de productos con stock
- carrito derecho
- resumen de compra arriba o abajo
- tabs: `Productos`, `Ventas`, `Inventario`, `Reportes`, `Facturas`
- color para alerta de stock bajo (`amber/red`)
- dashboard con tarjetas de KPI

---

## 13. Endpoint resumido

```text
POST /api/auth/login
GET /api/auth/me
GET /api/auth/verify-token
GET /api/products
GET /api/products/:id
GET /api/products/by-code
GET /api/products/category/:categoryId
POST /api/transactions
GET /api/transactions
GET /api/transactions/:id
POST /api/transactions/:id/confirm
POST /api/transactions/:id/cancel
GET /api/reports
POST /api/facturas/preview
POST /api/facturas/generate
GET /api/facturas/:id
```

---

## 14. Recomendación final

Para frontend, la mejor implementación es una arquitectura con:

- store centralizado (Pinia/Zustand/Redux)
- módulo de autenticación
- módulo de productos
- módulo de carrito/ventas
- módulo de reportes
- módulo de facturación

Esto permite que el sistema se comporte como un POS profesional, escalable y mantenible.
