import assert from 'node:assert/strict';
import { app } from '../app.js';

const main = async () => {
  global.mysqlAvailable = false;
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const adminHeaders = {
    Authorization: 'Bearer demo-token-1',
    'Content-Type': 'application/json'
  };

  try {
    const created = await fetch(`${base}/api/backups`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ format: 'json' })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.data.format, 'json');
    assert.equal(createdBody.data.organizationId, 1);

    const listed = await fetch(`${base}/api/backups`, { headers: adminHeaders });
    assert.equal(listed.status, 200);
    assert.ok((await listed.json()).data.length >= 1);

    const xlsx = await fetch(`${base}/api/backups/${createdBody.data.id}/download?format=xlsx`, { headers: adminHeaders });
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.headers.get('content-type'), /spreadsheetml/);
    assert.match(xlsx.headers.get('content-disposition'), /respaldo-1-1\.xlsx/);

    const restored = await fetch(`${base}/api/backups/${createdBody.data.id}/restore`, {
      method: 'POST',
      headers: adminHeaders
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).data.restored, true);

    const cashier = await fetch(`${base}/api/backups`, {
      headers: { Authorization: 'Bearer demo-token-2' }
    });
    assert.equal(cashier.status, 403);

    const invalidFormat = await fetch(`${base}/api/backups`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ format: 'pdf' })
    });
    assert.equal(invalidFormat.status, 400);
  } finally {
    server.close();
  }

  console.log('backups route test passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
