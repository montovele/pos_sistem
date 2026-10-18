import assert from 'node:assert/strict';
import { authService } from '../services/authService.js';
import { employeeService } from '../services/employeeService.js';
import { transactionService } from '../services/transactionService.js';
import { cajaService } from '../services/cajaService.js';

const main = async () => {
  global.mysqlAvailable = false;

  const login = await authService.login({ username: 'admin', password: '1234' }, false);
  assert.equal(login.error, undefined, 'El login demo debe devolver usuario autenticado');
  assert.equal(login.user.organizationId, 1, 'La organización debe venir en la sesión');
  assert.equal(login.user.organizationName, 'Empresa Demo', 'La organización debe incluir nombre');
  assert.equal(login.user.active, true, 'Debe indicar si el usuario está activo');
  assert.equal(login.user.role, 'admin', 'Debe preservar el rol del usuario');

  const employees = await employeeService.list({ organizationId: 1, page: 1, limit: 10 });
  assert.ok(Array.isArray(employees), 'La lista debe devolver un array');
  assert.ok(employees.some((employee) => employee.username === 'admin'), 'Debe incluir al administrador');
  assert.ok(employees.some((employee) => employee.username === 'cajero'), 'Debe incluir al cajero demo');

  const cashierList = await employeeService.list({ organizationId: 1, role: 'cashier', page: 1, limit: 10 });
  assert.ok(cashierList.every((employee) => employee.role === 'cashier'), 'El filtro por rol debe limitar a cajeros');

  const adminSession = { ...login.user, nombreEmpleado: 'Administrador', numeroEmpleado: 1, organizationId: 1 };
  await cajaService.abrir({ baseCaja: 200 }, adminSession);
  const transaction = await transactionService.create({
    items: [{
      product_id: 2,
      nombreProd: 'Monitor 27" Ultra',
      quantity: 1,
      price: 6999,
      discountRate: 0
    }]
  }, adminSession);
  assert.equal(transaction.organizationId, 1, 'La transacción debe quedar asociada a la organización');

  const allTransactions = await transactionService.list({}, { ...adminSession, organizationId: 1 });
  const otherOrgTransactions = await transactionService.list({}, { ...adminSession, organizationId: 2, role: 'admin' });
  assert.ok(allTransactions.some((item) => item.organizationId === 1), 'La organización de la sesión debe filtrar las transacciones');
  assert.ok(otherOrgTransactions.every((item) => item.organizationId === 2 || item.organizationId === undefined), 'No debe verse información de otra organización');

  console.log('organization employees contract test passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
