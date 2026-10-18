import assert from 'node:assert/strict';
import { app } from '../app.js';
import { cajaService } from '../services/cajaService.js';

const main = async () => {
  global.mysqlAvailable = false;
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: 'Bearer demo-token-1',
    'Content-Type': 'application/json'
  };
  const user = {
    id: 1,
    username: 'admin',
    nombreEmpleado: 'Administrador',
    numeroEmpleado: 1,
    organizationId: 1,
    role: 'admin'
  };

  try {
    await cajaService.abrir({ baseCaja: 100 }, user);
    const payload = {
      clientTransactionId: 'offline-test-001',
      deviceId: 'device-test-001',
      createdAt: new Date().toISOString(),
      items: [{ product_id: 2, quantity: 1 }],
      paymentMethod: 'cash'
    };

    const first = await fetch(`${base}/api/transactions/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.data.idempotent, false);

    const retry = await fetch(`${base}/api/transactions/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    assert.equal(retry.status, 200);
    const retryBody = await retry.json();
    assert.equal(retryBody.data.idempotent, true);
    assert.equal(retryBody.data.codigoTransaccion, firstBody.data.codigoTransaccion);

    const missingIdentity = await fetch(`${base}/api/transactions/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, clientTransactionId: undefined })
    });
    assert.equal(missingIdentity.status, 400);
  } finally {
    server.close();
  }

  console.log('offline flow test passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
