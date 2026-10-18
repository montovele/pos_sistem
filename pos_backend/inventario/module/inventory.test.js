import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import * as XLSX from 'xlsx';
import { inventoryImportEngine } from '../engine/importEngine.js';
import { inventoryService } from './inventoryService.js';
import { inventoryRoutes } from './inventory.routes.js';

test('importa CSV con comas entrecomilladas y detecta duplicados', async () => {
  const csv = [
    'sku,nombre,almacen,unidad,stock_actual,precio_venta',
    'SKU-1,"Cafe, molido",PRINCIPAL,PZA,3,10',
    'SKU-1,Otro,PRINCIPAL,PZA,4,11'
  ].join('\n');

  const result = await inventoryImportEngine.importFromCsv(csv);

  assert.equal(result.totalRows, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.rows[0].status, 'duplicate');
  assert.equal(result.rows[0].sku, 'SKU-1');
  assert.equal(result.rows[0].raw.nombre, 'Cafe, molido');
  assert.equal(inventoryImportEngine.parseCsv(csv)[0].raw.nombre, 'Cafe, molido');
});

test('importa filas JSON y rechaza un payload sin arreglo', async () => {
  const result = await inventoryImportEngine.importFromJson([
    { sku: 'SKU-2', nombre: 'Te', unidad: 'KG', stock: 2 }
  ]);

  assert.equal(result.source, 'json');
  assert.equal(result.validRows, 1);
  await assert.rejects(
    inventoryImportEngine.importFromJson({ data: 'no es un arreglo' }),
    /arreglo de registros/
  );
});

test('dry-run no modifica el inventario en memoria', async () => {
  const before = (await inventoryService.list()).total;
  const result = await inventoryService.importRows([{ sku: 'SKU-DRY', name: 'Dry' }]);
  const after = (await inventoryService.list()).total;

  assert.equal(result.dryRun, true);
  assert.equal(before, after);
});

test('el servicio importa solo filas válidas cuando no es dry-run', async () => {
  const before = (await inventoryService.list()).total;
  const rows = inventoryImportEngine.parseJson([
    { sku: 'SKU-IMPORT-VALID', nombre: 'Valido', unidad: 'PZA', stock: 4 },
    { nombre: 'Sin SKU', unidad: 'PZA', stock: 4 }
  ]);
  const validRows = rows.filter((row) => row.valid);
  const result = await inventoryService.importRows(validRows, { dryRun: false });
  const after = (await inventoryService.list()).total;

  assert.equal(result.imported.length, 1);
  assert.equal(after, before + 1);
});

test('la ruta conecta Express, engine y servicio', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/inventario', inventoryRoutes);
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/inventario/import/json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer demo-token-1' },
      body: JSON.stringify({
        dryRun: false,
        rows: [
          { sku: 'SKU-HTTP-TEST', nombre: 'Producto HTTP', unidad: 'PZA', stock: 2 },
          { nombre: 'Fila inválida' }
        ]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.importedRows, 1);
    assert.equal(body.data.imported.length, 1);
  } finally {
    server.close();
  }
});

test('el engine procesa XLSX y aplica validación de archivo', () => {
  const worksheet = XLSX.utils.json_to_sheet([
    { sku: 'SKU-XLSX', nombre: 'Producto XLSX', unidad: 'PZA', stock: 7 }
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const rows = inventoryImportEngine.parseXlsx(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, 'SKU-XLSX');
  assert.equal(rows[0].valid, true);
  assert.throws(
    () => inventoryImportEngine.validateFile({ filename: 'inventario.exe', size: 10 }),
    /Formato no soportado/
  );
  assert.equal(inventoryImportEngine.normalizeRows([{ sku: 'NEG-1', nombre: 'Negativo', stock: -1 }])[0].valid, false);
});

test('acepta unidades de medida ampliadas y normaliza alias', () => {
  const rows = inventoryImportEngine.normalizeRows([
    { sku: 'SKU-M', nombre: 'Metro', unidad: 'm', stock: 3 },
    { sku: 'SKU-ROLLO', nombre: 'Rollo', unidad: 'rollo', stock: 2 },
    { sku: 'SKU-L', nombre: 'Litro', unidad: 'l', stock: 7 },
    { sku: 'SKU-PAQUETE', nombre: 'Paquete', unidad: 'paquete', stock: 5 },
    { sku: 'SKU-ML', nombre: 'Mililitro', unidad: 'ml', stock: 9 },
    { sku: 'SKU-PAR', nombre: 'Par', unidad: 'pares', stock: 4 },
    { sku: 'SKU-INVALID', nombre: 'Unidad inválida', unidad: 'ONZA', stock: 1 }
  ]);

  assert.equal(rows[0].unit, 'M');
  assert.equal(rows[1].unit, 'ROLLO');
  assert.equal(rows[2].unit, 'LT');
  assert.equal(rows[3].unit, 'PAQUETE');
  assert.equal(rows[4].unit, 'ML');
  assert.equal(rows[5].unit, 'PAR');
  assert.equal(rows[6].valid, false);
  assert.match(rows[6].errors[0], /Unidad no soportada/);
});

test('cashier no puede crear inventario', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/inventario', inventoryRoutes);
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/inventario`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer demo-token-2'
      },
      body: JSON.stringify({ sku: 'SKU-FORBIDDEN', name: 'No permitido' })
    });

    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test('admin puede registrar movimientos y actualizar stock en modo demo', async () => {
  const before = await inventoryService.findBySku('SKU-001');
  const beforeStock = Number(before.stock);
  const movement = await inventoryService.createMovement({
    sku: 'SKU-001',
    movementType: 'ENTRY',
    quantity: 3,
    reason: 'Recepción de mercancía'
  }, { user: { id: 1, username: 'admin' }, organizationId: 1 });
  const after = await inventoryService.findBySku('SKU-001');

  assert.equal(movement.stockBefore, beforeStock);
  assert.equal(movement.stockAfter, beforeStock + 3);
  assert.equal(after.stock, beforeStock + 3);
});

test('admin puede consultar el resumen y cashier recibe 403', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/inventario', inventoryRoutes);
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const adminResponse = await fetch(`http://127.0.0.1:${port}/api/inventario/reportes/resumen`, {
      headers: { authorization: 'Bearer demo-token-1' }
    });
    const adminBody = await adminResponse.json();
    const cashierResponse = await fetch(`http://127.0.0.1:${port}/api/inventario/reportes/resumen`, {
      headers: { authorization: 'Bearer demo-token-2' }
    });

    assert.equal(adminResponse.status, 200);
    assert.equal(typeof adminBody.data.totalItems, 'number');
    assert.equal(cashierResponse.status, 403);
  } finally {
    server.close();
  }
});