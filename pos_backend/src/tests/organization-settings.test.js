import assert from 'node:assert/strict';
import { app } from '../app.js';

const request = (server, path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);

const main = async () => {
  global.mysqlAvailable = false;
  const server = app.listen(0);

  try {
    const authenticated = await request(server, '/api/organization/settings', {
      headers: { Authorization: 'Bearer demo-token-1' }
    });
    assert.equal(authenticated.status, 200);
    const authenticatedBody = await authenticated.json();
    assert.equal(authenticatedBody.success, true);
    assert.equal(authenticatedBody.data.general.name, 'Empresa Demo');

    const unauthenticated = await request(server, '/api/organization/settings');
    assert.equal(unauthenticated.status, 401);
  } finally {
    server.close();
  }

  console.log('organization settings route test passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
