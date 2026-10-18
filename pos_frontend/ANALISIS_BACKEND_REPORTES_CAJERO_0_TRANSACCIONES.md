# Análisis backend: razón por la que el cajero muestra 0 transacciones en reportes

## Síntoma observado

El frontend muestra:

- `0 transacciones encontradas · Cajero: Cajero Cajas`

Aunque existen transacciones registradas y el backend debería devolver al menos los registros del empleado autenticado.

## Diagnóstico principal

La causa raíz no está en la vista, sino en la capa de autorización y filtrado del backend.

El backend está aplicando el alcance de datos sobre `numeroEmpleado`, pero en varios puntos el valor puede estar llegando desde un origen no confiable o desalineado con la sesión real.

### 1) El backend debe confiar en `req.user`, nunca en valores del navegador

La regla correcta es:

- Si el usuario es `admin`, puede ver todo.
- Si no es `admin`, solo ve transacciones con `numeroEmpleado === req.user.numeroEmpleado`.

Eso es lo que establece la documentación del proyecto.

El error aparece cuando el frontend o el backend no usan la identidad real del usuario autenticado, y se filtra por:

- un `cashierId` del body o query,
- un valor viejo del localStorage,
- o un nombre visible del usuario en lugar del número real del empleado.

---

## Evidencia técnica en el backend actual

En el archivo `backend/server.js` se define este patrón:

```js
const getUserFromToken = (token) => {
  if (!token) return null
  const userId = Number(token.replace('demo-token-', '').split('-')[0])
  return users.find((user) => user.id === userId) || null
}

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader

  if (!token) {
    return fail(res, 401, 'Token requerido')
  }

  const user = getUserFromToken(token)
  if (!user) {
    return fail(res, 401, 'Token inválido o expirado')
  }

  req.user = user
  next()
}
```

Esto es correcto si el token pertenece a un usuario real y la sesión del usuario tiene un `numeroEmpleado` válido.

Pero luego el filtrado del reporte depende de esto:

```js
const cashierId = req.query.cashierId ? Number(req.query.cashierId) : null
const reportTransactions = getVisibleTransactions(req.user).filter((transaction) => {
  const date = new Date(transaction.fechaDeTrans)
  if (startDate && date < startDate) return false
  if (endDate && date > endDate) return false
  if (cashierId && transaction.numeroEmpleado !== cashierId) return false
  return true
})
```

Y también la API de transacciones hace:

```js
const cashierId = req.query.cashierId ? Number(req.query.cashierId) : null

if (isAdmin(req.user) && cashierId) {
  items = items.filter((transaction) => transaction.numeroEmpleado === cashierId)
}
```

### Problema

El valor de `cashierId` es un filtro del navegador. Si el frontend envía un valor inválido, vacío, o un identificador que no coincide con el empleado autenticado, el backend devuelve vacío.

Esto es especialmente crítico si el frontend manda:

- `cashierId` como texto,
- `cashierId` de un usuario previo,
- o un nombre visible del empleado en lugar del número.

La comparación debe ser siempre con `req.user.numeroEmpleado` y no con algo que venga del cliente.

---

## Causa real del caso “Cajero: Cajero Cajas”

El texto que aparece en el frontend es un nombre visual del usuario (`nombreEmpleado`), no el número real de empleado.

Si el sistema hace esto:

- el usuario autenticado tiene `nombreEmpleado: 'Cajero Cajas'`,
- y el frontend envía el nombre o un `cashierId` desalineado,
- el backend compara:

```js
transaction.numeroEmpleado === cashierId
```

con valores que no coinciden, y por eso el conjunto queda en cero.

### Regla de corrección

El backend no debe hacer esto:

```js
if (cashierId && transaction.numeroEmpleado !== cashierId) return false
```

para empleados no administradores.

Debe hacer esto:

```js
const isCashier = req.user.role !== 'admin'

if (isCashier) {
  return transaction.numeroEmpleado === Number(req.user.numeroEmpleado)
}
```

o bien, si existe un `cashierId` explícito solo para admin:

```js
if (req.user.role === 'admin' && cashierId) {
  return transaction.numeroEmpleado === Number(cashierId)
}

if (req.user.role !== 'admin') {
  return transaction.numeroEmpleado === Number(req.user.numeroEmpleado)
}
```

---

## Recomendación de corrección en backend

### A) Normalizar siempre el `numeroEmpleado`

```js
const toEmployeeNumber = (value) => Number(value ?? 0)
```

### B) Filtrar con la sesión autenticada

```js
const getVisibleTransactions = (user) => {
  if (!user) return []

  if (user.role === 'admin') return [...transactions]

  const employeeNumber = Number(user.numeroEmpleado)
  return transactions.filter((transaction) => Number(transaction.numeroEmpleado) === employeeNumber)
}
```

### C) En `/api/transactions` y `/api/reports`

```js
app.get('/api/transactions', authMiddleware, (req, res) => {
  const { startDate, endDate } = req.query
  let items = getVisibleTransactions(req.user)

  if (req.user.role === 'admin') {
    const cashierId = req.query.cashierId ? Number(req.query.cashierId) : null
    if (cashierId) {
      items = items.filter((transaction) => Number(transaction.numeroEmpleado) === cashierId)
    }
  }

  if (startDate || endDate) {
    items = items.filter((transaction) => {
      const fecha = new Date(transaction.fechaDeTrans)
      if (startDate && fecha < new Date(startDate)) return false
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999`)
        if (fecha > end) return false
      }
      return true
    })
  }

  return ok(res, items, 'Historial de transacciones')
})
```

### D) En reportes

```js
app.get('/api/reports', authMiddleware, (req, res) => {
  const startDate = req.query.startDate ? new Date(`${req.query.startDate}T00:00:00`) : null
  const endDate = req.query.endDate ? new Date(`${req.query.endDate}T23:59:59.999`) : null

  let reportTransactions = getVisibleTransactions(req.user)

  if (req.user.role === 'admin') {
    const cashierId = req.query.cashierId ? Number(req.query.cashierId) : null
    if (cashierId) {
      reportTransactions = reportTransactions.filter((transaction) => Number(transaction.numeroEmpleado) === cashierId)
    }
  }

  reportTransactions = reportTransactions.filter((transaction) => {
    const date = new Date(transaction.fechaDeTrans)
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    return true
  })

  const totalSales = reportTransactions.reduce((sum, transaction) => sum + Number(transaction.total || 0), 0)
  const totalItems = reportTransactions.reduce((sum, transaction) => sum + transaction.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0)

  return ok(res, {
    totalSales,
    totalItems,
    averageTicket: reportTransactions.length ? totalSales / reportTransactions.length : 0,
    transactions: reportTransactions,
    topProducts: [],
    timestamp: Date.now()
  }, 'Reporte generado')
})
```

---

## Conclusión

El problema real es este:

- el backend está filtrando por un identificador que puede venir del cliente,
- y no está priorizando `req.user.numeroEmpleado` para usuarios no administradores.

Eso produce el caso de `0 transacciones encontradas` aun cuando el usuario tiene acceso real a datos.

La solución correcta es:

1. reconstruir la identidad del usuario desde el token,  
2. usar `req.user.role` y `req.user.numeroEmpleado`,  
3. convertir ambos a número antes de comparar,  
4. permitir `cashierId` solo para administradores, nunca para cajeros.

Con eso, el reporte del cajero no regresará en blanco y el nombre visible (`Cajero Cajas`) ya no interfiere con el filtrado real.
