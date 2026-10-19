# 🔗 INTEGRACIÓN CON BACKEND EXPRESS (Vue 3)

## 📍 ESTADO ACTUAL

✅ **Frontend:** Vue 3 + Vite + Pinia + Axios  
✅ **Backend:** Express.js en Node.js  
✅ **Arquitectura:** Frontend y backend separados, sin PHP  
✅ **API base:** `http://localhost:4080/api`  
✅ **Base de datos:** MySQL/MariaDB o cualquier motor compatible con Node.js via driver nativo o ORM  

> El proyecto debe ejecutarse exclusivamente con Vue 3 en el frontend y Express como API backend. No se permite depender en PHP ni en archivos `.php`.

---

## 🚀 ARQUITECTURA RECOMENDADA

```text
Vue 3 (Vite)
    ↓ HTTP / Axios
Express API (Node.js)
    ↓ SQL / ORM
MySQL / MariaDB
```

Esto mantiene una separación clara entre:
- Frontend: componentes, stores, router y UI
- Backend: autenticación, productos, ventas, cashflow, reportes
- Persistencia: base de datos relacional

---

## 🛠️ REQUISITOS

- Node.js 18 o superior
- npm
- MySQL o MariaDB (si se requiere persistencia real)
- Editor con soporte para Vue 3

---

## ⚙️ CONFIGURACIÓN DEL FRONTEND

Desde la carpeta del proyecto Vue:

```bash
cd c:\Users\ssaxx\OneDrive\Documents\pos\vue3-app
npm install
```

Asegúrate de que el archivo `.env` tenga esta configuración:

```env
VITE_API_URL=http://localhost:4080/api
VITE_API_TIMEOUT=30000
VITE_APP_NAME="POS System"
VITE_APP_VERSION=1.0.0
VITE_ENV=development
```

Y luego inicia el frontend:

```bash
npm run dev
```

La app quedará disponible en:

```text
http://localhost:5173
```

---

## ⚙️ CONFIGURACIÓN DEL BACKEND EXPRESS

Se recomienda crear un backend separado o un directorio `server/` dentro del proyecto. Ejemplo mínimo:

```bash
cd c:\Users\ssaxx\OneDrive\Documents\pos
npm init -y
npm install express cors dotenv mysql2
```

Archivo ejemplo `server.js`:

```js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API Express funcionando' });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'admin' && password === '1234') {
    return res.json({
      success: true,
      data: {
        token: 'demo-token',
        user: { id: 1, name: 'Administrador', role: 'admin' }
      }
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Credenciales inválidas'
  });
});

app.listen(port, () => {
  console.log(`Servidor Express escuchando en http://localhost:${port}`);
});
```

Inicia el backend con:

```bash
node server.js
```

O bien usando un script desde `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "server": "node server.js"
  }
}
```

---

## 🔌 ENDPOINTS ESTÁNDAR DEL BACKEND

### Health check

```http
GET /api/health
```

Respuesta:

```json
{
  "ok": true,
  "message": "API Express funcionando"
}
```

### Autenticación

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

Respuesta:

```json
{
  "success": true,
  "data": {
    "token": "demo-token",
    "user": {
      "id": 1,
      "name": "Administrador",
      "role": "admin"
    }
  }
}
```

### Productos

```http
GET /api/products
GET /api/products/:id
```

### Ventas / transacciones

```http
POST /api/transactions
GET /api/transactions
```

### Cajero

```http
GET /api/cashier/status
POST /api/cashier/open
POST /api/cashier/close
```

### Reportes

```http
GET /api/reports/sales?from=2026-08-01&to=2026-08-13
```

---

## 📦 CONEXIÓN CON BASE DE DATOS

La capa de persistencia debe ejecutarse desde Express, no desde PHP. Una implementación típica es:

- `mysql2` o `sequelize` para MySQL
- `dotenv` para variables de entorno
- validación de entradas con `express-validator` o similar
- JWT para autenticación con `jsonwebtoken`

Ejemplo de variables de entorno:

```env
PORT=4080
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pos
DB_USER=root
DB_PASSWORD=
JWT_SECRET=supersecretkey
```

---

## 🔐 AUTENTICACIÓN

El frontend guarda el token en `localStorage` o `sessionStorage` y lo manda por cabecera HTTP:

```http
Authorization: Bearer <token>
```

En el backend Express, se valida el token antes de aceptar rutas protegidas.

---

## ⚠️ PROBLEMAS COMUNES Y SOLUCIONES

### 1) Error de CORS

**Síntoma:**
```text
Access to fetch at 'http://localhost:4080/api/...'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solución:**
```js
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
```

---

### 2) Puerto en uso

**Síntoma:**
```text
EADDRINUSE: address already in use
```

**Solución:**
- Cambia el puerto en `.env` o en la configuración del backend
- Verifica que no exista otro proceso escuchando en `3000`

---

### 3) 404 en la API

**Síntoma:**
```text
GET http://localhost:4080/api/products 404
```

**Solución:**
- Revisa que el endpoint exista exactamente en Express
- Confirma que `VITE_API_URL` apunta a `http://localhost:4080/api`
- Asegúrate de haber iniciado el backend

---

### 4) PHP aún presente en la documentación o en el stack

**Regla:**
- No se debe usar `api.php`
- No se debe depender de XAMPP para ejecutar la API
- No se debe documentar rutas como `http://localhost/pos/api.php`

El stack correcto es:

```text
Vue 3 + Vite + Express + Node.js + MySQL
```

---

## 🧪 PRUEBAS DE INTEGRACIÓN

### Test 1: Verificar salud del backend

```bash
curl http://localhost:4080/api/health
```

Debe responder con JSON válido.

### Test 2: Login desde frontend

```javascript
fetch('http://localhost:4080/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: '1234'
  })
})
  .then(r => r.json())
  .then(console.log)
```

### Test 3: Cargar productos

```javascript
fetch('http://localhost:4080/api/products')
  .then(r => r.json())
  .then(console.log)
```

---

## 📱 USO DESDE VUE 3

Ejemplo de llamada a la API desde un servicio:

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4080/api';

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  return res.json();
}
```

Y desde un store o composable:

```ts
const handleLogin = async () => {
  const result = await login('admin', '1234');
  if (result.success) {
    localStorage.setItem('token', result.data.token);
    router.push('/');
  }
};
```

---

## ✅ CHECKLIST FINAL

- [x] Frontend Vue 3
- [x] Backend Express.js
- [x] Sin PHP
- [x] API en `http://localhost:4080/api`
- [x] `.env` apunta a la API Express
- [x] `npm run dev` inicia Vue 3
- [x] `node server.js` o `npm run server` inicia Express
- [x] CORS configurado para Vite en `5173`
- [x] Documentación alineada con el stack real

---

## 🎯 CONCLUSIÓN

La integración correcta para este proyecto es:

- Frontend: Vue 3 + Vite
- Backend: Express.js + Node.js
- Base de datos: MySQL/MariaDB opcional según la lógica de negocio
- Eliminación total de PHP

Este enfoque mantiene el proyecto moderno, escalable y congruente con la arquitectura de Vue 3.

**Última actualización:** Agosto 2026  
**Estado:** 🟢 Stack corregido a Vue 3 + Express sin PHP
