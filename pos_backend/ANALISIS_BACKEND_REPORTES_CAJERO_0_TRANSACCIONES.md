# Análisis backend: razón por la que el cajero muestra 0 transacciones en reportes

## Síntoma observado

El frontend muestra `0 transacciones encontradas · Cajero: Cajero Cajas`, aunque existen transacciones registradas.

## Flujo real del backend

El servidor activo se inicia desde `server.js` y delega en `src/app.js`. El flujo del reporte es:

1. `GET /api/reports` en `src/routes/reports.routes.js`.
2. `requireAuth` en `src/middleware/auth.js`, que construye `req.user`.
3. `reportService.list(req.query, req.user)` en `src/services/reportService.js`.

La referencia anterior a `backend/server.js` era incorrecta: ese archivo no pertenece al flujo activo del proyecto.

## Autenticación y alcance de datos

`src/middleware/auth.js` admite dos escenarios:

- Sin MySQL: valida tokens con formato `demo-token-<id>` y busca el usuario en `src/data/demoData.js`.
- Con MySQL: valida tokens con formato `db-token-<id>` y consulta la tabla `usuarios`.

En ambos casos, `req.user` contiene `numeroEmpleado` y `role`. El nombre visible, como `Cajero Cajas`, no se usa para comparar transacciones.

En `src/services/reportService.js`, los usuarios que no son administradores se filtran por su número de empleado:

```js
const isAdmin = (user = {}) => String(user.role || '').toLowerCase() === 'admin'
const getEmployeeNumber = (user = {}) => Number(user.numeroEmpleado || user.id || 0)

if (!admin) {
  query += ' AND numero_empleado = ?'
  params.push(numeroEmpleado)
}
```

Después, el servicio vuelve a verificar la misma condición sobre los resultados:

```js
if (!admin) {
  transactions = transactions.filter(
    (item) => Number(item.numeroEmpleado) === numeroEmpleado
  )
}
```

El servicio actual no procesa `cashierId`; solo recibe `startDate` y `endDate`. Por tanto, no es correcto afirmar que el cero sea causado por un `cashierId` enviado por el navegador sin comprobar otra parte del frontend o una versión distinta del backend.

## Causas que pueden producir cero transacciones

El filtro puede devolver cero cuando `req.user.numeroEmpleado` no coincide con `transacciones.numero_empleado`. Debe comprobarse:

1. Que el token identifica al usuario esperado (`demo-token-2` en modo demo o `db-token-<id>` con MySQL).
2. Que `usuarios.numero_empleado` está asignado y es correcto.
3. Que `transacciones.numero_empleado` contiene el mismo número.
4. Que `startDate` y `endDate` incluyen la fecha real de la transacción.
5. Que la fuente de datos contiene registros. En modo demo, `src/data/demoData.js` inicializa `transactions` como un arreglo vacío y solo lo llena al crear una venta durante ese proceso.

El nombre visible `Cajero Cajas` no explica por sí mismo el resultado cero, porque no participa en el filtro.

## Historial de transacciones

`src/services/transactionService.js` aplica la misma regla de acceso: un usuario no administrador solo puede consultar transacciones cuyo `numeroEmpleado` coincide con `req.user.numeroEmpleado`.

El parámetro `cashierId` tampoco se usa allí para ampliar el acceso de un cajero. Si en el futuro se permite seleccionar un cajero desde el panel administrativo, ese filtro debe aplicarse únicamente después de comprobar que el usuario es administrador.

## Corrección recomendada

No se debe filtrar a un cajero por `nombreEmpleado`, `cashierId` del navegador ni valores de `localStorage`. La identidad debe salir de `req.user`:

```js
const employeeNumber = Number(req.user.numeroEmpleado)

if (req.user.role !== 'admin') {
  transactions = transactions.filter(
    (transaction) => Number(transaction.numeroEmpleado) === employeeNumber
  )
}
```

También conviene validar que `employeeNumber` sea un número válido. Convertir un dato ausente en `0` puede ocultar una configuración incorrecta; es preferible rechazar o registrar el usuario si carece de `numeroEmpleado`.

## Comprobación del caso concreto

Para confirmar la causa, hay que revisar temporalmente estos valores al solicitar el reporte:

```js
console.log({
  userId: req.user.id,
  role: req.user.role,
  numeroEmpleado: req.user.numeroEmpleado,
  startDate: req.query.startDate,
  endDate: req.query.endDate
})
```

Después se debe comparar `req.user.numeroEmpleado` con `numero_empleado` de las transacciones y verificar el rango de fechas. Si ambos coinciden, la revisión debe centrarse en la fuente de datos: MySQL puede estar vacío o el modo demo puede no tener transacciones creadas en la ejecución actual.

## Conclusión

El documento anterior atribuía el problema a `cashierId` y citaba un archivo que no corresponde al backend activo. El código actual ya prioriza `req.user.numeroEmpleado` para usuarios no administradores, tanto en reportes como en el historial.

La causa debe verificarse como una discrepancia entre el usuario autenticado, `transacciones.numero_empleado`, el rango de fechas o la fuente de datos utilizada. `Cajero Cajas` es solo un nombre visible y no interviene en el filtrado.