import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrintJob } from '../client/print-job.js';
import { HardwareAgentClient, HardwareAgentError } from '../client/hardware-agent-client.js';

const offlineSale = {
  id: 'LOCAL-20261001-0042',
  metodoPago: 'efectivo',
  items: [{ nombreProd: 'Producto local', cantidad: 2, precio: 10 }],
  total: 20
};

test('normaliza una venta offline a una instruccion estable y abre una vez para efectivo', () => {
  const job = createPrintJob(offlineSale, { source: 'offline' });
  assert.deepEqual(job, {
    saleId: 'LOCAL-20261001-0042',
    type: 'SALE',
    source: 'offline',
    openDrawer: true,
    ticket: {
      storeName: 'SSAXXON POS',
      folio: 'LOCAL-20261001-0042',
      paymentMethod: 'efectivo',
      items: [{ name: 'Producto local', quantity: 2, price: 10, total: 20 }],
      total: 20
    }
  });
});

test('la reimpresion no vuelve a abrir el cajon', () => {
  const job = createPrintJob(offlineSale, { source: 'offline', type: 'REPRINT', openDrawer: true });
  assert.equal(job.type, 'REPRINT');
  assert.equal(job.openDrawer, false);
});

test('rechaza ventas sin ID estable o productos imprimibles', () => {
  assert.throws(() => createPrintJob({ ...offlineSale, id: undefined }), /saleId es requerido/);
  assert.throws(() => createPrintJob({ ...offlineSale, items: [] }), /incluir productos/);
});

test('envia la venta offline al agente y mantiene estados independientes', async () => {
  let request;
  const client = new HardwareAgentClient({
    token: 'device-token',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        success: true,
        print: { ok: true },
        drawer: { success: true, ok: false, error: 'DRAWER_NOT_CONFIGURED' }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  const result = await client.printSale(offlineSale, { source: 'offline' });
  assert.equal(request.url, 'http://127.0.0.1:18181/print');
  assert.equal(request.options.headers['X-Agent-Token'], 'device-token');
  assert.equal(request.body.saleId, offlineSale.id);
  assert.equal(request.body.source, 'offline');
  assert.equal(result.printStatus, 'printed');
  assert.equal(result.drawerStatus, 'failed');
});

test('informa si falta el token local antes de enviar una peticion', async () => {
  const client = new HardwareAgentClient({ fetchImpl: async () => assert.fail('no debe llamar fetch') });
  await assert.rejects(client.printSale(offlineSale), (error) =>
    error instanceof HardwareAgentError && error.code === 'AGENT_TOKEN_REQUIRED'
  );
});