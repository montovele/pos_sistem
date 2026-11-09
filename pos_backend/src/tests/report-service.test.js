import test from 'node:test';
import assert from 'node:assert/strict';
import { addTransaction } from '../data/demoData.js';
import { reportService } from '../services/reportService.js';

test('sales reports only include transactions from the authenticated organization', async () => {
  const date = '2026-03-15T12:00:00.000Z';

  addTransaction({
    organizationId: 21,
    codigoTransaccion: 'ORG-21-SALE',
    codigoTicket: 'ORG-21-TICKET',
    fechaDeTrans: date,
    items: [{ productId: 'P-21', nombreProd: 'Producto Org 21', quantity: 2, price: 62.5 }],
    subtotal: 125,
    discount: 5,
    total: 120,
    numeroEmpleado: 7,
    nombreCajero: 'Cajero Org 21',
    status: 'completed',
    paymentMethod: 'cash'
  });
  addTransaction({
    organizationId: 22,
    codigoTransaccion: 'ORG-22-SALE',
    codigoTicket: 'ORG-22-TICKET',
    fechaDeTrans: date,
    items: [{ productId: 'P-22', nombreProd: 'Producto Org 22', quantity: 1, price: 900 }],
    subtotal: 900,
    total: 900,
    numeroEmpleado: 8,
    nombreCajero: 'Cajero Org 22',
    status: 'completed',
    paymentMethod: 'card'
  });

  const report = await reportService.list(
    { startDate: '2026-03-15', endDate: '2026-03-15' },
    { organizationId: 21, numeroEmpleado: 1, role: 'admin' }
  );

  assert.equal(report.totalSales, 120);
  assert.equal(report.totalDiscounts, 5);
  assert.equal(report.totalTransactions, 1);
  assert.deepEqual(report.topProducts.map((product) => product.name), ['Producto Org 21']);
});

test('sales reports reject users without a valid organization', async () => {
  await assert.rejects(
    reportService.list({}, { role: 'admin' }),
    { status: 403, message: 'El usuario no tiene una organización válida' }
  );
});
