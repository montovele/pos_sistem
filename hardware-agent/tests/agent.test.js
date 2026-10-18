import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, startAgent } from '../src/agent.js';
import { MockPrinterAdapter } from '../src/printer.js';
import { MockScaleAdapter } from '../src/scale.js';

const config = {
  token: 'test-token',
  allowedOrigins: ['http://localhost:5173'],
  paperColumns: 42,
  printerTransport: 'mock',
  openDrawerOnCash: true,
  scaleEnabled: false
};

const request = async (app, path, options = {}) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-agent-token': 'test-token', ...(options.headers || {}) }
  });
  const body = response.status === 204 ? null : await response.json();
  await new Promise((resolve) => server.close(resolve));
  return { response, body };
};

test('expone health y lista de impresoras', async () => {
  const { app } = createAgent({ config, adapter: new MockPrinterAdapter({ name: 'test-printer' }) });
  const health = await request(app, '/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.printers[0].id, 'test-printer');
});

test('imprime ticket y solicita el pulso ESC/POS de apertura del cajon', async () => {
  const adapter = new MockPrinterAdapter({ name: 'test-printer' });
  const { app } = createAgent({ config, adapter });
  const printed = await request(app, '/print', {
    method: 'POST',
    body: JSON.stringify({ saleId: 1258, ticket: { folio: '1258', paymentMethod: 'cash', items: [{ name: 'Mouse', quantity: 1, price: 100 }], total: 100 } })
  });
  const drawer = await request(app, '/drawer/open', { method: 'POST', body: '{}' });
  assert.equal(printed.response.status, 200);
  assert.equal(printed.body.success, true);
  assert.equal(printed.body.drawer.success, true);
  assert.equal(printed.body.drawer.simulated, true);
  assert.deepEqual(adapter.lastDrawerPulse, { bytes: 5, data: [0x1b, 0x70, 0x00, 0x19, 0xfa] });
  assert.equal(drawer.response.status, 200);
  assert.ok(adapter.lastJob.bytes > 0);
});

test('acepta una instruccion de venta offline directamente desde el frontend', async () => {
  const adapter = new MockPrinterAdapter({ name: 'test-printer' });
  const { app } = createAgent({ config, adapter });
  const result = await request(app, '/print', {
    method: 'POST',
    body: JSON.stringify({
      saleId: 'LOCAL-0042',
      type: 'SALE',
      source: 'offline',
      openDrawer: false,
      ticket: { folio: 'LOCAL-0042', items: [{ name: 'Producto local', quantity: 1, price: 25, total: 25 }], total: 25 }
    })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.print.ok, true);
  assert.equal(result.body.drawer.skipped, true);
  assert.equal(adapter.lastJob.metadata.saleId, 'LOCAL-0042');
});

test('autoriza el preflight CORS del frontend para X-Agent-Token', async () => {
  const { app } = createAgent({ config, adapter: new MockPrinterAdapter() });
  const result = await request(app, '/print', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-agent-token'
    }
  });
  assert.equal(result.response.status, 204);
  assert.equal(result.response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(result.response.headers.get('access-control-allow-headers'), /X-Agent-Token/i);
});

test('no inicia el servicio sin un token local configurado', () => {
  assert.throws(() => startAgent({ config: { ...config, token: '' } }), /HARDWARE_AGENT_TOKEN_REQUIRED/);
});

test('rechaza operaciones sin token', async () => {
  const { app } = createAgent({ config, adapter: new MockPrinterAdapter() });
  const result = await request(app, '/printers', { headers: { 'x-agent-token': '' } });
  assert.equal(result.response.status, 401);
});

test('lee una bascula estable y aplica tara', async () => {
  const scaleAdapter = new MockScaleAdapter();
  const { app } = createAgent({ config: { ...config, scaleEnabled: true }, adapter: new MockPrinterAdapter(), scaleAdapter });
  const weight = await request(app, '/scale/weight');
  const tare = await request(app, '/scale/tare', { method: 'POST', body: '{}' });
  assert.equal(weight.response.status, 200);
  assert.deepEqual(weight.body.data, { weightGrams: 250, weightKg: 0.25, unit: 'KG', stable: true, raw: 'ST,GS,0.250kg' });
  assert.deepEqual(tare.body.data, { tareApplied: true });
});

test('rechaza una lectura inestable', async () => {
  const scaleAdapter = new MockScaleAdapter([
    { weightGrams: 250, weightKg: 0.25, unit: 'KG', stable: false, raw: '250g' },
    { weightGrams: 280, weightKg: 0.28, unit: 'KG', stable: false, raw: '280g' }
  ]);
  const { app } = createAgent({ config: { ...config, scaleEnabled: true }, adapter: new MockPrinterAdapter(), scaleAdapter });
  const result = await request(app, '/scale/weight');
  assert.equal(result.response.status, 422);
  assert.equal(result.body.error, 'SCALE_UNSTABLE');
});
