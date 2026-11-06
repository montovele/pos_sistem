import assert from 'node:assert/strict';
import { authService } from '../services/authService.js';
import { employeeService, findAvailableUsername } from '../services/employeeService.js';
import { transactionService } from '../services/transactionService.js';
import { cajaService } from '../services/cajaService.js';

const main = async () => {
  global.mysqlAvailable = false;

  const existingUsernames = new Set(['cajero']);
  const availableUsername = await findAvailableUsername({
    execute: async (_query, [username]) => [
      existingUsernames.has(username) ? [{ id: 1 }] : [],
      []
    ]
  }, 'cajero', 2);
  assert.equal(availableUsername.username, 'cajero-2', 'Debe asignar un nombre de usuario único para otra organización');

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

  const createdAdmin = await employeeService.create({
    username: 'admin-secundario',
    role: 'admin',
    password: 'temporary-password'
  }, { role: 'superadmin', organizationId: 1 });
  assert.equal(createdAdmin.role, 'admin', 'El superadministrador debe poder crear otro administrador');

  const createdManager = await employeeService.create({
    username: 'gerente-demo',
    role: 'manager',
    password: 'temporary-password',
    organizationId: 999
  }, adminSession);
  assert.equal(createdManager.role, 'manager', 'El administrador debe poder crear roles inferiores');
  assert.equal(createdManager.organizationId, 1, 'El empleado debe quedar en la organización de la sesión y no en la enviada por el formulario');

  const forbiddenAdmin = await employeeService.create({
    username: 'admin-no-autorizado',
    role: 'admin',
    password: 'temporary-password'
  }, adminSession);
  assert.equal(forbiddenAdmin.status, 403, 'Un administrador no debe poder crear otro administrador');

  const forbiddenPromotion = await employeeService.update(createdManager.id, {
    role: 'admin'
  }, adminSession);
  assert.equal(forbiddenPromotion.status, 403, 'Un administrador no debe poder promover a otro usuario a administrador');

  const promotedManager = await employeeService.update(createdManager.id, {
    role: 'admin'
  }, { role: 'superadmin', organizationId: 1 });
  assert.equal(promotedManager.role, 'admin', 'El superadministrador debe poder asignar el rol administrador al editar');

  const unchangedAdmin = await employeeService.update(createdAdmin.id, {
    role: 'admin',
    nombre: 'Administrador secundario'
  }, adminSession);
  assert.equal(unchangedAdmin.role, 'admin', 'Un cambio de datos no debe fallar por mantener el rol actual');

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
