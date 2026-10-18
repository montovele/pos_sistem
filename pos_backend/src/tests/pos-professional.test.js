import assert from 'node:assert/strict';
import { authService } from '../services/authService.js';
import { transactionService } from '../services/transactionService.js';
import { cajaService } from '../services/cajaService.js';
import { inventoryService } from '../../inventario/module/inventoryService.js';
import { products } from '../data/demoData.js';

const main = async () => {
  global.mysqlAvailable = false;

  const login = await authService.login({ username: 'admin', password: '1234' }, false);

  assert.equal(login.error, undefined, 'Login demo debe devolver usuario y token');
  assert.ok(login.token && login.token.startsWith('demo-token-'), 'El token demo debe seguir el formato esperado');
  assert.equal(login.user.username, 'admin');

  const admin = { ...login.user };
  await cajaService.abrir({ baseCaja: 500 }, admin);

  const productBefore = products[1].stock;
  await transactionService.create({
    items: [{
      product_id: 2,
      nombre_prod: 'Monitor 27" Ultra',
      quantity: 2,
      price: 6999,
      discountRate: 0
    }]
  }, admin);

  await transactionService.create({
    items: [{
      codigo_altern: 'A002',
      nombre_prod: 'Monitor 27" Ultra',
      quantity: 1,
      price: 6999,
      discountRate: 0
    }]
  }, admin);

  assert.equal(products[1].stock, productBefore - 3, 'Debe descontar el stock en cada transacción acumulando las compras');

  const status = await cajaService.getStatus(admin);
  assert.equal(status.totalVentas, 20997, 'El arqueo debe sumar las ventas de la sesión actual');
  assert.equal(status.totalEfectivo, 20997, 'El arqueo debe separar pagos en efectivo');
  assert.equal(status.totalTransacciones, 2);

  await assert.rejects(
    () => transactionService.create({ items: [] }, { ...admin, numeroEmpleado: 2 }),
    (error) => error.status === 409
  );

  await cajaService.cerrar({ efectivoContado: 21497 }, admin);
  assert.equal((await cajaService.getStatus(admin)).abierta, false);

  await cajaService.abrir({ baseCaja: 100 }, admin);
  const inventoryBefore = await inventoryService.findBySku('SKU-001');
  const inventoryStockBefore = Number(inventoryBefore.stock);
  const inventorySale = await transactionService.create({
    items: [{ sku: 'SKU-001', quantity: 2, price: 1, discountRate: 10 }]
  }, admin);
  const inventoryAfter = await inventoryService.findBySku('SKU-001');

  assert.equal(inventorySale.items[0].price, inventoryBefore.price, 'Debe respetar el precio de inventario');
  assert.equal(inventorySale.items[0].discountRate, 10, 'Debe conservar el descuento porcentual del artículo');
  assert.equal(inventorySale.items[0].discount, 6, 'Debe calcular el descuento sobre el precio real de inventario');
  assert.equal(inventorySale.total, 53.98, 'Debe cobrar el total neto con descuento');
  assert.equal(inventoryAfter.stock, inventoryStockBefore - 2, 'Debe descontar las existencias de inventario');

  await assert.rejects(
    () => transactionService.create({ items: [{ sku: 'SKU-001', quantity: 100, discountRate: 10 }] }, admin),
    (error) => error.status === 409
  );
  assert.equal((await inventoryService.findBySku('SKU-001')).stock, inventoryAfter.stock, 'No debe modificar stock cuando la cantidad excede existencias');

  const linkedInventoryStockBefore = Number((await inventoryService.findBySku('SKU-001')).stock);
  const linkedInventorySale = await transactionService.create({
    items: [{ productId: 1, sku: 'SKU-001', quantity: 1, discountRate: 10 }]
  }, admin);
  assert.equal(linkedInventorySale.items[0].price, 29.99, 'Con productId de catálogo debe priorizar el precio del SKU de inventario');
  assert.equal(linkedInventorySale.total, 26.99, 'Debe aplicar descuento al precio del SKU de inventario');
  assert.equal((await inventoryService.findBySku('SKU-001')).stock, linkedInventoryStockBefore - 1, 'Debe descontar el stock del SKU enlazado');

  console.log('POS demo auth test passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
